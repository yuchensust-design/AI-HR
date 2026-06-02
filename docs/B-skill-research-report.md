# 模块 B 简历整理 — skill / 仓库调研报告

> 强制阻塞文档。PARALLEL-DEV.md §4.B 强制要求,不调研直接写 = NIH 风险高。
> 写于 2026-06-01 · 跟用户确认后才能 begin coding。
>
> **核心问题**:什么场景下用哪个 skill 最好?主框架 + 补充 skill 是 router + tool box 关系,**不是 static stuffing**。

---

## 0.5 决策原则:主框架 = router,补充 skill = 工具箱(取长补短)

**主框架** (`lib/prompts/skill-matching.md` + refs/) = **5-phase SOP 骨架 + 路由逻辑**,决定"现在走到哪一步、要不要调补充 skill、调哪个"。

**补充 skill** = **垂直场景工具**,只在主框架判定"当前场景适合该 skill"时才动态加载到 prompt。

**反 anti-pattern**:把所有 skill 的 markdown 全塞进 generate-resume 的 system prompt → prompt 长度爆 + 风格冲突 + token cost 翻 5 倍 + LLM 在多套规则里挑选会犯糊涂。

**正确模式**:主框架先做"场景判定"(基于 persona / target_role / 简历现状),输出一个 `skill_route` 决策,Phase 5 generate-resume 按 route 动态拼 prompt(只拼匹配的 1-3 个 skill)。

---

## 0.6 每个 skill 的差异化定位(强项 / 弱项 / 唯一适合场景)

按"最适合什么用户场景"对比,**避免 skill 之间功能重叠造成混乱**。

| Skill | 强项(别的 skill 没有) | 弱项 / 边界 | **唯一适合场景**(其他 skill 替代不了) |
|---|---|---|---|
| **主框架 skill-matching** | 5-phase SOP + 选择题挖隐藏经验 + JD:公司 80:20 + 时间预算 3 档 | 单 bullet 重写细节弱 / 无 ATS 检测 / 无跨行业翻译 | **所有 5 phase 的骨架**(其他 skill 永远是补充) |
| **#3 wyh0626 narrative-tools** | "责任→成就"5 步转写法 + audit-checklist 句句质疑 | 通用,不分行业 / 不分 persona | **当用户简历里大量"负责 X / 协助 Y / 参与 Z"职责陈述句**,Phase 5 重写时主调 |
| **#4 resume-bullet-writer** | STAR / X-Y-Z / Action Verb + 数字 + 影响 模板库 | 只管 bullet 这一层,不管整体结构 | **生成 candidate_bullets(改进 5 lock)的格式控制器** — Phase 5 末尾必调 |
| **#4 resume-ats-optimizer** | ATS 关键词命中率自检 + 危险格式黑名单(表格/图/多列) | 不关心内容质量,只看通过率 | **李明型(校招焦虑 / 担心初筛过不了)的兜底自检** — Phase 5 末尾按场景调 |
| **#4 resume-quantifier** | "找量化机会 + 估算数字"专项 | 估算技巧好,但风格中性 | **王雯型(双非冲刺,需要量化把自己拉到大厂线)** + 陈昊型拔高 — Phase 5 重写时按场景调 |
| **#4 career-changer-translator** | 跨行业技能翻译(eg 化学背景 → 数据分析 transferable 怎么写) | 只管"翻译",不管整体 | **林婷型(转专业,简历完全不对口)的唯一解** — Phase 5 重写时按场景调 |
| **#4 tech-resume-optimizer** | 技术栈关键词 + 项目深度描述模板 | 只懂技术岗 | **陈昊型 CS 背景 + 技术岗(SWE / 算法 / DS)**,Phase 5 调 |
| **#4 creative-portfolio-resume** | 创意/设计岗简历 + portfolio 链接表达 | 只懂创意岗 | **设计 / 创意 / 内容岗** target role,Phase 5 调 |
| **#4 academic-cv-builder** | 学术 CV(论文/grant/教学) | 只懂学术 | **科研 / 博后 / 学术** target role,Phase 5 调 |
| **#4 executive-resume-writer** | 高管简历(P&L / 团队规模 / 战略) | 只懂高管 | **模块 B v1 学生用户基本不触发**,defer |
| **#4 resume-tailor** | 针对单一 JD 重写整份简历 | 跟主框架 Phase 5 重叠 | **跟主框架功能重叠,不重复用**(主框架 Phase 5 已做 JD-tailored 整合) |
| **#4 job-description-analyzer** | JD 关键词拆解 + 难度评估 | 跟主框架 Phase 2 重叠 | **跟主框架 Phase 2 重叠,不重复用** |
| **#4 resume-quantifier 之外的 17 skill** | 各管一个垂直 | — | 模块 B v1 用前面列的 6-7 个就够 |
| **#2 tencent resume-guide.md** | 腾讯校招特化 + STAR 6 大误区检查 + 院校中性表达 | 腾讯外公司契合度下降 | **用户 target 含腾讯**,Phase 5 调;**不含腾讯**,只调 6 误区检查(通用) |
| **#2 tencent recruitment-timeline.md** | 秋招/春招时间节点表 | 不直接给 prompt 用 | **Phase 4 时间预算分流**,作为参考数据(eg "现在 2026-06-01,秋招提前批 7 月就开") |
| **#7 Resume-Matcher** | JD 三段式拆解(must_have / nice_to_have / soft)架构 | **prompt 不开源** | **Phase 2 JSON schema 设计参考**(架构思路,不抄 prompt) |
| **#5 chen3tu interview-master / resume_analysis_checklist.md** | 简历 → 面试问题预测 | 主要面试场景 | **模块 B 不直接调,模块 C 调** |
| **#6 yupi-skill** | 鱼皮个人 voice | 跟不二 IP 风格冲突 | **不调** |
| **#8 open-resume / #9 resume-lm**(AGPL) | UI 设计参考 | 病毒条款 | **只看截图,绝不抄代码**;Phase 1 上传页 UX 参考 open-resume,Phase 0 进度条 UX 参考 resume-lm |

**关键 insight**:#4 ResumeSkills 的 20 个 skill 不是"全用",是"按 target role + persona 路由调"。同时 `resume-tailor` 和 `job-description-analyzer` 跟主框架功能重叠,**舍弃不用,避免冲突**。

---

## 0.7 场景 → skill 路由矩阵 ⭐(报告核心)

**Phase 5 generate-resume 动态拼 prompt 时,按下列矩阵决策**。判定输入 = `(persona, target_role, resume_state)`,输出 = 应该加载哪 1-3 个补充 skill 的 prompt 段。

### 0.7.1 按 persona 路由

| Persona(plan §8.5 §C) | 痛点 | Phase 5 默认调用 | 兜底自检 |
|---|---|---|---|
| **林婷型**(转专业) | 简历完全不对口 / 教育和经历跟目标不一致 | **#4 career-changer-translator** + #3 narrative-tools | + #4 ats-optimizer |
| **陈昊型**(拔高型 CS) | 已有 1-2 段实习,需要拔高冲大厂 | #4 tech-resume-optimizer(如技术岗)+ #4 resume-quantifier + **#3 narrative-tools** ⭐ | + #4 ats-optimizer + #2 tencent(如腾讯) |
| **小张型**(完全迷茫) | 散乱,没方向 | **不在模块 B 范围 — redirect 到 m2(经历挖掘)**,出报错文案明示 | — |
| **李明型**(校招焦虑) | 担心初筛 ATS 过不了 | **#4 resume-ats-optimizer 主导** + #3 narrative-tools | + #2 tencent 6 误区 |
| **王雯型**(双非冲刺) | 中等学校,需要硬实力补 | **#3 wyh0626 narrative-tools** + #4 resume-quantifier | + #2 tencent 院校中性表达 |
| 未判定 persona | — | 默认 #3 narrative-tools + #4 resume-bullet-writer + #4 ats-optimizer(通用三件套) | + #2 6 误区 |

### 0.7.2 按 target_role 路由(覆盖 0.7.1)

| Target role 特征 | 额外加载 |
|---|---|
| JD 内含「腾讯 / Tencent」 | + **#2 tencent resume-guide.md 完整段** |
| 技术岗(SWE / 算法 / DS / ML / 数据 / 前后端) | + **#4 tech-resume-optimizer** |
| PM / 运营 / 内容 / 增长 | 用通用三件套,无额外 |
| 设计 / 创意 / 内容创作 | + **#4 creative-portfolio-resume** |
| 学术 / 科研 / 博后 | + **#4 academic-cv-builder** |
| JD 提"实习 / intern" | 加 plan §改进 5 学生 STAR/X-Y-Z + 实习专项语料(主框架内) |

### 0.7.3 按 resume_state 路由(覆盖 0.7.1,Phase 1 输出决定)

Phase 1 parse-resume 给每条 bullet 打 `narrative_tag`(借 #3 audit-checklist),tag 分布决定 Phase 5 调谁:

| Bullet tag 分布(Phase 1 输出) | Phase 5 主调 |
|---|---|
| `responsibility_driven` > 60%(全是"负责/协助/参与"职责陈述) | **#3 wyh0626 narrative-tools 5 步转写**(责任→成就) |
| `lacks_metric` > 60%(很少数字 / 没量化) | **#4 resume-quantifier**(找量化机会 + 估算) |
| `vague_action` > 60%(动词不强,"做了 / 完成 / 实现") | **#4 resume-bullet-writer**(Action Verb 库) |
| 三者都 < 30% — 简历已经写得不错 | 仅做 #4 resume-ats-optimizer 自检 + Phase 3 挖隐藏经验补充 |

### 0.7.4 router 决策伪代码(Phase 5 generate-resume 调度逻辑)

```
function decide_skill_route(persona, target_role, parsed_resume) {
  const supplements = new Set()

  // 通用三件套(99% 场景都加)
  supplements.add('main-framework-phase-5')      // 主框架 Phase 5
  supplements.add('resume-bullet-writer')         // 必产 candidate_bullets

  // persona 层(0.7.1)
  if (persona == '林婷') {
    supplements.add('career-changer-translator')
    supplements.add('wyh0626-narrative-tools')
  } else if (persona == '陈昊') {
    supplements.add('resume-quantifier')
    supplements.add('wyh0626-narrative-tools')   // 加于 Step 0.5 A/B 实验后(陈昊 C vs B 差距小,补 narrative-tools 拉开)
  } else if (persona == '李明') {
    supplements.add('resume-ats-optimizer')   // 主调
    supplements.add('wyh0626-narrative-tools')
  } else if (persona == '王雯') {
    supplements.add('wyh0626-narrative-tools')
    supplements.add('resume-quantifier')
  } else if (persona == '小张') {
    return 'REDIRECT_TO_M2'   // 不该进模块 B
  }

  // target_role 层(0.7.2)
  if (target_role.includes('腾讯')) supplements.add('tencent-resume-guide')
  if (isTechRole(target_role))      supplements.add('tech-resume-optimizer')
  if (isCreativeRole(target_role))  supplements.add('creative-portfolio-resume')
  if (isAcademicRole(target_role))  supplements.add('academic-cv-builder')

  // resume_state 层(0.7.3,Phase 1 parse 时标 tag)
  const tagDist = analyzeBulletTags(parsed_resume)
  if (tagDist.responsibility_driven > 0.6) supplements.add('wyh0626-narrative-tools')
  if (tagDist.lacks_metric > 0.6)          supplements.add('resume-quantifier')
  if (tagDist.vague_action > 0.6)          supplements.add('resume-bullet-writer-action-verbs')

  // 兜底自检(永远加,长度短)
  supplements.add('tencent-6-mistakes-check')     // 6 大误区检查(通用)
  supplements.add('resume-ats-optimizer-checklist')  // ATS 自检

  return Array.from(supplements)
}
```

**好处**:
- Prompt 长度按场景缩,典型 case 加载 3-5 个段,不是 8 个全塞
- 不同 persona 看到的简历改写策略真的不同,不是"千人一面"
- 升级补充 skill 时只改路由表,主框架稳定

---

## 1. 主框架

**采用**:项目内 `lib/prompts/skill-matching.md`(79 行)+ `skill-matching-refs/*`(480 行,4 文件)。

**理由**:
- plan §A.1 lock 的 4 轮 review 稳定版
- 5 phase SOP 完整 + 选择题 4+1+E+F 模板 + 字节音乐业务 few-shot
- `multiple-choice-design.md` 5 条原则 + `red-flags-and-rationalizations.md` Anti-fabrication 表

**不可替换** — 主框架是 router,其他 skill 永远是 tool box。

---

## 2. 候选 skill 池(license 安全,按调用频次排序)

| 仓库 | license | 调用频次预估 | 调用场景关键词(详 §0.7) |
|---|---|---|---|
| **主框架** | 项目内 | 100%(所有 phase) | 主路由 |
| **#4 resume-bullet-writer** | MIT | ~95%(Phase 5 改进 5 必产 bullets) | 通用 candidate_bullets 生成 |
| **#3 wyh0626 narrative-tools** | MIT | ~70%(责任→成就场景多) | `responsibility_driven > 60%` / 林婷 / 李明 / 王雯 |
| **#4 resume-ats-optimizer** | MIT | ~50%(李明型 + 默认兜底自检) | 李明 / 校招通用 |
| **#2 tencent resume-guide** | MIT | ~40%(包含 6 误区通用检查) | 腾讯 target / 6 误区兜底 |
| **#4 resume-quantifier** | MIT | ~30%(王雯 / 陈昊 / `lacks_metric` 分布) | 王雯 / 陈昊 / 无量化 |
| **#4 tech-resume-optimizer** | MIT | ~25%(技术岗 target) | 陈昊 + CS / SWE / 算法 |
| **#4 career-changer-translator** | MIT | ~20%(林婷型) | 林婷 / 转专业 |
| **#4 creative-portfolio-resume** | MIT | ~5% | 设计 / 创意岗 |
| **#4 academic-cv-builder** | MIT | ~3% | 学术 / 科研 target |
| **#2 tencent recruitment-timeline** | MIT | Phase 4 引用 1 次 | 时间预算分流参考 |
| **#7 Resume-Matcher** | Apache 2.0 | 不调 prompt(只架构借鉴) | Phase 2 三段式 JSON schema |
| **#8 open-resume / #9 resume-lm** | AGPL | 不调代码(只看 UI 截图) | Phase 1 + Phase 0 UX 参考 |

---

## 3. 舍弃(理由清楚)

| 仓库 | 舍弃理由 |
|---|---|
| **#4 resume-tailor** | 跟主框架 Phase 5 完整 JD-tailored 重写功能重叠,不重复 |
| **#4 job-description-analyzer** | 跟主框架 Phase 2 JD 拆解功能重叠,不重复 |
| **#4 executive-resume-writer** | 学生用户基本不触发 |
| **#4 resume-version-manager / cover-letter-generator / salary-negotiation-prep / linkedin-profile-optimizer / interview-prep-generator** | 不在模块 B v1 scope(版本管理 / cover letter / 谈薪 / LinkedIn / 面试题生成),v2 可加 |
| **#5 chen3tu interview-master** | 重心面试(模块 C),`resume_analysis_checklist.md` 仅模块 C 可参考 |
| **#6 liyupi/yupi-skill** | 个人 voice 包,跟不二 IP 冲突,非简历工具 |

---

## 4. 整合方案 — 每 phase 怎么拼(基于 §0.7 路由)

### Phase 1 parse-resume(固定 prompt,无路由)

```
system prompt =
  主框架 question-batteries.md §Phase 1 解析步骤
+ #3 wyh0626 audit-checklist 的"责任驱动 vs 成就驱动" tag 标记
  (每条 bullet 打 narrative_tag: responsibility_driven / lacks_metric / vague_action / strong)
+ Anti-fabrication(缺失字段 null,绝不编造)
+ JSON schema(basic / education[] / experience[] / projects[] / activities[] / skills + bullet.narrative_tag)
```

**输出关键**:`bullet.narrative_tag` 分布 → 喂给 §0.7.3 决定 Phase 5 路由。

### Phase 2 parse-jd(固定,无路由)

```
system prompt =
  主框架 §Phase 2 派生候选岗位池 + Step 2 priority score
+ plan §C JD : 公司 = 80 : 20 权重
+ #7 Resume-Matcher 的 JD 三段式拆解架构(must_have / nice_to_have / soft)— 只借 schema,不抄 prompt
+ jd_summary 输出严禁出现公司名(0.3 硬约束 #1)
+ JSON schema(plan §8.12 §B.1 lock 字段名)
```

### Phase 3 excavate(固定,无路由)

```
system prompt =
  主框架 §Phase 3 全段(含字节音乐业务 few-shot)
+ multiple-choice-design.md 5 条原则(沾边都算 / 4+1 填空 / 双维度 / 不审判 / follow-up)
+ red-flags-and-rationalizations.md Anti-fabrication 表
+ 退出条件:连续 3 个"都没有" / 用户主动停 / ≥ 5 STAR
+ 末尾 Skeptical Recruiter(R1 模型):扮演怀疑 HR,对挖到的 hero story 提 3 个 weak spot
```

### Phase 4 learning-plan(固定 + #2 timeline 引用)

```
system prompt =
  主框架 §Phase 4 时间预算 3 档
+ #2 tencent recruitment-timeline.md(秋招/春招节点表)— 作为参考事实塞进 prompt context
+ 资源防幻觉硬约束(DeepSeek 无 WebSearch,不确认存在的只给关键词建议)
+ Day 粒度(≤1 月按天拆;>1 月按周拆)
+ JSON schema(time_budget / cards[])
```

### Phase 5 generate-resume(⭐ 动态路由,基于 §0.7)

```
const supplements = decide_skill_route(persona, target_role, parsed_resume)

system prompt =
  主框架 §Phase 5 综合输出
+ FOR EACH s IN supplements:
    + load_prompt_segment(s)   // 只加载路由到的,不全塞
+ 改进 5 lock:必产 3-5 candidate_bullets
+ Anti-fabrication:未完成项目 ⚠️;hidden_experiences 有 skeptical_flags 的要么不用要么加 mitigation
+ JSON schema(markdown / candidate_bullets[] / optimization_summary / used_supplements[](透明告诉用户用了哪几个))
```

**实施时**:在 `lib/prompts/skill-matching-refs/` 下新建子目录 `external/`,每个补充 skill 用 1 个 .md 文件(简短,只放该 skill 的核心 prompt 段),并保留原 LICENSE 头。`decide_skill_route()` 写在 `lib/skill-router.ts`,Phase 5 endpoint 调用。

### Phase 5b export-docx(无 LLM)

```
docx npm 序列化
+ plan §E.1 lock 版式(1 页 / 思源黑体 / 名字 18pt / 标题 12pt / 正文 10.5pt / 1.2 行距 / 黑白)
+ 文件名 {姓名拼音}_{target_role}_{YYYYMMDD}.docx
```

---

## 5. License 合规自查

| 风险 | Mitigation |
|---|---|
| 嵌入 #2 / #3 / #4 的 markdown 段到 `lib/prompts/skill-matching-refs/external/` | MIT 允许 verbatim 复制,**必须保留原 LICENSE 头部** |
| AGPL #8 / #9 | **绝不 fork / 绝不抄代码**;只看截图借鉴 UX |
| #7 Resume-Matcher | Apache 2.0,只借鉴架构思路,不引代码 |

---

## 6. 不变更的硬约束(从主框架继承)

| # | 约束 |
|---|---|
| 1 | 一 turn 一问(non-negotiable) |
| 2 | 沾边都算,不审判 |
| 3 | 永不输出公司名(LLM 输出层) |
| 4 | DeepSeek API 走 lib/llm.ts |
| 5 | JSON mode prompt 必须明示"返 JSON" |
| 6 | 4 套思辨纪律内化(Skeptical Recruiter / Anti-fabrication / Gap→Project Bridge / 反 rationalization) |

---

## 7. 仓库存在性 verification(亲自 WebFetch 2026-06-01)

| 仓库 | URL | License | 关键 verify 点 |
|---|---|---|---|
| #2 tencent | https://github.com/Echo-Smith/tencent-campus-recruit-generic | MIT ✓ | references/ 10 个 md |
| #3 wyh0626 | https://github.com/wyh0626/resume-optimizer | MIT ✓ | 4 references + agents/openai.yaml |
| #4 ResumeSkills | https://github.com/Paramchoudhary/ResumeSkills | MIT ✓ | 648 stars,20 skill 全清单已确认 |
| #5 chen3tu | https://github.com/chen3tu/interview-master-skill | MIT ✓ | 19 references,面试为主 |
| #6 yupi | https://github.com/liyupi/yupi-skill | MIT ✓ | 鱼皮 voice 包 |
| #7 Resume-Matcher | https://github.com/srbhr/Resume-Matcher | Apache 2.0 ✓ | 无公开 prompt 文件 |

#8 open-resume / #9 resume-lm:AGPL,绝不 fork。

---

## 8. Empirical 验证(2026-06-01 A/B 实验)

§0.5 / §0.6 / §0.7 设计经 A/B 实验验证。3 condition × 2 stress test persona × R1 + chat 判官盲评 6 维。

**结果**:
- C(Dynamic routing)总分 95(60×2 满)
- B(Static stuffing)总分 89
- A(Baseline 纯主框架)总分 77

C > B 7%,C > A 23%。两个 persona 判官都判 C 赢。Token cost C 比 B 节省 22%。

**实验后修订**:陈昊型路由加 `narrative-tools`(原 3 段 → 4 段),解决陈昊 C vs B 只差 2 分的问题。

详见 [ab-experiment-results.md](ab-experiment-results.md) + [ab-experiment-outputs.md](ab-experiment-outputs.md) + [ab-experiment-prompts.md](ab-experiment-prompts.md)(全部 raw 输出可审计)。

---

## 9. Next Action

设计 lock,进 Phase 1 编码:简历解析(upload UI + pdf-extract + docx-extract + parse-resume API)。

**实施增量**:
- 新建 `lib/prompts/skill-matching-refs/external/` 子目录(放 7 段补充 skill 的 prompt 段)
- 新建 `lib/skill-router.ts`(§0.7 路由表代码化)
- Phase 1 parse-resume 给每条 bullet 打 `narrative_tag`(喂 router 用)
- Phase 5 generate-resume 调 router 决定加载哪几段 supplement
