/**
 * POST /api/m2/chat — 模块 2 经历挖掘对话
 *
 * 一 turn 一问,按 6-phase 骨架(anchor → per_role → hero_story → skeptical → synthesis)推进。
 * 产出 intake_artifact + candidate_bullets,落 localStorage 供 m3 简历整理消费。
 *
 * Body: {
 *   history: ChatMessage[],
 *   persona_tag?: string,
 *   current_intake: IntakeArtifact,
 *   current_bullets: CandidateBullet[]
 * }
 *
 * 返回: {
 *   next_question, phase, delta_intake, delta_bullets, done, reason?
 * }
 *
 * plan §E.1 + skill-excavating-refs/question-batteries.md + red-flags-and-rationalizations.md
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/llm";

const PROMPT_BASE = path.join(
  process.cwd(),
  "lib/prompts/skill-excavating-refs"
);

let cachedQuestionBatteries: string | null = null;
let cachedRedFlags: string | null = null;

async function loadPromptSections() {
  if (!cachedQuestionBatteries) {
    cachedQuestionBatteries = await fs.readFile(
      path.join(PROMPT_BASE, "question-batteries.md"),
      "utf-8"
    );
  }
  if (!cachedRedFlags) {
    cachedRedFlags = await fs.readFile(
      path.join(PROMPT_BASE, "red-flags-and-rationalizations.md"),
      "utf-8"
    );
  }
  return {
    questionBatteries: cachedQuestionBatteries,
    redFlags: cachedRedFlags,
  };
}

type Phase =
  | "anchor"
  | "per_role"
  | "hero_story"
  | "skeptical"
  | "synthesis";

type StoryCategory =
  | "Peak"
  | "Challenge"
  | "Impact"
  | "Failure"
  | "LearningSprint"
  | "Praise";

type IntakeRole = {
  org_type: string;
  role: string;
  period: string;
  charter: string;
  scale?: string;
  excavation_depth: "shallow" | "medium" | "deep" | "thin";
};

type IntakeStory = {
  id: string;
  title: string;
  category: StoryCategory;
  strength: 1 | 2 | 3 | 4 | 5;
  star: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  earned_secret?: string;
  jd_keywords?: string[];
};

type SkepticalFlag = { weak_spot: string; story_id?: string };

type IntakeArtifact = {
  roles: IntakeRole[];
  stories: IntakeStory[];
  skeptical_flags?: SkepticalFlag[];
};

type CandidateBullet = {
  source_story_id: string;
  text: string;
  star_breakdown?: { s: string; t: string; a: string; r: string };
};

function isAmbitiousPersona(persona?: string): boolean {
  if (!persona) return false;
  const p = persona.toLowerCase();
  return (
    p.includes("chen") ||
    p.includes("陈昊") ||
    p.includes("ambitious") ||
    p.includes("拔高")
  );
}

function personaHeroPriority(persona?: string): {
  categories: StoryCategory[];
  skepticalTone: "sharp" | "soft";
} {
  if (!persona)
    return {
      categories: ["Peak", "Impact", "Challenge"],
      skepticalTone: "soft",
    };
  const p = persona.toLowerCase();
  if (
    p.includes("chen") ||
    p.includes("陈昊") ||
    p.includes("ambitious") ||
    p.includes("拔高")
  ) {
    return {
      categories: ["Peak", "Impact", "Challenge"],
      skepticalTone: "sharp",
    };
  }
  if (
    p.includes("lin") ||
    p.includes("林婷") ||
    p.includes("pivot") ||
    p.includes("转专业")
  ) {
    return {
      categories: ["LearningSprint", "Challenge", "Praise"],
      skepticalTone: "soft",
    };
  }
  if (
    p.includes("ming") ||
    p.includes("李明") ||
    p.includes("anxious") ||
    p.includes("焦虑")
  ) {
    return {
      categories: ["LearningSprint", "Challenge", "Praise"],
      skepticalTone: "soft",
    };
  }
  if (
    p.includes("wen") ||
    p.includes("王雯") ||
    p.includes("non-target") ||
    p.includes("双非")
  ) {
    return {
      categories: ["LearningSprint", "Impact", "Challenge"],
      skepticalTone: "soft",
    };
  }
  return {
    categories: ["Peak", "Impact", "Challenge"],
    skepticalTone: "soft",
  };
}

type Depth = "shallow" | "medium" | "deep";

function guessPhase(
  intake: IntakeArtifact,
  ambitious: boolean,
  depth: Depth
): Phase {
  const roleCount = intake.roles?.length ?? 0;
  if (roleCount === 0) return "anchor";
  // shallow: 任何 role 有 charter 就够;medium/deep: 需要 medium+ 深度
  const hasReadyRole =
    depth === "shallow"
      ? (intake.roles ?? []).some((r) => r.charter)
      : (intake.roles ?? []).some(
          (r) =>
            r.charter &&
            (r.excavation_depth === "medium" || r.excavation_depth === "deep")
        );
  if (!hasReadyRole) return "per_role";
  const strengthThreshold = ambitious ? 3 : 2;
  const strongStories = (intake.stories ?? []).filter(
    (s) => (s.strength ?? 0) >= strengthThreshold
  ).length;
  // shallow: 1 个 story 就够进 skeptical;medium/deep: 需要 3 个
  const storyGoal = depth === "shallow" ? 1 : 3;
  if (strongStories < storyGoal) return "hero_story";
  const skepticalFlagCount = intake.skeptical_flags?.length ?? 0;
  // shallow: 1 个 weak spot 就够;medium: 3;deep: 3
  const flagGoal = depth === "shallow" ? 1 : 3;
  if (skepticalFlagCount < flagGoal) return "skeptical";
  return "synthesis";
}

function buildDepthBlock(depth: Depth): string {
  if (depth === "shallow") {
    return `【当前追问深度:浅 — 简单聊聊,3-5 turn 收尾】
- 每段经历 1-2 turn 即收尾(基本信息 + charter,不深挖 metric)
- BLANK / "没有" → **立即换主题**,不二次 reframe(用户可能真没有,不强求)
- Hero story 目标 **1-2 个**(strength ≥ 2 即可,不卡 3 个)
- Metric Mining 只问 1 维(用户最容易答的)
- Skeptical 阶段提 **1 个** 最关键 weak spot(constructive 口吻,不强求补)
- 整体目标 8-12 turn 内收尾,**优先 done=true + bullets**`;
  }
  if (depth === "deep") {
    return `【当前追问深度:深 — 详细 metric 追问】
- 每段经历 4-6 turn 详细挖
- BLANK / "没有" → **2 次 reframe** 才接受(给字典里 2-3 类相邻提示)
- Hero story 目标 **3-5 个**,每个 4 follow-up(STAR walk + Earned Secret + Metric + Self-rating)
- Metric Mining **5 维全跑**(How big / How fast / How much / How many / How well)
- Skeptical 阶段提 **3-5 个** weak spot,深度追问每个的可量化补充
- 整体可以 25-40 turn`;
  }
  return `【当前追问深度:中 — 平衡挖掘(默认)】
- 每段经历 2-3 turn(charter + scale + 1 维 metric)
- BLANK / "没有" → **1 次 reframe**,然后换主题
- Hero story 目标 **3 个**,每个 2 follow-up(STAR + Earned Secret)
- Metric Mining 抽 1-2 维
- Skeptical 阶段提 **3 个** weak spot,softer + constructive 口吻
- 整体 15-25 turn(v2 默认行为)`;
}

function buildSystemPrompt(args: {
  questionBatteries: string;
  redFlags: string;
  persona?: string;
  hint: Phase;
  selectedCategories: string[];
  depth: Depth;
}): string {
  const { questionBatteries, redFlags, persona, hint, selectedCategories, depth } = args;
  const { categories, skepticalTone } = personaHeroPriority(persona);
  const ambitious = isAmbitiousPersona(persona);
  const depthBlock = buildDepthBlock(depth);

  const zeroExperienceBlock = ambitious
    ? `【用户画像】陈昊型 / 拔高型 — 用户已有大厂实习或扎实经历,目标是把现有素材拔到顶级 offer 水平。
直接挖 charter / scale / metric,**不需要 reframe** — 这类用户有底气,你的角色是 polish 不是翻译。`
    : `【用户画像默认假设(零经历友好版)】
你面对的是**没有大厂实习、自己都觉得做过的事不起眼**的学生。他们不会主动说 "charter / scale / metric"。
**你的核心能力 = 把他们随口说的事,翻译成简历可用的 transferable skill。**

【Reframe 字典(主动套用,每个用户提到的经历都至少给 1-2 个 transferable skill)】
- "帮室友 debug Python / 给同学讲题" → 技术教学 + 沟通能力(可量化:帮了几人?他们之后能独立写代码?)
- "组织 5 人聚餐 / 同学聚会" → 活动策划 + 协调(几人?预算?有冲突怎么解决?)
- "在班级公众号写过 X 篇文章" → 内容创作 + 用户视角(阅读量?互动?)
- "坚持自学 X 三个月以上" → 学习能力 + 自驱(学到什么程度?做了什么作品?)
- "课代表 / 学习委员 / 班长" → 沟通能力 + 流程协调(几人受益?怎么收发作业?有没有解决过冲突?)
- "小组作业里的某个角色" → 协作 + 责任意识(你具体写了哪个模块?其他人怎么评价?)
- "参加过 1-2 次校园比赛 / 黑客松" → 抗压 + 快速学习(几人组?最终交付什么?)
- "做过家教 / 翻译 / 任何兼职" → 客户沟通 + 责任感(服务了几个客户?最长合作多久?)
- "参加过校园活动(辩论 / 演讲 / 文艺 / 体育)" → 团队协作 + 公开表达(多少人面前?有没有担任主角?)
- "宿舍长 / 值日组长" → 微型领导力 + 流程意识(管几人?解决过什么矛盾?)

【硬约束变更(默认零经历版)】
- 砍 "charter / scale / metric" 学生不懂的词 — 改成"你具体做了哪几件事?" "有多少人受益 / 用过?" 这种学生口语
- **BLANK 分支处理**:**不要直接标 thin 跳过**。先**主动 reframe + 二次追问**用 Reframe 字典里最相关的 2-3 类。例:用户说"没什么经历" → 你回"再想想 — 选课时帮过室友算 GPA 吗?寒假在家做过什么打发时间?宿舍群里发过通知吗?这些都算"
- **每段经历最少输出 1 个 transferable skill**(主动告诉用户),然后让用户确认 "这样翻译对吗?"
- Skeptical Recruiter 默认 **softer + constructive**(不是质疑,是"帮 polish"):"这段挺好,只是面试官可能问 [X],提前想清楚怎么答"
- **降低 strength 门槛**:零经历学生 strength ≥ 2 就可以进 candidate_bullets。原 ≥ 3 是给陈昊型的标准。
- candidate_bullets 用平实可信句式,不要"主导 / 牵头"这种夸张词`;

  return `你是「Offer 捕手」的经历挖掘助手。任务:帮没简历或简历散乱的学生,用 6-phase 结构化访谈把零散经历挖成可用素材库,产出给下游「简历整理」模块直接消费。

${zeroExperienceBlock}

${depthBlock}

【硬约束 — 永远不许违反】
1. **永远不输出任何公司名**(只到"行业 + 职位类型")。**用户讲了公司名,你 acknowledge 时必须抽象掉**:
   - 错: "Got it — 字节跳动用户增长实习,目标 AI PM..." ❌
   - 对: "Got it — 某互联网大厂的用户增长实习,目标 AI PM..." ✓
   适用所有大厂(字节跳动 / 阿里巴巴 / 腾讯 / 美团 / 百度 / 华为 / 京东 / 拼多多 / 网易 / 小米 / 滴滴 / Google / Microsoft / Meta 等)+ 所有具名实验室 / 学校 / 公益组织。抽象到"某互联网大厂 / 某高校实验室 / 某公益组织"。这条 acknowledgment 也算违反 = 退回。
2. **一 turn 一问 — non-negotiable**(不能一句话里 2 个问题,不能用"以及""还有""另外"串)
3. **Anti-fabrication**:用户挖不出就接受,strength ≤ 2 故事标 thin。**绝不替用户编故事**
4. **Skeptical Recruiter 内容不能跳**(必须列 3 个 weak spot)**但表达方式必须是"风险告知 + 你决定"**:
   - **绝不说**"按流程我必须 / 我必须先过 / 这步不能跳"等训诫式表达(显得居高临下)
   - 用户要求 skip 时,**在 next_question 里仍然口语化列出 3 个 weak spot 条目** + 给"要不要补 / 都不补"选择。例:
     "好,直接收尾。不过我先把 3 个面试官可能追问的点告诉你 — 你看要不要补,都不补也行,我可以直接产 bullets:
     1. {weak spot 1}
     2. {weak spot 2}
     3. {weak spot 3}
     想现在补哪个,还是都不补直接产 bullets?"
   - **不要写"用户要求跳过... 已输出 N 个 bullets"这种系统状态语言** — next_question 必须是给用户看的口语对话,不是日志
   - 用户进一步明确"都不补 / 直接产" → 这才进 synthesis 产 ≥ 3 bullets(同一轮 delta_bullets 非空)
   - **关键**:产品是用户的工具,不是流程看守者。给信息 + 给选择,不下命令,不写状态日志
5. **空洞夸赞禁止**(eg "great answer", "amazing")—要么沉默,要么具体承认细节
6. **严格 JSON 输出**,不能有 markdown 代码块包裹

【4 套思辨纪律(每 turn 自检)】
- **Skeptical Recruiter**:weak spot 现在告知,用户决定要不要补;不要硬拦,产品是工具不是看守
- **Anti-fabrication**:数字太整(100% / 翻倍)要好奇追问"事后估的还是当时测量的?";不指控,只好奇
- **Gap → Project 桥接**:competency gap 用 skeptical_flags 暴露,下游 m4 会接
- **反 rationalization**:不让"用户挺会说,跳过反思" / "材料够了开始写 bullet" / "合并问题省时间" 这些念头得逞

【当前 persona 配置(plan §改进 2 per-persona 加权)】
- Persona tag: ${persona ?? "(未知/未选 — 走默认零经历版)"}
- Hero story 优先 3 类: **${categories.join(" / ")}**(只问这 3 类,不碰其他)
- Skeptical Recruiter 语气: **${skepticalTone === "sharp" ? "直接锐利(陈昊型 — 直接戳数字 / ROI / 具体指标)" : "softer + constructive(给短期可补路径,避免打击)"}**

【用户勾选的 10 类校园经历(Phase 1 类别枚举)】
${selectedCategories.length > 0 ? selectedCategories.map((c) => `- ${c}`).join("\n") : "(用户未勾选,从对话里自然引导)"}

按勾选的类逐个挖,**优先级**:实习 > 课程项目 > 个人项目 > 比赛 > 助教 > 社团 / 校园活动 > 兼职 > 志愿 > 兴趣深挖。
**如果用户勾选 0 个**,主动用 Reframe 字典追问 2-3 类。**不允许接受"没经历"作为最终回答**。

【阶段晋级 — 服务端 hint = ${hint},允许你根据现状调整】
- **anchor**(Phase 1+2 合并): 1-2 句目标 + 列 2-3 段经历(角色名 + 起止时间,不深挖)
- **per_role**(Phase 3,2 分支压缩): VIVID 直接追 scale / 项目 / 问题 + Metric Mining;VAGUE 用"没你什么会出问题"换问法。每个 outcome 后 Metric Mining 5 维抽 1-2 维
- **hero_story**(Phase 4): 按 persona 优先 3 类,每个故事 2 follow-up(STAR walk 确认 + Earned Secret)
- **skeptical**(Phase 6.5): 从 artifact 自动提 3 weak spot(strength ≤ 2 / "unknown" metric 多 / shallow role / charter 含糊),**用"告知 + 你决定"口吻列出**;用户选不补 → 仍写进 skeptical_flags 直接进 synthesis
- **synthesis**(Phase 5 gap + Phase 6): 内嵌 Gap 3 维检查(competency/domain/metric),输出 done=true + ≥ 3 candidate_bullets

【晋级条件】
- anchor → per_role: roles 列表 ≥ 1 个有 charter
- per_role → hero_story: ≥ 1 个 role excavation_depth ∈ {medium, deep}
- hero_story → skeptical: ≥ 3 stories @ strength ≥ 3
- skeptical → synthesis: 3 个 skeptical_flags 都提完
- synthesis → done=true: 产 ≥ 3 candidate_bullets,reason 给一句话总结

【提问模板参考(skill-excavating-refs/question-batteries.md,重点 Phase 3 / 4)】

${questionBatteries}

【红线表(skill-excavating-refs/red-flags-and-rationalizations.md,违反 = 停下重做当前 phase)】

${redFlags}

【输出 — 严格 JSON,无 markdown 包裹】
{
  "next_question": "下一句话(一 turn 一问,不出公司名)",
  "phase": "anchor | per_role | hero_story | skeptical | synthesis",
  "delta_intake": {
    "roles": [],
    "stories": [],
    "skeptical_flags": []
  },
  "delta_bullets": [],
  "done": false,
  "reason": "done=true 时一句话总结,否则可省略"
}

字段细则:
- **delta_intake.roles** 只放本轮新增 / 修正的 role(完整字段:org_type, role, period, charter, scale?, excavation_depth)。org_type 抽象到行业(eg "互联网大厂" / "高校实验室" / "公益组织"),**不出公司名**
- **delta_intake.stories** 只放本轮新增 / 修正的 story。id 用 S001/S002... 递增。category 必须是 Peak/Challenge/Impact/Failure/LearningSprint/Praise 之一
- **delta_intake.skeptical_flags** 只在 skeptical 阶段非空,正好 3 项,每项 weak_spot 一句话 + story_id
- **delta_bullets** 在 **每一轮**都尽可能产 1-2 条**草稿 bullet**(plan offer-1-sparkling-hippo P1 — 让用户看到即时产出,不要憋到 synthesis 才出):
  · 1 轮后 / anchor 阶段:产 1 条"待补证据"的临时 bullet(text 用平实陈述,数字处用 【请补充】 占位符)
  · 2-3 轮后 / per_role / hero_story:升级为带 STAR breakdown 的草稿
  · synthesis 阶段:出 ≥ 3 条完整可用 bullet
  · 每条带 anti_fab_note 字段说明这是草稿还是定稿
- text 是可直接 copy 到简历的 STAR / X-Y-Z bullet(eg "通过 SQL+Python 自动化日报,将 PM 每日数据采集时间从 120 分钟压到 15 分钟")
- 没新增就给空数组 / 空对象。**禁止编造字段值**

【★ 已问主题去重(plan offer-1-sparkling-hippo P1)】
- next_question 选题前,先看 current_intake.roles + stories 中已经覆盖过的话题(读 role.charter / story.title)
- **不要重复问同一主题** — 如果某 role 已经讨论过 "数据工具" / "团队规模" / "用户访谈" / "成果数字"等,这一轮换一个角度问
- 同一 role 内,优先级:scale → process → outcome → reflection;同一类主题最多重复 1 次
`;
}

function buildUserPrompt(args: {
  history: ChatMessage[];
  current_intake: IntakeArtifact;
  current_bullets: CandidateBullet[];
}): string {
  const historyStr =
    args.history.length === 0
      ? "(空 — 这是第一轮,用户还没说话)"
      : args.history
          .map((m, i) => `[${i + 1}] ${m.role}: ${m.content}`)
          .join("\n");

  return `【对话历史(${args.history.length} 条)】
${historyStr}

【当前 intake artifact 快照】
${JSON.stringify(args.current_intake, null, 2)}

【当前 candidate bullets 快照】
${JSON.stringify(args.current_bullets, null, 2)}

按阶段规则给出下一轮 JSON 响应。`;
}

function normalizeRole(r: unknown): IntakeRole | null {
  if (!r || typeof r !== "object") return null;
  const obj = r as Record<string, unknown>;
  const depthRaw =
    (obj.excavation_depth as string) ?? (obj.depth as string) ?? "shallow";
  const depth = (
    ["shallow", "medium", "deep", "thin"].includes(depthRaw)
      ? depthRaw
      : "shallow"
  ) as IntakeRole["excavation_depth"];
  return {
    org_type:
      (obj.org_type as string) ??
      (obj.orgType as string) ??
      (obj.org as string) ??
      "未知组织",
    role:
      (obj.role as string) ??
      (obj.position as string) ??
      "未知角色",
    period: (obj.period as string) ?? (obj.time as string) ?? "",
    charter:
      (obj.charter as string) ??
      (obj.responsibility as string) ??
      "",
    scale: (obj.scale as string) ?? undefined,
    excavation_depth: depth,
  };
}

const VALID_CATEGORIES: StoryCategory[] = [
  "Peak",
  "Challenge",
  "Impact",
  "Failure",
  "LearningSprint",
  "Praise",
];

function normalizeStory(s: unknown): IntakeStory | null {
  if (!s || typeof s !== "object") return null;
  const obj = s as Record<string, unknown>;
  const cat = (obj.category as string) ?? (obj.type as string) ?? "Impact";
  const category = (
    VALID_CATEGORIES.includes(cat as StoryCategory) ? cat : "Impact"
  ) as StoryCategory;
  const strengthNum = Number(obj.strength ?? obj.rating ?? 3);
  const strength = Math.max(1, Math.min(5, Math.round(strengthNum))) as
    | 1
    | 2
    | 3
    | 4
    | 5;
  const starRaw = (obj.star ?? {}) as Record<string, unknown>;
  return {
    id:
      (obj.id as string) ??
      (obj.story_id as string) ??
      `S${Math.floor(Math.random() * 9000 + 1000)}`,
    title:
      (obj.title as string) ?? (obj.name as string) ?? "未命名故事",
    category,
    strength,
    star: {
      situation:
        (starRaw.situation as string) ??
        (obj.situation as string) ??
        "",
      task: (starRaw.task as string) ?? (obj.task as string) ?? "",
      action: (starRaw.action as string) ?? (obj.action as string) ?? "",
      result: (starRaw.result as string) ?? (obj.result as string) ?? "",
    },
    earned_secret:
      (obj.earned_secret as string) ??
      (obj.earnedSecret as string) ??
      (obj.insight as string),
    jd_keywords:
      (obj.jd_keywords as string[]) ?? (obj.jdKeywords as string[]) ?? [],
  };
}

function normalizeBullet(b: unknown): CandidateBullet | null {
  if (!b || typeof b !== "object") return null;
  const obj = b as Record<string, unknown>;
  const text = (obj.text as string) ?? (obj.bullet as string) ?? "";
  if (!text) return null;
  return {
    source_story_id:
      (obj.source_story_id as string) ??
      (obj.story_id as string) ??
      (obj.sourceStoryId as string) ??
      "S000",
    text,
    star_breakdown: (obj.star_breakdown ??
      obj.starBreakdown ??
      undefined) as CandidateBullet["star_breakdown"],
  };
}

// 服务端兜底:LLM 偶尔会在 acknowledgment 里 echo 用户提到的大厂名,这里 regex 替换。
// 不是详尽列表,只覆盖最常见的 — prompt 是主防线,这里是 safety net。
const COMPANY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/字节跳动|字节(?![一-龥])|抖音|TikTok|ByteDance/gi, "某互联网大厂"],
  [/阿里巴巴|阿里(?![一-龥])|淘宝|天猫|蚂蚁集团|蚂蚁金服|Alibaba/gi, "某互联网大厂"],
  [/腾讯|微信|QQ(?![一-龥])|Tencent/gi, "某互联网大厂"],
  [/美团|大众点评|Meituan/gi, "某互联网大厂"],
  [/百度|Baidu/gi, "某互联网大厂"],
  [/华为|Huawei/gi, "某科技公司"],
  [/京东|JD\.com/gi, "某互联网大厂"],
  [/拼多多|Pinduoduo|PDD/gi, "某互联网大厂"],
  [/网易(?![一-龥])|NetEase/gi, "某互联网大厂"],
  [/小米|Xiaomi/gi, "某科技公司"],
  [/滴滴|Didi/gi, "某互联网大厂"],
  [/快手|Kuaishou/gi, "某互联网大厂"],
  [/B 站|B站|哔哩哔哩|bilibili/gi, "某互联网大厂"],
  [/(?<![A-Za-z])Google(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Microsoft(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Meta(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Amazon(?![A-Za-z])/g, "某科技公司"],
  [/(?<![A-Za-z])Apple(?![A-Za-z])/g, "某科技公司"],
];

function scrubCompanyNames(text: string): string {
  let out = text;
  for (const [re, repl] of COMPANY_REPLACEMENTS) {
    out = out.replace(re, repl);
  }
  return out;
}

function normalizeFlag(f: unknown): SkepticalFlag | null {
  if (!f || typeof f !== "object") return null;
  const obj = f as Record<string, unknown>;
  const ws =
    (obj.weak_spot as string) ??
    (obj.weakSpot as string) ??
    (obj.text as string) ??
    "";
  if (!ws) return null;
  return {
    weak_spot: ws,
    story_id: (obj.story_id as string) ?? (obj.storyId as string),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const history: ChatMessage[] = Array.isArray(body.history)
      ? body.history
      : [];
    const persona =
      typeof body.persona_tag === "string" && body.persona_tag.length > 0
        ? body.persona_tag
        : undefined;
    const current_intake: IntakeArtifact =
      body.current_intake && typeof body.current_intake === "object"
        ? body.current_intake
        : { roles: [], stories: [] };
    const current_bullets: CandidateBullet[] = Array.isArray(
      body.current_bullets
    )
      ? body.current_bullets
      : [];

    const { questionBatteries, redFlags } = await loadPromptSections();
    const ambitious = isAmbitiousPersona(persona);
    const depth: Depth = ["shallow", "medium", "deep"].includes(body.depth)
      ? (body.depth as Depth)
      : "medium";
    const hint = guessPhase(current_intake, ambitious, depth);
    const selectedCategories: string[] = Array.isArray(body.categories)
      ? (body.categories as string[]).filter(
          (c) => typeof c === "string" && c.length > 0
        )
      : [];

    const systemPrompt = buildSystemPrompt({
      questionBatteries,
      redFlags,
      persona,
      hint,
      selectedCategories,
      depth,
    });
    const userPrompt = buildUserPrompt({
      history,
      current_intake,
      current_bullets,
    });

    const raw = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat",
        temperature: 0.7,
        max_tokens: 2500,
        jsonMode: true,
      }
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("LLM JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    const nextQuestionRaw = ((parsed.next_question ??
      parsed.nextQuestion ??
      parsed.question ??
      parsed.reply ??
      "") as string).trim();
    const next_question = scrubCompanyNames(nextQuestionRaw);

    const phaseRaw = (parsed.phase ??
      parsed.current_phase ??
      hint) as string;
    const phase: Phase = (
      ["anchor", "per_role", "hero_story", "skeptical", "synthesis"].includes(
        phaseRaw
      )
        ? phaseRaw
        : hint
    ) as Phase;

    const deltaIntakeRaw = (parsed.delta_intake ?? parsed.deltaIntake ?? {}) as
      Record<string, unknown>;
    const deltaIntake = {
      roles: (Array.isArray(deltaIntakeRaw.roles)
        ? deltaIntakeRaw.roles
        : []
      )
        .map(normalizeRole)
        .filter((r): r is IntakeRole => r !== null),
      stories: (Array.isArray(deltaIntakeRaw.stories)
        ? deltaIntakeRaw.stories
        : []
      )
        .map(normalizeStory)
        .filter((s): s is IntakeStory => s !== null),
      skeptical_flags: (Array.isArray(
        deltaIntakeRaw.skeptical_flags ?? deltaIntakeRaw.skepticalFlags
      )
        ? (deltaIntakeRaw.skeptical_flags ??
            deltaIntakeRaw.skepticalFlags) as unknown[]
        : []
      )
        .map(normalizeFlag)
        .filter((f): f is SkepticalFlag => f !== null),
    };

    const deltaBullets = (
      Array.isArray(parsed.delta_bullets ?? parsed.deltaBullets)
        ? ((parsed.delta_bullets ?? parsed.deltaBullets) as unknown[])
        : []
    )
      .map(normalizeBullet)
      .filter((b): b is CandidateBullet => b !== null);

    const done = Boolean(parsed.done ?? parsed.finished ?? false);
    const reason =
      (parsed.reason as string) ?? (parsed.summary as string) ?? undefined;

    return NextResponse.json({
      next_question,
      phase,
      delta_intake: deltaIntake,
      delta_bullets: deltaBullets,
      done,
      reason,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m2/chat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
