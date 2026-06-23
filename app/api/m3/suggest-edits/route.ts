/**
 * POST /api/m3/suggest-edits — Phase 5 改动建议(新 redesigned,2026-06-02)
 *
 * Body:
 *   {
 *     parsedResume,
 *     jdContext?,          // null = 快速模式,做通用 polish
 *     hiddenExperiences?,  // null / [] = 没挖
 *   }
 *
 * 流程:
 *   1. lib/skill-router.ts decideSkillRoute() 决定加载哪些补充 skill 段
 *   2. 主框架 prompt + 路由后的 segments → LLM → JSON edits[]
 *   3. Normalize + 兜底 narrative_tag heuristic
 *
 * 输出 schema(plan §Phase 5 redesigned + 06 §3.4 升级):
 *   {
 *     edits: [
 *       { id, target, original_text, suggested_text, reason, category, priority,
 *         source,            // "jd" | "resume" | "experience" | "interview" — PM §3.4 必填
 *         confidence,        // 0-1 — PM §3.4 必填,< 0.7 只追问不直接写
 *         linked_jd_keyword, // string | null — 对应 diff_metrics.jd_keywords[] 哪个
 *         evidence_source,   // 自由文本(向后兼容)
 *         fab_warning, jd_requirement_text, fixable }
 *     ],
 *     default_accept_count: 3,
 *     optimization_summary: "本次找了 N 处可改",
 *     used_supplements: string[]   // 透明:用了哪几个 skill 段
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { isDemoRequest, demoSleep } from "@/lib/demo-mode";
import m3EditsDemo from "@/lib/demo/linzhou-m3-edits.json";
import m3EditsAfterDemo from "@/lib/demo/linzhou-m3-edits-after.json";
import { goalsToPromptHint, M3_OPTIMIZATION_GOALS, type M3OptimizationGoalKey } from "@/lib/m3-optimization-goals";
import {
  decideSkillRoute,
  inferPersona,
  SKILL_SEGMENTS,
  type SkillSegmentKey,
} from "@/lib/skill-router";
import {
  buildSourceCorpus,
  normalizeEditSuggestions,
} from "@/lib/m3-normalize";
import {
  ensureResumeIds,
  lookupBulletId,
  parseBulletTarget,
} from "@/lib/m3-id-helpers";
import type { ClaimType, EditSuggestion } from "@/components/EditSuggestionCard";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

const PROMPT_MAIN = `你是「Offer 捕手」模块 3 简历整理 Phase 5 改动建议引擎。

【任务】
基于 parsed_resume + jd_context + hidden_experience_candidates,产出 **N 条具体改动建议**(不是整版简历)。用户会在 UI 上**逐条 accept/reject/regen**。

【硬约束 — 永远不许违反(违反 = 用户会反 hallucinate,直接 reject 还会失去信任)】

1. **公司名脱敏**:suggested_text 永不出现公司名(只到"某互联网大厂 / 某短视频公司"等行业类型);用户简历里的真实公司名,你**不要替换原文,也不要自己新增**公司名

2. **Anti-fabrication 4 条铁律**(违反 = 直接被用户识破):
   - 2.1 **不编造用户原始素材里没有的数字 / metric**(原始素材 = parsed_resume + hidden_experience_candidates)
   - 2.2 **不编造用户原始素材里没有的技能 / 工具 / 经验**(eg 简历没 SQL,你不能在 suggested_text 加 SQL,哪怕标"学习中"也不行 — JD 要求 ≠ 用户能力)
   - 2.3 **未完成的项目** 要在 reason 里标 ⚠️ 并降为 medium 优先级
   - 2.4 hidden_experience.anti_fab_note 有的,reason 里必须继承说明

3. **改动建议必须有 evidence_source(每条 edit 必填字段)**:
   - 必须指向 parsed_resume 里某具体字段 / 某条 bullet 原文,或 hidden_experiences[N]
   - **JD 要求(must_have / gaps)不是有效 evidence_source** — JD 是"要什么",不是"你已有什么"
   - 缺 evidence_source 的建议 = fabrication = 严禁

4. **"new:" 新增 target 的额外约束**:
   - 只允许从 **hidden_experience_candidates** 里整理成 bullet(category="hidden-experience-add")
   - 不允许从 JD requirement 凭空补简历缺的(eg "你没做过用户访谈但 JD 要,加一条" ❌)
   - 凭空补的内容,reason 里**必须明示 ⚠️ 这是你想要的方向,但你没真做过,不建议写**,并 priority=low

   ★★★【hidden-experience-add 落点分流 —— 必须先分类再定 target】★★★
   对每条 hidden_experiences[i],先判断它是「真做了项目」还是「只是学习/入门」:
   - **信号**:topic_name 以「补项目·」开头、raw_user_material 有真实成果/产出物 → **项目类**;
     以「补能力·」开头、anti_fab_note 或 honest_use 含"了解/入门/轻量产出"、只有概念没产出 → **学习类**。
   - **项目类** → target = "new:projects[N].bullets";suggested_text 用 **STAR** 组织成一条经历
     (情境→任务→行动→结果一句话讲清)。**结果只用素材里的真实数字,没有就用内联量化占位符,绝不编造。**
   - **学习类**(关键:绝不写成项目!)→ 二选一或都给(各一条 edit):
     · target = "new:skills.tools"(或 .frameworks / .domain):suggested_text = 学到的具体工具/技能/概念词,
       逗号分隔,**只写素材里真出现的**(eg "A/B 测试, 假设检验基础")。
     · target = "new:self_eval.bullets":suggested_text = 一句诚实自我评价
       (eg "系统自学过 X,具备入门级理解,能独立完成基础任务")。
   - **介于之间就低不就高**:拿不准是不是真项目 → 落技能 / 自我评价,不要灌水成项目经历。

5. **ATS 关键词补充(category="ats-keyword")的特殊规则**:
   - **只能改写原文 bullet,在已有动作上加 JD 关键词**(eg 把"分析数据"改成"用 Pandas 做用户行为数据分析")
   - **绝不允许新建 bullet 加 ATS 关键词**(eg "SQL(基础查询,学习中)" ❌ — 用户没说过 SQL)
   - 关键词必须跟用户简历里**已有的动作 / 工具**沾边

6. **文案温和**,不绝对化;每条建议 suggested_text 长度 30-80 字

7. **(2026-06-04 v3 新增)每条 edit 必填 3 个 PM §3.4 字段**(给前端做"AI-HR 视角看得见的能力证明"):
   - **source**(枚举 4 选 1):
     · "jd" = 来源是 JD 分析(只允许 category=gap-alert)
     · "resume" = 来源是用户简历原文(parsed_resume 各 section)
     · "experience" = 来源是 Phase 3 挖掘的隐藏经验(hidden_experiences[*])
     · "interview" = 来源是模块 5 面试回写(localStorage from_debrief_highlight)
   - **confidence**(0-1 浮点):
     · 0.95-1.0 = 简历原文直接证据 / 结构性建议(section-reorder)
     · 0.80-0.94 = 隐藏经验明确,改写有把握
     · 0.70-0.79 = 隐藏经验可推但需用户确认
     · < 0.70 = ⚠️ 信号弱,**只追问不直接写**(fab_warning 必填 + priority=low)
   - **linked_jd_keyword**(string | null):
     · 这条 edit 命中 JD 哪个关键词(选 1 个最相关的;无关 = null)
     · 关键词从你自己识别的 JD 关键词里挑(jd_summary / must_have / jd_requirements_parsed)
     · 不能编造 — 只挑 JD 文本里真有的

8. **(offer-1-sparkling-hippo v4 新增)每条 edit 必填 claim_type**(反编造风险分级,UI 决定要不要默认采纳):
   - **"explicit"**:原文 / 简历已经显式给出该信息(数字也已经在原文里),可以默认 accept
   - **"inferred"**:基于现有素材合理推断(如把"参与"改"主导",但用户没显式说),默认待确认
   - **"needs_confirmation"**:建议里有数字 / 成果需要用户确认(eg 原文只说"做了问卷")
   - **"forbidden"**:你**不要输出 forbidden 的 edit** — 如果你判断这条改动会编造未提供的信息,直接降级为 needs_confirmation 并把数字换成内联占位符
   - **判定原则**:宁可降为 needs_confirmation 也不要冒险标 explicit。explicit 等价于"我担保这是原文已有的事实"

   ★★★【量化占位符规则 — 这是简历变强的核心手段,要积极用,但格式必须对】★★★
   - **何时触发(积极找,不要保守)**:只要某条 bullet 有"可量化的动作 / 产出 / 成果",但原文【没写数字】,就该在那个位置插一个内联占位符让用户补。**这类机会通常很多,逐条扫,不要漏。**
   - **可量化的维度(远不止规模 — 任何能用数字佐证的都算)**:
     · 规模/数量:访谈了【请补充人数】名用户、管理【请补充人数】人团队、覆盖【请补充数量】个城市/客户、处理【请补充数量】个工单
     · 产出量:输出【请补充页数】页报告、发布【请补充篇数】篇文章、交付【请补充数量】个功能模块
     · 效果/提升:转化率提升【请补充百分比】%、效率提高【请补充百分比】%、成本下降【请补充百分比】%、错误率从【请补充】%降到【请补充】%
     · 频率/周期:周更【请补充篇数】篇、【请补充天数】天内上线、【请补充月数】个月完成
     · 金额/营收:带来【请补充金额】营收、节省【请补充金额】成本、管理【请补充金额】预算
     · 时间效率:将耗时从【请补充】缩短至【请补充】
   - **格式铁律**:占位符必须【内联嵌在句中该填数字的位置】+【紧贴单位名词】,让用户一眼知道填什么。形如「动词 +【请补充X】+ 单位名词」(如"访谈【请补充人数】名学生""回收【请补充份数】份问卷")。
   - **绝对禁止**:① 把占位符放句尾、脱离上下文(❌ "…完成产品迭代优化。【请补充具体数字】");② 用孤零零的「【请补充】」「【请补充具体数字】」没有任何名词上下文(❌ 用户不知道填什么)。
   - **唯一不加的情况**:原文该处已经有数字(标 explicit,别动)/ 这个动作天然无法量化 / 自我评价等定性总结。**除此之外,能加就加。**

9. **(offer-1-sparkling-hippo v4 新增)每条 edit 必填 evidence_audit**(可展开的证据审计 — 让评委/用户看到反编造工程):
   - 数组,**默认 1 条**(精简输出),仅在原文 + 隐藏经验都能引时才放 2 条,**永远不要 3 条**
   - 每条 { "source": "jd"|"resume"|"experience"|"interview", "excerpt": "原文片段 ≤ 80 字" }(从 120 字缩到 80 字,防止输出爆量)
   - excerpt 必须**直接复制**自相应来源的实际文本(parsed_resume / hidden_experiences / jd_context / from_debrief_highlight),不要改写
   - 这是 evidence_source 字符串字段的结构化升级版,字符串版仍兼容保留

【category 分类(枚举)】
- "narrative-tools": 责任→成就重写(必须改原文 bullet)
- "ats-keyword": 加 JD must_have 关键词(只能在原文 bullet 里加,不新建)
- "quantification": 量化(只在用户素材里有数字证据时)
- "hidden-experience-add": 把 Phase 3 挖到的 hidden_experience 整理成 bullet 加进简历
- "career-translator": 跨专业 transferable skill 翻译(必须改原文 bullet)
- "tech-deepening": 技术岗 bullet 加深度(架构 / trade-off / metric — 只在用户简历有这些信号时)
- "section-reorder": 章节顺序 / GPA 删除等结构性建议(不增不删 bullet)
- "gap-alert": ★ JD 要求但简历完全没体现的能力/经验,显式列给用户,问他有没有相关经历(2026-06-02 v2 新增)

【gap-alert 特殊规则(category="gap-alert")】
1. 触发条件:对 jd_context.gaps[] 里每个 gap,看 hidden_experiences 是否 cover:
   - cover = hidden_experiences 里有任何 STAR 跟这个 gap 的 jd_requirement 沾边
   - 不 cover → 必须出 1 个 gap-alert
2. 过滤(用户跳过 Phase 3 时):只产 fixable ∈ ["易补<2周", "中等1-2月"] 的 gap-alert
   - fixable=难补≥3月 的 gap → 不产 alert(应去模块 E.2 项目设计)
3. 字段约定:
   - target = "alert:jd_gap_{idx}"(标 alert,不是 bullet path)
   - original_text = "(JD 缺口)"
   - suggested_text = "JD 要求 X,你简历里没体现"(简短描述)
   - evidence_source = "jd_context.gaps[{idx}]" ← 唯一允许 JD 作为 evidence_source 的 category
   - jd_requirement_text = jd_context.gaps[idx].jd_requirement(完整 JD 要求文本)
   - fixable = jd_context.gaps[idx].fixable
   - priority = "medium"(不抢 high priority 改写建议的位置)
4. 不要凭空补 bullet 到简历 — gap-alert 只是提示,UI 上有专门的 3 按钮("我有,补"/"确实没有"/"做项目补"),不会自动应用

【priority 判定】
- high:JD must_have 关键词命中 / 严重 responsibility_driven / hidden_experience 强经验
- medium:能改善但非致命
- low:风格美化 / Anti-fabrication ⚠️ 标记的"未验证"建议

【输出 JSON,严格 — 无 markdown 包裹】
{
  "edits": [
    {
      "id": "edit-001",
      "target": "experience[0].bullets[0]" 或 "projects[1].bullets[2]" 或 "new:projects[2].bullets"(项目类补经历,STAR) 或 "new:skills.tools"/"new:self_eval.bullets"(学习类补经历) 或 "alert:jd_gap_0" (gap-alert),
      "original_text": "用户简历里的原文(target = new: / alert: 时 = '(新增)' / '(JD 缺口)')",
      "suggested_text": "改后的文本 / gap 简短描述",
      "evidence_source": "parsed_resume.experience[0].bullets[0]" 或 "hidden_experiences[2]" 或 "parsed_resume.skills.tools" 或 "jd_context.gaps[0]" (仅 gap-alert),
      "source": "jd" | "resume" | "experience" | "interview",
      "confidence": 0.85,
      "linked_jd_keyword": "数据分析" 或 null,
      "claim_type": "explicit" | "inferred" | "needs_confirmation",
      "evidence_audit": [
        { "source": "resume", "excerpt": "原文片段 ≤ 120 字" },
        { "source": "experience", "excerpt": "..." }
      ],
      "reason": "**1 句 ≤ 50 字**(精简,不要写两句) — 引用 narrative_tag / JD 关键词 / 隐藏经验 / Phase 3 你说没",
      "category": "narrative-tools" | "ats-keyword" | "gap-alert" | ...,
      "priority": "high" | "medium" | "low",
      "fab_warning": null | "⚠️ ...",
      "jd_requirement_text": "(仅 gap-alert,完整 JD 要求)",
      "fixable": "(仅 gap-alert: 易补<2周 / 中等1-2月)",
      "sr_question": null | {
        "type": "数字怎来" | "角色是什么" | "结果是否归你",
        "question": "HR 会问的具体问句 ≤ 40 字",
        "options": ["选项 A", "选项 B", "选项 C", "选项 D"]
      }
    },
    ...
  ],
  "default_accept_count": 3-5,
  "optimization_summary": "本次找了 N 处可改,K 处推荐你优先看",
  "original_issues": [
    "原简历问题 1(针对目标 JD,≤ 40 字,具体指出哪里不足)",
    "原简历问题 2",
    "..."
  ],
  "optimization_directions": [
    "优化方向 1(可执行的改进建议,≤ 40 字)",
    "优化方向 2",
    "..."
  ]
}

【original_issues / optimization_directions 规则(对标竞品"原始简历问题总结/核心优化方向")】
- original_issues:3-7 条,基于 parsed_resume vs jd_context,客观指出原简历针对该 JD 的不足(eg "未体现 X 经验"、"成果描述模糊无量化"、"缺少 JD 要求的 Y 工具")。**anti-fab:只说简历真实的缺,不臆断**
- optimization_directions:3-6 条,对应 issues 给可执行方向(eg "补充 X 的量化产出"、"把 Y 经历用 STAR 重写")。**不要承诺具体数字提升**
- 两者用用户能懂的话,不用内部 jargon

【sr_question 字段规则(Skeptical Recruiter 时机 3)】
- **触发条件**:suggested_text 里有以下任一信号:
  a) 有具体数字但来源不确定(eg "主导 5 人团队" 但实习只有 3 个月)
  b) 有强动词但角色不明(eg "主导" / "独立" 但 claim_type = inferred)
  c) 有成果但归因模糊(eg "提升 30%" 但不清楚是用户贡献还是团队整体)
- **三类问题**(每条 bullet 最多 1 个,按 a→b→c 优先级选最紧迫的):
  · 数字怎来 → question: "这个[具体数字]是你单独统计的?还是团队整体?", options: ["我独立统计","团队数据我占主要贡献","部门整体数字","坦白说我不太确定"]
  · 角色是什么 → question: "你在这件事里具体负责哪部分?", options: ["PM/Owner全权负责","IC负责某个模块","协调者但不做决策","另外说明"]
  · 结果是否归你 → question: "这个提升主要是因为你做了什么?", options: ["主要是我主导的方案","我是关键贡献者之一","团队整体成果","说不太清楚"]
- **不触发 sr_question 的情况**:claim_type=explicit 且 confidence≥0.95 且 suggested_text 无强动词争议
- **最多 3 条 edit 带 sr_question**(防止用户被追问淹没)

【自检 checklist(返 JSON 前内部过一遍)】
□ 每条 edit 都有 evidence_source 指向具体字段
□ "new:" target 只用于 hidden-experience-add 类别
□ suggested_text 里没有用户原始素材没的数字 / 工具 / 经验
□ ats-keyword 类别没新建 bullet,只改写原文
□ 公司名脱敏
□ source / confidence / linked_jd_keyword 三字段都填,confidence ∈ [0, 1]
□ gap-alert 的 source 必须 = "jd";hidden-experience-add 的 source 必须 = "experience"
□ confidence < 0.7 的 edit 必须 fab_warning != null 且 priority = "low"
□ **每条 edit 都填 claim_type**(explicit/inferred/needs_confirmation 三选一,不要输出 forbidden);宁可降级为 needs_confirmation
□ **每条 edit 都填 evidence_audit**(数组,1-3 条,excerpt 必须是真实原文片段,不要改写)
□ **sr_question 最多出现在 3 条 edit 里**;触发条件不满足则 sr_question = null

【信息密度铁律(2026-06-07 重要 — 防过度压缩)】
- **提升信息密度 ≠ 删信息**。原文已经信息丰富(有具体数字 / 方法 / 洞察 / 链路)的 bullet,**必须保留这些有效细节**,只做表达优化 + 关键词补充,改后**不能比原文更短到丢信息**
- 只有"啰嗦 / 重复 / 低密度"的 bullet 才精简
- **绝不删除原文里的关键洞察 / 量化 / 专业细节**(eg "$3000 门槛""意图理解→自动执行链路""10 个用户故事")— 这些正是简历的竞争力
- 不要把原文没有的交付物凭空补上(eg 原文没说"8 页报告"就别加)

【改写手法 — 把经历"拔高",不是删短(对标资深简历顾问)】
- **强动词领头、框定角色**:用「主导 / 负责 / 牵头 / 统筹 / 设计并落地」开头替代弱表达(参与 / 做了 / 帮忙 / 完成)—— 但只在角色真实(claim_type 允许)时;角色存疑就走 inferred + sr_question 让用户确认,不硬安。
- **保留全部亮点并接业务价值**:原文的量化、方法、链路、独特点(如"首个将 X 应用于 Y""$3000 门槛""意图理解→自动执行链路")一个都不能丢,并自然接上业务价值 / 对应的 JD 职责。
- **自然融入 JD 关键词**,不堆砌。
- 标准:每条读起来像被招聘顾问润色过 —— 信息更密、角色更清晰、和 JD 更贴,**而不是"原文删短版"**。

【覆盖度铁律 — 不许只改一个板块】
- **每一段实习/工作、每一个项目/科研、自我评价 —— 只要有可改进处,都至少出 1 条建议**,把"改写"铺满全简历,不要把预算都花在最丰富的那段实习上。
- 一段经历里有多条 bullet 都值得改 → 多出几条;但**先保证每个板块都被覆盖**,再在重点板块加密。
- 自检:输出前确认 edits 覆盖了 ≥ 大部分有内容的板块(实习 / 项目 / 科研 / 自我评价),漏了就补。
- **输出顺序 = 先覆盖后加密**:先让每个板块各出 1 条(按板块轮流排在最前面),再回头给重点板块补第 2、3 条。这样即使输出被截断,也是丢"密度"而不是丢整个板块。

【数量与长度(防截断,但绝不靠压缩内容)】
- 数量:**由简历内容决定,通常 8-15 条**(板块多就多出);质量优先,但不许为省条数漏板块。
- suggested_text:**把原文所有亮点全保留 + 升华表达,通常 ≥ 原文长度或相当**;只有啰嗦/重复/低密度的才精简 / reason ≤ 50 字 / evidence_audit 默认 1 条且 excerpt ≤ 80 字
- high priority 占 30-50%
- 仅当**真的**接近 8K token 上限时才减少条数(且优先减重复板块的次要 bullet,绝不整段不覆盖)——内容完整 > 条数多,但**覆盖全板块 > 单条极致**`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { parsedResume, jdContext, hiddenExperiences, fromDebriefHighlight, optimizationGoals } = body;

    // 演示账号:返回冻结的林舟改写建议(2.5s 假思考)
    // 预置「前/后」两态:hiddenExperiences 非空 = 已从 m4 补项目回流 → 返回「缺口已补」态;否则返回现场版
    if (await isDemoRequest(request)) {
      await demoSleep(2500);
      const backfilled = Array.isArray(hiddenExperiences) && hiddenExperiences.length > 0;
      return NextResponse.json(backfilled ? m3EditsAfterDemo : m3EditsDemo);
    }

    if (!parsedResume) {
      return NextResponse.json({ error: "parsedResume required" }, { status: 400 });
    }

    // P0-B(offer-1-sparkling-hippo):server 端也做一次 ensureResumeIds,
    // 即使前端老数据没 id 也能给 edits 注入 bullet_id。幂等,不破坏已有 id。
    const parsedResumeWithIds = ensureResumeIds(parsedResume);

    // === Step 1: skill router 决定加载哪几段 ===
    const persona = inferPersona(parsedResume, jdContext ?? null);
    const targetRoleText = jdContext
      ? `${jdContext.jd_summary ?? ""} ${(jdContext.must_have ?? []).join(" ")}`
      : null;
    const resumeState = parsedResume?.meta?.narrative_tag_distribution ?? {};

    const route = decideSkillRoute({
      persona,
      targetRoleText,
      resumeState,
    });

    // === Step 2: 拼 system prompt ===
    const segmentsText = route
      .map((k) => SKILL_SEGMENTS[k as SkillSegmentKey])
      .join("\n");

    const activeOptimizationGoals: M3OptimizationGoalKey[] =
      Array.isArray(optimizationGoals) && optimizationGoals.length > 0
        ? optimizationGoals
        : (M3_OPTIMIZATION_GOALS.map((g) => g.key) as M3OptimizationGoalKey[]);

    const systemPrompt = `${PROMPT_MAIN}

【动态加载的补充 skill 段(基于 persona=${persona} + target_role + resume_state 路由)】
${segmentsText}

【路由决策(给你 metadata,不要输出给用户)】
- inferred_persona: ${persona}
- used_supplements: ${JSON.stringify(route)}
- has_jd: ${jdContext ? "yes" : "no(快速模式 - 只做通用 polish,不针对 JD 关键词)"}
- has_hidden_experiences: ${
      Array.isArray(hiddenExperiences) && hiddenExperiences.length > 0 ? "yes" : "no"
    }${goalsToPromptHint(activeOptimizationGoals)}`;


    // 3 层兜底:R1 max_tokens 8000 → R1 rescueJson(被截断时挽救能用部分)
    // → R2 retry with 缩短 prompt + 6-10 条 edits + 8000 tokens
    // 跟 evidence-parse 同思路 — 永不 502
    async function callLlm(opts: {
      sys: string;
      usr: string;
      max: number;
    }): Promise<string> {
      return chat(
        [
          { role: "system", content: opts.sys },
          { role: "user", content: opts.usr },
        ],
        { model: "chat", temperature: 0.4, max_tokens: opts.max, jsonMode: true },
      );
    }

    /** 从被截断的 JSON 里挽救:找 `"edits": [` 起的所有完整 object,丢弃尾部不完整的 */
    function rescueEdits(rawStr: string): Record<string, unknown> | null {
      try {
        const editsIdx = rawStr.indexOf('"edits"');
        if (editsIdx < 0) return null;
        const arrStart = rawStr.indexOf("[", editsIdx);
        if (arrStart < 0) return null;
        // 扫 array,记录每个 obj 完整边界
        let depth = 0;
        let objStart = -1;
        const completedObjs: string[] = [];
        let inString = false;
        let escaped = false;
        for (let i = arrStart + 1; i < rawStr.length; i++) {
          const ch = rawStr[i];
          if (escaped) {
            escaped = false;
            continue;
          }
          if (ch === "\\") {
            escaped = true;
            continue;
          }
          if (ch === '"') {
            inString = !inString;
            continue;
          }
          if (inString) continue;
          if (ch === "{") {
            if (depth === 0) objStart = i;
            depth++;
          } else if (ch === "}") {
            depth--;
            if (depth === 0 && objStart >= 0) {
              completedObjs.push(rawStr.slice(objStart, i + 1));
              objStart = -1;
            }
          } else if (ch === "]" && depth === 0) {
            break;
          }
        }
        if (completedObjs.length === 0) return null;
        const editsArr: unknown[] = [];
        for (const objStr of completedObjs) {
          try {
            editsArr.push(JSON.parse(objStr));
          } catch {
            /* 单个 obj 也烂了就跳过 */
          }
        }
        if (editsArr.length === 0) return null;
        return {
          edits: editsArr,
          default_accept_count: Math.min(3, editsArr.length),
          optimization_summary: `本次挽救出 ${editsArr.length} 处建议(LLM 输出被截断,部分内容已丢弃)`,
        };
      } catch {
        return null;
      }
    }

    // ====== 按板块并行 fan-out(根治 8K 输出上限 vs 覆盖度的矛盾)======
    // 每个 bullet 板块(实习/项目/活动)独立一次满额 8K 调用 → 全覆盖、不截断、不丢深度;
    // 并行跑 → 延迟≈单次。诊断(issues/directions)单独一小调用。前端零改动。
    const BULLET_SECTIONS = ["experience", "projects", "activities", "self_eval"] as const;
    const SECTION_CN: Record<string, string> = {
      experience: "实习/工作经历",
      projects: "项目/科研经历",
      activities: "社团/活动经历",
      self_eval: "自我评价",
    };
    const pr = parsedResume as Record<string, unknown>;
    const activeBuckets = BULLET_SECTIONS.filter((s) => {
      const arr = pr[s];
      return Array.isArray(arr) && arr.length > 0;
    });

    // 只保留 keep 板块的 array(其余清空,保住 target 索引 + basic/skills/education 作上下文)
    function scopedResumeFor(keep: string): Record<string, unknown> {
      const r = { ...pr };
      for (const s of BULLET_SECTIONS) if (s !== keep) r[s] = [];
      return r;
    }

    // 自我评价是【定性总结】,不是成果 bullet → 单独约束,禁止套用量化/数字规则
    const SELF_EVAL_RULE = `

【自我评价板块特殊铁律 — 必须遵守】
- 自我评价是【定性能力总结】(如"具备…能力""擅长…"),**不是成果型 bullet**。
- **绝对禁止**:加数字 / 加数字占位符【请补充】/ category 用 "quantification" / claim_type 用 "needs_confirmation"。自我评价里加数字既不真实也没地方填,用户会困惑。
- **只做**:润色成更专业自然的书面语 + 用强动词 + 自然融入简历里【真实已有】的技能/工具/JD 关键词(简历没有的绝不加)。
- claim_type 只能是 "explicit"(原文已表达)或 "inferred"(基于简历技能合理润色)。category 用 "narrative-tools" 或 "ats-keyword"。`;

    // 单板块调用(含 parse + rescue),返回该板块 edits[]
    async function callBucket(keep: string): Promise<Record<string, unknown>[]> {
      const usr = `parsed_resume(**本次只改「${SECTION_CN[keep] ?? keep}」板块的 bullet**;其它板块数组已清空、仅 basic/skills/education 作上下文):
${JSON.stringify(scopedResumeFor(keep), null, 2)}

jd_context(JD 拆解;null 表示快速模式):
${JSON.stringify(jdContext ?? null, null, 2)}

【本次任务】只**改写**「${SECTION_CN[keep] ?? keep}」板块里【已有的】 bullet(target 必须是 ${keep}[i].bullets[j]);**把该板块每条值得改的 bullet 都改到,一条都不要漏**。
**不要新增 bullet、不要把外部素材塞进已有 bullet**(补经历/挖经历/面试带来的新素材由专门步骤处理,不在本板块)。不要产 original_issues / optimization_directions / gap-alert。${keep === "self_eval" ? SELF_EVAL_RULE : ""}
返 JSON。`;
      try {
        const raw = await callLlm({ sys: systemPrompt, usr, max: 8000 });
        let p: Record<string, unknown> | null = null;
        try {
          p = JSON.parse(raw);
        } catch {
          p = rescueEdits(raw);
        }
        return p && Array.isArray(p.edits) ? (p.edits as Record<string, unknown>[]) : [];
      } catch (err) {
        console.error(`[suggest-edits] bucket ${keep} 失败:`, err);
        return [];
      }
    }

    // 专用桶:把补经历/挖经历/面试带来的 hidden_experience 整理成「new: 新增」落点建议
    // (项目类→new:projects STAR / 学习类→new:skills/new:self_eval)。
    // 与板块桶分离 → 不再被塞进无关的已有 bullet,也不会因相关板块为空而丢失。
    async function callHiddenBucket(): Promise<Record<string, unknown>[]> {
      if (!Array.isArray(hiddenExperiences) || hiddenExperiences.length === 0)
        return [];
      const usr = `parsed_resume(全简历,仅作上下文 + 去重依据;**本次绝不改这里的已有 bullet**):
${JSON.stringify(parsedResume, null, 2)}

jd_context(JD 拆解;null 表示快速模式):
${JSON.stringify(jdContext ?? null, null, 2)}

hidden_experience_candidates(来自补经历 / 挖经历 / 面试回流 —— **本次只处理这些**):
${JSON.stringify(hiddenExperiences, null, 2)}

【本次任务】只为上面 hidden_experience_candidates 里**每一条**产出 hidden-experience-add 类 edit,按【hidden-experience-add 落点分流】规则:
- 项目类(topic_name 以「补项目·」、有真实成果/产出物)→ target="new:projects[N].bullets",suggested_text 用 STAR 组织,结果只用素材里的真实数字、没有就用内联占位符,绝不编造。
- 学习类(topic_name 以「补能力·」、anti_fab_note/honest_use 含"了解/入门")→ target="new:skills.tools"(或 .frameworks/.domain,只写素材真出现的技能)和/或 target="new:self_eval.bullets"(一句诚实自我评价)。
- 每条 edit 必填:category="hidden-experience-add"、evidence_source="hidden_experiences[N]"、original_text="(新增)"。
- **不要改任何已有 bullet,不要产 gap-alert / original_issues / optimization_directions。**
返 JSON。`;
      try {
        const raw = await callLlm({ sys: systemPrompt, usr, max: 4000 });
        let p: Record<string, unknown> | null = null;
        try {
          p = JSON.parse(raw);
        } catch {
          p = rescueEdits(raw);
        }
        return p && Array.isArray(p.edits) ? (p.edits as Record<string, unknown>[]) : [];
      } catch (err) {
        console.error("[suggest-edits] hidden bucket 失败:", err);
        return [];
      }
    }

    // 诊断小调用:original_issues + optimization_directions(全简历,输出短不会截断)
    async function callDiagnostics(): Promise<{ issues: string[]; directions: string[] }> {
      const diagSys = `你是简历诊断官。基于 parsed_resume + jd_context,**只**产出 JSON(不产 edits):
{ "original_issues": ["原简历针对目标 JD 的问题,≤40字,3-7条"], "optimization_directions": ["可执行优化方向,≤40字,3-6条,不承诺具体数字提升"] }`;
      const usr = `parsed_resume:
${JSON.stringify(parsedResume, null, 2)}

jd_context:
${JSON.stringify(jdContext ?? null, null, 2)}

返 JSON。`;
      try {
        const raw = await callLlm({ sys: diagSys, usr, max: 1200 });
        const p = JSON.parse(raw) as Record<string, unknown>;
        return {
          issues: Array.isArray(p.original_issues) ? p.original_issues.map(String) : [],
          directions: Array.isArray(p.optimization_directions)
            ? p.optimization_directions.map(String)
            : [],
        };
      } catch (err) {
        console.error("[suggest-edits] diagnostics 失败:", err);
        return { issues: [], directions: [] };
      }
    }

    let parsed: Record<string, unknown> | null = null;
    const rescued = false;

    const [bucketEditArrays, hiddenEdits, diag] = await Promise.all([
      Promise.all(activeBuckets.map((s) => callBucket(s))),
      callHiddenBucket(),
      callDiagnostics(),
    ]);

    const mergedEdits = [...bucketEditArrays.flat(), ...hiddenEdits];
    mergedEdits.forEach((e, i) => {
      e.id = `edit-${String(i + 1).padStart(3, "0")}`; // 跨板块统一重编号,不撞 id
    });

    if (mergedEdits.length > 0) {
      parsed = {
        edits: mergedEdits,
        original_issues: diag.issues,
        optimization_directions: diag.directions,
        default_accept_count: Math.min(3, mergedEdits.length),
        optimization_summary: `本次找了 ${mergedEdits.length} 处可改(覆盖 ${activeBuckets.length} 个板块)`,
      };
    }

    // 全部板块都没产出 → placeholder,让前端不卡死
    if (!parsed) {
      console.error("[suggest-edits] fan-out 全板块无产出");
      parsed = {
        edits: [
          {
            id: "edit-fallback-001",
            target: "experience[0].bullets[0]",
            original_text: "(AI 暂时无法分析,请稍后重试)",
            suggested_text: "AI 服务暂时繁忙,请点击右上「重试」按钮再试一次",
            evidence_source: "fallback",
            source: "resume",
            confidence: 0.5,
            linked_jd_keyword: null,
            claim_type: "needs_confirmation",
            evidence_audit: [],
            reason: "AI 服务异常,这是占位提示。点重试可再次尝试。",
            category: "narrative-tools",
            priority: "low",
            fab_warning: "⚠️ AI 服务异常",
            jd_requirement_text: null,
            fixable: null,
          },
        ],
        default_accept_count: 0,
        optimization_summary: "⚠️ AI 服务繁忙,请点重试再来一次",
      };
    }

    if (rescued) {
      // 告诉前端是 rescue 出来的(可选展示提示)
      (parsed as Record<string, unknown>)._rescued = true;
    }

    // Normalize edits
    const VALID_CAT = [
      "narrative-tools", "ats-keyword", "quantification", "hidden-experience-add",
      "career-translator", "tech-deepening", "section-reorder", "gap-alert",
    ];
    const VALID_PRIORITY = ["high", "medium", "low"];
    const VALID_FIXABLE = ["易补<2周", "中等1-2月", "难补≥3月"];
    const VALID_SOURCE = ["jd", "resume", "experience", "interview"] as const;
    const VALID_CLAIM_TYPE: readonly ClaimType[] = [
      "explicit",
      "inferred",
      "needs_confirmation",
      "forbidden",
    ] as const;
    type SourceTag = (typeof VALID_SOURCE)[number];

    function inferClaimType(rawClaim: unknown, fabWarning: string | null, confidence: number): ClaimType {
      if (
        typeof rawClaim === "string" &&
        (VALID_CLAIM_TYPE as readonly string[]).includes(rawClaim)
      ) {
        return rawClaim as ClaimType;
      }
      if (fabWarning) return "needs_confirmation";
      if (confidence >= 0.9) return "explicit";
      if (confidence >= 0.75) return "inferred";
      return "needs_confirmation";
    }

    function normalizeEvidenceAudit(
      rawAudit: unknown,
      sourceTag: SourceTag,
      evidenceSource: string,
    ): Array<{ source: SourceTag; excerpt: string }> {
      if (!Array.isArray(rawAudit)) {
        // 兜底:从 evidence_source 字符串构造一条
        if (evidenceSource) {
          return [{ source: sourceTag, excerpt: evidenceSource.slice(0, 120) }];
        }
        return [];
      }
      return rawAudit
        .map((it) => {
          const obj = it as Record<string, unknown>;
          const src =
            typeof obj.source === "string" && (VALID_SOURCE as readonly string[]).includes(obj.source)
              ? (obj.source as SourceTag)
              : sourceTag;
          const ex = typeof obj.excerpt === "string" ? obj.excerpt.slice(0, 200) : "";
          return { source: src, excerpt: ex };
        })
        .filter((it) => it.excerpt.length > 0)
        .slice(0, 3);
    }

    // 兜底:从 category + evidence_source 推断 source
    function inferSource(cat: string, evidenceSource: string, raw: unknown): SourceTag {
      if (typeof raw === "string" && (VALID_SOURCE as readonly string[]).includes(raw)) {
        return raw as SourceTag;
      }
      if (cat === "gap-alert") return "jd";
      if (cat === "hidden-experience-add") return "experience";
      const es = evidenceSource.toLowerCase();
      if (es.includes("hidden_experience")) return "experience";
      if (es.includes("from_debrief") || es.includes("interview")) return "interview";
      return "resume";
    }

    // 兜底:从 category + priority 推断 confidence
    function inferConfidence(cat: string, priority: string, fabWarning: string | null, raw: unknown): number {
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? parseFloat(raw) : NaN;
      if (Number.isFinite(n) && n >= 0 && n <= 1) return Math.round(n * 100) / 100;
      // fallback heuristic
      if (fabWarning) return 0.55;
      if (cat === "section-reorder") return 0.95;
      if (cat === "gap-alert") return 0.5;
      if (cat === "hidden-experience-add") return priority === "high" ? 0.82 : 0.72;
      if (priority === "high") return 0.88;
      if (priority === "low") return 0.65;
      return 0.78;
    }

    const editsRaw = Array.isArray(parsed.edits) ? parsed.edits : [];
    let filteredOutCount = 0;
    const filterReasons: string[] = [];

    const edits = editsRaw
      .map((e, i: number) => {
        const el = e as Record<string, unknown>;
        const cat = VALID_CAT.includes(el.category as string) ? (el.category as string) : "narrative-tools";
        const pri = VALID_PRIORITY.includes(el.priority as string) ? (el.priority as string) : "medium";
        const target = String(el.target ?? "");
        const evidenceSource = String(el.evidence_source ?? "");
        const suggestedText = String(el.suggested_text ?? "");
        const fabWarning = el.fab_warning ? String(el.fab_warning) : null;
        const jdReqText = el.jd_requirement_text ? String(el.jd_requirement_text) : null;
        const fixable = VALID_FIXABLE.includes(el.fixable as string) ? String(el.fixable) : null;
        const source = inferSource(cat, evidenceSource, el.source);
        const confidence = inferConfidence(cat, pri, fabWarning, el.confidence);
        const linkedKeyword =
          typeof el.linked_jd_keyword === "string" && el.linked_jd_keyword.trim()
            ? el.linked_jd_keyword.trim()
            : null;

        const claimType = inferClaimType(el.claim_type, fabWarning, confidence);
        const evidenceAudit = normalizeEvidenceAudit(el.evidence_audit, source, evidenceSource);
        // P0-B(offer-1-sparkling-hippo):根据 target 反查 parsedResume 中对应 bullet 的稳定 id
        const targetParts = parseBulletTarget(target);
        const bulletId = targetParts
          ? lookupBulletId(
              parsedResumeWithIds,
              targetParts.section,
              targetParts.sectionIdx,
              targetParts.bulletIdx,
            )
          : null;

        return {
          id: String(el.id ?? `edit-${String(i + 1).padStart(3, "0")}`),
          target,
          bullet_id: bulletId ?? undefined,
          original_text: String(el.original_text ?? ""),
          suggested_text: suggestedText,
          evidence_source: evidenceSource,
          evidence_audit: evidenceAudit,
          claim_type: claimType,
          source,
          confidence,
          linked_jd_keyword: linkedKeyword,
          reason: String(el.reason ?? ""),
          category: cat,
          priority: pri,
          fab_warning: fabWarning,
          jd_requirement_text: jdReqText,
          fixable,
        } as EditSuggestion;
      })
      .filter((e) => {
        if (!e.suggested_text) {
          filteredOutCount++;
          return false;
        }

        // === gap-alert 特殊校验(2026-06-02 v2)===
        if (e.category === "gap-alert") {
          // gap-alert 必须 target 是 alert:
          if (!e.target.startsWith("alert:")) {
            filteredOutCount++;
            filterReasons.push(`${e.id}: gap-alert 但 target 不是 alert: 开头`);
            return false;
          }
          // gap-alert 必须 evidence_source 指 jd_context.gaps
          if (!(e.evidence_source ?? "").toLowerCase().includes("jd_context.gaps")) {
            filteredOutCount++;
            filterReasons.push(`${e.id}: gap-alert 但 evidence_source 不指 jd_context.gaps[N]`);
            return false;
          }
          // gap-alert 必须有 jd_requirement_text
          if (!e.jd_requirement_text) {
            filteredOutCount++;
            filterReasons.push(`${e.id}: gap-alert 缺 jd_requirement_text`);
            return false;
          }
          // gap-alert 过滤难补(用户决策 2:只出 fixable<=3 月)
          if (e.fixable === "难补≥3月") {
            filteredOutCount++;
            filterReasons.push(`${e.id}: gap-alert fixable=难补≥3月,过滤(走模块 E.2 项目设计)`);
            return false;
          }
          return true; // gap-alert 通过其他校验
        }

        // === 非 gap-alert 的常规 anti-fab 校验 ===

        // Anti-fabrication 校验 1:new: target 必须是 hidden-experience-add
        if (e.target.startsWith("new:") && e.category !== "hidden-experience-add") {
          filteredOutCount++;
          filterReasons.push(`${e.id}: new: target 但 category=${e.category}(违反硬约束 #4)`);
          return false;
        }

        // Anti-fabrication 校验 2:evidence_source 必填
        if (!e.evidence_source) {
          filteredOutCount++;
          filterReasons.push(`${e.id}: 缺 evidence_source(违反硬约束 #3)`);
          return false;
        }

        // Anti-fabrication 校验 3:非 gap-alert 不能 evidence_source 指 JD
        const lower = e.evidence_source.toLowerCase();
        if (
          lower.includes("jd_requirement") ||
          lower.includes("must_have") ||
          lower.includes("jd.requirement") ||
          lower.includes("jd context") ||
          lower.includes("jd_context") ||
          lower === "jd"
        ) {
          filteredOutCount++;
          filterReasons.push(`${e.id}: 非 gap-alert 不能 evidence_source 指 JD(违反硬约束 #3)`);
          return false;
        }

        // Anti-fabrication 校验 4:ats-keyword 不能用 new: target
        if (e.category === "ats-keyword" && e.target.startsWith("new:")) {
          filteredOutCount++;
          filterReasons.push(`${e.id}: ats-keyword 不能新建 bullet(违反硬约束 #5)`);
          return false;
        }

        // Anti-fabrication 校验 5:hidden-experience-add 但 evidence_source 不指 hidden
        if (
          e.category === "hidden-experience-add" &&
          !e.evidence_source.toLowerCase().includes("hidden_experience")
        ) {
          filteredOutCount++;
          filterReasons.push(`${e.id}: hidden-experience-add 但 evidence_source 不指 hidden_experiences(违反硬约束 #4)`);
          return false;
        }

        return true;
      });

    if (filteredOutCount > 0) {
      console.warn(
        `[suggest-edits] Anti-fabrication 过滤掉 ${filteredOutCount} 条 edit:\n${filterReasons.join("\n")}`
      );
    }

    // === Step 4: m3-normalize 数字 / 强承诺词溯源校验(offer-1-sparkling-hippo)===
    // gap-alert 不参与 normalize(它的 suggested_text 是 JD 缺口描述,不是简历改写)
    const gapAlerts = edits.filter((e) => e.category === "gap-alert");
    const writeableEdits = edits.filter((e) => e.category !== "gap-alert");

    // placeholder_mode(plan offer-1-sparkling-hippo P1):
    // M6 → M3 但 job-detail 503 没拿到 JD 全文 → 仅基于岗位摘要推断
    // 在这个模式下,suggest-edits 输出的 claim_type 一律不允许是 explicit(降到 inferred)
    const isPlaceholderMode = Boolean(
      (jdContext as { placeholder_mode?: boolean } | null)?.placeholder_mode,
    );
    if (isPlaceholderMode) {
      writeableEdits.forEach((e) => {
        if (e.claim_type === "explicit") {
          e.claim_type = "inferred";
          e.fab_warning =
            (e.fab_warning ?? "") +
            "\n⚠ 当前为岗位摘要模式(M6 未拿到 JD 全文),所有改动建议降级为 inferred";
        }
      });
    }
    const corpus = buildSourceCorpus({
      parsedResume,
      hiddenExperiences,
      fromDebriefHighlight,
    });
    const normalized = normalizeEditSuggestions(writeableEdits as EditSuggestion[], corpus);
    const allEdits = [...normalized, ...gapAlerts];

    // 统计 normalize 战果
    let normalizedCount = 0;
    let downgradedCount = 0;
    normalized.forEach((e, i) => {
      const original = writeableEdits[i];
      if (e.suggested_text !== original.suggested_text) normalizedCount++;
      if (
        original.claim_type !== "needs_confirmation" &&
        e.claim_type === "needs_confirmation"
      ) {
        downgradedCount++;
      }
    });
    if (normalizedCount > 0 || downgradedCount > 0) {
      console.warn(
        `[suggest-edits] normalize: ${normalizedCount} 处数字替换为占位符,${downgradedCount} 条 claim_type 被降级`,
      );
    }

    return NextResponse.json({
      edits: allEdits,
      default_accept_count: Number(parsed.default_accept_count ?? 3),
      optimization_summary: String(parsed.optimization_summary ?? `本次找了 ${allEdits.length} 处可改`),
      original_issues: Array.isArray(parsed.original_issues)
        ? parsed.original_issues.map(String).filter(Boolean).slice(0, 7)
        : [],
      optimization_directions: Array.isArray(parsed.optimization_directions)
        ? parsed.optimization_directions.map(String).filter(Boolean).slice(0, 6)
        : [],
      used_supplements: route,
      inferred_persona: persona,
      anti_fab_filtered: filteredOutCount,
      anti_fab_filter_reasons: filterReasons,
      anti_fab_normalized: normalizedCount,
      anti_fab_downgraded: downgradedCount,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/suggest-edits error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
