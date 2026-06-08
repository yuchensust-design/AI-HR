# 模块 5「AI 模拟面试」升级设计文档（v5 · 三轮审核 + 生产级加固）

- 日期：2026-06-08（v3/v4/v5 修订 2026-06-09）
- 状态：待用户确认定稿（设计阶段，未实施）
- 范围：offer-catcher-web 的 m5 模拟面试，从「静态一次性出题」升级为带岗位方法论 + 动态追问 + 双层评分的版本
- 关联：一审 [REVIEW.md](./2026-06-08-m5-mock-interview-upgrade-REVIEW.md)、二审 prompt [round2](./2026-06-09-m5-design-review-prompt-round2.md)、三审（双轴：借鉴×稳健）[REVIEW](./2026-06-09-m5-plan-vs-competitor-robustness-REVIEW.md)
- 重要前提（已核实）：竞品 InterviewForge **只做模拟面试一个场景，无真实岗位爬取（JD 写死）**。模拟面试是唯一功能重合点；本产品的 crawler 真实岗位能力竞品没有。故竞品参考严格锁定在模拟面试场景。

---

## 修订记录（v1 → v2，依据审核报告，均已对代码核实）

| # | 审核发现（已核实） | v2 修订 |
|---|---|---|
| R1 | m5 三个 LLM 路由**当前没有** `maxDuration`（仅 m6 有）；`lib/llm.ts` 的 `chat()` 无 timeout | maxDuration 从"既有约束"改为**待新增**：follow-up + 现有 3 个 m5 路由都要补 `export const maxDuration = 60`；follow-up 客户端 fetch 加显式 abort 超时 |
| R2 | `keyword-match.ts` **没有** `_score`/排序/top-K，只有二元 `matchKeywords`；同义词表全是产品经理向、**零后端词** | 方法论匹配是**净新增代码**，自带**独立关键词集**（不依赖那张 PM 同义词表）；只复用 `canonicalizeKeyword` 的 norm 思路；补一个真实存在的**通用兜底方法论** |
| R3 | `debrief` 是单次 V3.1 调用 + 单次 `JSON.parse`、max_tokens 3000；能力维度塞进同一 JSON 会因变长 502，**连 4 维一起挂** | 能力评分**拆成独立 LLM 调用 + 独立 try/catch**，失败只丢自己；这层用 **R1（reasoner）**，不在 per-turn 热路径 |
| R4 | 无 YAML/frontmatter 解析器；上 frontmatter 要么加依赖（撞 AGENTS.md）要么手写解析 | 方法论种子改为 **`.ts` 导出 `MethodologySpec` 对象**，零解析、类型安全；"加岗位=加一个 .ts" |
| R5 | 题库锚点 ROI 最低、易把题拽向八股、`reference_answer` 与 anti-fabrication 打架 | **v1 砍掉题库锚点**（retriever + seed JSON 移到后续增量）；先验证方法论 + 追问两条轴 |
| R6 | `live/page.tsx` 是 1338 行 reducer，TTS/ASR 靠**整数 index** 去重，splice 插追问会错乱；被一句"客户端接线"带过 | 新增**§5 客户端状态机改造**专章，列为实施最高风险，明确改 ID-based 去重、思考态、预算状态、finished 重算 |

`lib/m5/` 因此收敛到 5 文件（去掉 question-bank/ 与 frontmatter registry；v3 又把 rubric 折叠进 context）。**（v5 新增 trace.ts → 共 6 文件，见 §1.1）**

**v2 复审追钉（F1-F3，部分被 v3 二审推翻，见下）**：
- ~~F1 debrief 两次调用并行 allSettled~~ → **被 v3 G1 推翻**：allSettled 仍等两者，复盘页被拖到 R1 的 30-50s。改为解耦到独立路由 + 客户端懒加载。
- F2【中】follow-up **模型钉死 V3.1(chat)**，禁用 R1。→ §3.1 / §9（保留）
- F3【低】追问 insert 到母题之后(currentIdx+1)、不追加队尾。→ §5（保留）
- 附：follow-up 成本按"答题数"计 + 客户端廉价预门。→ §3.2.1 / §7.2（保留）

**v3 修订（依据二审「独立全面」报告，均已对代码核实）**：

| # | 二审发现（已核实 file:line） | v3 修订 |
|---|---|---|
| G1【中】 | debrief/page.tsx:332 整页 gated 在一次阻塞 fetch；§4 让 4 维(V3.1~10s)与能力(R1 30-50s)在**同路由 allSettled**，路由返回=max≈40s，**把所有人的复盘页从 ~10s 拖到 ~40s**（能力本是可选副产物） | 能力评分**从 debrief 路由解耦**：debrief 只返 4 维（快）；能力评分独立 `app/api/m5/capability` 路由，客户端**二次懒加载**，雷达后填。→ §4 / §1.2 / §6.2 / §9 |
| G2【中】 | follow-up splice 进 `state.questions` → evaluate-turn effect（依赖 `state.questions`，live:550-574）**重跑**；首评未返回时 turnEvaluations 仍空 → **对同一答案重复打分**，reducer 无去重累积重复项 | evaluate-turn 加 **in-flight `Set<question_id>` ref 去重**（或收窄 effect 依赖、不依赖 questions）。→ §5 / §7.2 / §9 |
| G3【中】 | backend.matchKeywords 若只放英文 token（Redis/JVM…），中文 JD「后端/服务端/高并发/分布式/微服务」漏匹配 → 误落 generic-tech | matchKeywords **中英文都覆盖**。→ §1.3 / §2.2 |
| C1【纠正】 | `thinking` **早在 Status 枚举里**（live:47-54），是 dead state（无 action 进入）；一审 + v2 §5 说"加枚举"**双方都错** | §5 改为"加进入 thinking 的 transition + 在其中挂起等 follow-up"，非加枚举 |
| C2【纠正】 | finished 已用实时 `s.questions.length`（live:146）自动重算；列为要改点是**伪风险** | §5 降级该点：真正的活是"答完不要同步推进"（hold），非长度数学 |
| C3【纠正】 | 整数 index 去重没那么脆（currentIdx 单调递增 + 只在 current 后插）；改 ID-based **赞成**但理由是"thinking 异步挂起需解耦推进"，非"index 会错乱" | §5 重述 ID 化的理由 |
| C4【YAGNI】 | rubric.ts 实质≈一行（读 spec.capabilityDimensions） | 折叠进 context.ts，文件数 6→5 |
| C5【补充】 | localStorage 之外，登录用户还写 Supabase `m5_interviews.turns_json`（live:672-686）；能力 evidence 要 scrub；follow-up 答案不可再生成 follow-up | 落入 §7.2 / §4 / §3 |

**二审正向论据（采纳为立项理由）**：现有 persona 已承诺「严厉=4-5 层追问 / 严谨=极高追问」（interviewer-personas.ts:73/104），但静态一次性出题根本兑现不了——**动态追问是填上 persona 早开的空头支票**，比"像竞品"强得多的理由。另：`{model:"reasoner", jsonMode:true}` 在本仓库 m3/excavate:336 已验证可用，R1+JSON 去风险。

**二审总体判定：再钉这 3 个中等点即可进入实施，可以进入写代码。**

**v4 修订（依据三审「借鉴×稳健」双轴报告，均已对代码核实）**：

| # | 三审发现（已核实 file:line） | v4 修订 |
|---|---|---|
| A1【高·借鉴】 | 竞品 `topic_plan` 真驱动排程（session_plan.py:31-33）；本计划漏了"简历弱点驱动出题/追问"——比已砍的题库锚点更有价值且不拽八股 | prep 顺带给每题填 `whatItTests` + **预设挖掘点/弱点**（InterviewQuestion 已有 `whatItTests?` 可选字段），喂给 follow-up 判断——**零新增调用**，兑现 strict persona「每段挖 1 个 weak spot」(personas.ts:71)。→ §2.3 / §3 / §6.1 |
| A2【中·借鉴】 | 竞品 grader 对照 reference 评分 | 每个能力维度加 `strongIndicator`（**描述强答案的"质量特征"、非事实答案**，与被正确砍掉的 reference_answer 区别开、不撞 anti-fabrication）。→ §2.1 / §4 |
| A3【中·借鉴】 | 竞品一套 dimensions 串起出题+报告；本计划 capabilityDimensions 与 examineGuide/followUpTree 是平行手写 prose，会漂移 | 加**一致性单测**（维度 key 在三处对齐）。→ §8 |
| B1【高·唯一真翻车】 | PAUSE/FINISH(live:194-206) 不看 status；thinking 态下迟到的 follow-up resolve 会**吹掉暂停 / 结束后又推进** | follow-up resolve **幂等守卫**：`if status!=="thinking" 或 题目 id 不匹配 → no-op`。§5 补 lifecycle 覆盖。→ §5 |
| B2【中】 | G2 真实但窗口更窄：evaluate-turn 已有 by-id 去重(live:554-557)，只挡"返回后"不挡"在途" | in-flight **`Set<question_id>`** 去重（措辞修正：补的是"在途"窗口）。→ §5 / §7.2 |
| B3【中】 | 8s abort 偏紧：输入含 transcript+followUpTree+redFlags 实际 ~1-1.5k token、非"几百" | abort 超时**提到 10-12s**。→ §3.4 |
| B4【中】 | ID 化漏了复位路径："重复问题"按钮直接 `ttsPlayedForIdx.current=null`(live:1207) | §5 ID 化要**显式覆盖这处复位**。→ §5 |

**三审推翻的预设（采纳）**：① 竞品"追问树分支选择"**根本不存在**（RulePlanner 纯规则不调模型）——本计划 followUpTree 已比竞品强，不必对齐。② "TTS 念母题时 follow-up 返回"时序上不成立（follow-up 只在答完后请求）——从风险清单移除。③ 现无 ASR 自动提交——thinking hold 永远用户显式触发，比担心的简单。

**三审总体判定：轴 A 补 3 处 + 轴 B 钉 1 高 3 中，无结构性问题，补完即可写代码。**

**v5 生产级加固（2 项，把"接近生产级"补到"可放心交付真实用户"）**：

| # | 生产级硬伤（已核实） | v5 增补 |
|---|---|---|
| O1【可观测性】 | 现仅 console 级埋点；线上"出题很差"投诉**无法复盘是哪个方法论、什么输入**；无成本/质量看板 | 每次 m5 LLM 调用（prep/follow-up/capability/debrief）写一条结构化 trace 到 **`m5_llm_traces` 表**（fire-and-forget，不阻塞、不影响主流程）。→ §4b / §6.1 / §9。**这是评分 eval 校准的前置**。 |
| R1【刷新丢失】 | Supabase + localStorage 存档都**只在 `finished` 写**（live:631 早返回）；中途刷新游客+登录**全丢** | 改**增量持久化**：每答完一题写 localStorage（游客+登录同设备）；登录用户增量写 Supabase（把现有写入移出 finished 门）。加**"继续上次面试"恢复流程** + reducer 可 rehydrate（**搭 §5 reducer 重构顺风车，比事后补便宜**）。→ §5 / §6.1 / §7.2 |

> v5 之后唯一仍在范围外、且是生产级真门槛的是 **评分 eval 校准**（§11 🔴-2）——它依赖 v5 的 trace，建议作为紧接 v5 的独立一步。

---

## 0. 背景与目标

### 0.1 为什么做
竞品 InterviewForge 是纯文字模拟面试 agent。客观结论：

- **值得借鉴的是工程骨架**：可插拔方法论（加岗位=加文件）、纯函数验证门、按岗位的考察维度/追问树/红旗信号。
- **它有三处"简历向"注水点（运行时是断的，不抄）**：(a) 记忆固化 `consolidate()` 从不被调用；(b) 7 段 ContextAssembler 非主上下文路径，子 Agent 实际只发 `[system,user]`；(c) PLAN 不调模型，题序开场就排好。
- **题库仅 40 道八股题、非护城河**；借结构不借内容。

offer-catcher m5 现状（客观）：

- 应用层 prompt 工程**比竞品更细腻**（anti-fabrication / 反 rationalization / persona forbidden_phrases / STT 误识别容错 / 口水话计数）。
- 架构是"静态一次性出题"，纯客户端驱动 + localStorage（最近 2 场），无服务端 session 状态。
- 拥有竞品没有的资产：语音 ASR/TTS、highlights→简历回填跨模块闭环。
- **最强立项理由（二审补）**：现有 persona 已**承诺**「严厉=4-5 层追问 / 严谨=极高追问」（interviewer-personas.ts:73/104），但静态一次性出题**根本兑现不了**。动态追问是**填上 persona 早就开的空头支票**——比"对标竞品"实在得多的理由。

### 0.2 目标
1. **岗位方法论驱动出题**（SKILL.md 机制的 `.ts` 落地）——出题从"通用"变"专业"。
2. **动态追问**（静态主题库 + 动态追问 hybrid）——面试官"会接话"。
3. **双层评分**——现有 4 表达维度（保留）+ 新增岗位能力维度（独立调用）。

> 题库锚点（原目标 4）按审核 R5 移出 v1，见 §9 后续增量。

### 0.3 硬约束（非破坏性）
- 不破坏语音 ASR/TTS 链路。
- 不破坏现有 4 维评分（PRD §3.6.8 锁定 4 维：逻辑性/具体性/应答清晰度/口水话频次）。
- 不破坏 highlights→简历回填闭环、公司名 scrub、skip 处理、N/A 短路。
- 保持客户端驱动 + localStorage（最近 2 场 FIFO），**不引入服务端 session 状态**。
- **【待新增，非既有】所有 m5 LLM 路由 `export const maxDuration = 60`**（现状缺失，本次补齐）。
- 遵守项目 AGENTS.md（"这不是普通 Next.js，改前读 node_modules/next/dist/docs"），**不新增第三方解析依赖**。

### 0.4 关键决策（已与用户确认）
- **岗位覆盖**：可插拔框架 + 少量种子岗。种子 = **通用行为面 BQ（role-agnostic）+ 后端（role-specific）+ 通用技术兜底**。
- **动态追问力度**：hybrid——固定主题库（5/10/15）+ 动态追问（全场预算约 5-10、每主题 ≤1）。
- **实施节奏**：四块（现为三块 + 兜底）作为一个整体一份 spec / 一个 plan，内部有建造顺序。
- **架构风格**：方案 C——客户端驱动 + 共享引擎核 `lib/m5/`，非破坏、零服务端状态。

---

## 1. 架构总览

### 1.1 模块布局（v5，6 文件）

```
lib/m5/
  methodology/
    specs.ts       # MethodologySpec 对象：bq / backend / generic-tech 兜底（纯 .ts，零解析）
    registry.ts    # selectMethodology(type, jdText) → MethodologySpec，自带独立关键词集 + 兜底
  context.ts       # 装配 prompt 段（prep & follow-up 共用）+ 能力维度装配（原 rubric，C4 折叠进来）
  follow-up.ts     # 追问门：判断 + 生成（被 follow-up 路由调用）
  verify.ts        # 纯函数校验门（去重/长度/scrub，借鉴竞品 verify.py）
  trace.ts         # v5-O1：recordTrace() 把每次 m5 LLM 调用写 m5_llm_traces（fire-and-forget）
```

> 已去掉 v1 的 `question-bank/`（R5）、frontmatter 解析（R4）、独立 rubric.ts（C4 折叠进 context）；v5 新增 trace.ts → **6 文件**。

### 1.2 路由改动一览（全部 additive / behavior-preserving）

> v5-O1：下表每个 LLM 路由在调用后追加一次 `recordTrace()`（fire-and-forget，不进失败回退路径）。

| 路由 | 改动 | 失败回退 |
|---|---|---|
| `app/api/m5/prep-questions/route.ts` | 注入方法论；**补 maxDuration=60** | 方法论加载失败 → 回退现有 TYPE_SPECS，输出形状完全等价 |
| `app/api/m5/evaluate-turn/route.ts` | **仅补 maxDuration=60**，逻辑不动 | — |
| `app/api/m5/debrief/route.ts` | **补 maxDuration=60**；**只返 4 维（逻辑完全不动、不变慢）**；能力评分不进此路由（G1 解耦） | — |
| `app/api/m5/capability/route.ts`（新，G1） | 能力维度评分，模型 R1；客户端在复盘页渲染后**二次懒加载**调用；`maxDuration=60` | 失败/超时 → 仅不显示能力雷达，4 维复盘不受影响 |
| `app/api/m5/follow-up/route.ts`（新） | 动态追问门：判断 + 生成；模型钉 V3.1；`maxDuration=60` | 失败/超时 → 客户端进下一题（fire-and-forget 容错） |

### 1.3 方法论选择机制（净新增代码，零新增必填输入）
m5 现有输入 `resume / jd / type(semi/bq/tech) / persona`，无结构化"目标岗位"。`registry.ts` 按 type 分流：

- `type=bq` → 固定用 `bq` 方法论（行为面，role-agnostic，覆盖所有用户），**不做 JD 匹配**。
- `type=semi` → 用 `bq` 方法论（半结构化=简历项目/行为追问为主，与 BQ 最近；v1 不套技术方法论，避免审核 R2 的语义不搭）。
- `type=tech` → 用 JD 文本对**方法论自带的独立关键词集**打分（命中数最高者胜）；命中 `backend` 则用之，否则 → `generic-tech` 兜底方法论。

**关键澄清（修正 v1 误述）**：
- 打分/选择是 `registry.ts` 里**新写**的小函数，**不是**"复用 `keyword-match.ts` 的 `_score`/top-K"（那些不存在）。
- 匹配用的关键词集**写在各 MethodologySpec 里**，**中英文都覆盖**（如 backend 含 Redis/MySQL/Kafka/JVM/线程池 **和** 后端/服务端/高并发/分布式/微服务/缓存/消息队列——G2 防中文 JD 漏匹配误落兜底），**不依赖** `keyword-match.ts` 那张产品经理向同义词表。
- `generic-tech` 兜底**真实存在**（specs.ts 里一条），不是口头回退。

"加岗位 = 加一个 MethodologySpec（含关键词集）"，registry 与各路由零改动。

---

## 2. 机制一：岗位方法论（`.ts` 落地）

### 2.1 数据结构
```ts
type CapabilityDimension = {
  key: string; label: string; weight: number;
  strongIndicator: string;   // A2：强答案的"质量特征"描述（非事实答案），作能力评分判定锚；不撞 anti-fabrication
};
type MethodologySpec = {
  id: string;                          // "bq" | "backend" | "generic-tech"
  appliesToType: ("bq"|"semi"|"tech")[];
  matchKeywords: string[];             // 仅 tech 选岗用，自带、与 keyword-match.ts 无关
  capabilityDimensions: CapabilityDimension[];  // 驱动能力雷达 + 出题配比
  examineGuide: string;                // 考察维度正文（注入 prep）
  pacingGuide: string;                 // 出题节奏（热身→主菜→换约束）
  followUpTree: string;                // 追问树（注入 follow-up）
  redFlags: string;                    // 红旗信号（注入 follow-up 判断）
};
```

### 2.2 三个种子
- `bq`（role-agnostic）：能力维度 = STAR完整度 / 影响力量化 / 自主决策 / 反思深度。覆盖 100% 用户。
- `backend`（role-specific）：能力维度 = 问题澄清/思路推导/选型/复杂度权衡/编码。消化竞品 backend/algorithm 内容，**按 offer-catcher persona + 纪律体系重写，不照抄**。`matchKeywords` 中英双覆盖（G3）。
- `generic-tech`（兜底）：能力维度 = 技术理解/方案权衡/沟通表达/落地能力。tech 匹配不到具体岗时用。

### 2.3 注入点 + 简历弱点驱动（A1）
`prep-questions` 在现有 `buildSystemPrompt` 末尾追加一段"本场岗位方法论"（examineGuide + pacingGuide + capabilityDimensions 配比）。**方法论加载失败 → 不追加，行为回退到今天**（现有 TYPE_SPECS/PERSONA 不动）。

**A1 简历弱点驱动（零新增调用）**：出题时让 prep **顺带为每题填**：
- `whatItTests`（InterviewQuestion 已有该可选字段）——本题考察的能力点（挂 capabilityDimensions 某 key）；
- **预设挖掘点/弱点**（复用同一字段或新增可选 `digHint?`）——"这题如果答得浅，该往哪挖"。

这条线把竞品 `topic_plan`（简历×岗位交集驱动排程，session_plan.py:31-33）的价值拿过来，**且不引入题库锚点的八股风险**（挖的是简历里的真实经历，不是标准答案）。follow-up 直接读这个预设挖掘点做判断（见 §3），兑现 strict persona「每段挖 1 个 weak spot」(personas.ts:71)。

---

## 3. 机制二：动态追问（hybrid）

### 3.1 新路由 `app/api/m5/follow-up/route.ts`
- `export const maxDuration = 60`。
- **模型钉死 V3.1（chat），禁止用 R1（reasoner）**：本路由是语音热路径，§3.4 的延迟预算（~1-1.5k token / 客户端 10-12s abort）只在 fast 模型下成立；R1 会必爆超时、体验崩。（与能力评分专用 R1 对称——各自钉死。）
- 输入：`{ main_question（含 whatItTests + 预设挖掘点）, answer_transcript, filler_count, methodology_id, persona, type, follow_ups_used, follow_up_budget }`。
- 单次调用内"门 + 生成"二合一：依据方法论 `followUpTree` + `redFlags` **+ 母题预设挖掘点（A1）**判断：
  - 含糊 / 缺数字 / 命中红旗 → 生成 1 个追问（按追问树分支：思路对→引导优化 / 卡住→递进提示 / 一上来最优→换约束 / 含糊→要具体）。
  - 否则 → `{ follow_up: null }`。

### 3.2 预算与边界
- 预算由题数推导：5→3 / 10→6 / 15→9（约 5-10）。客户端持有 `follow_ups_used`。
- 每主题 ≤ 1 追问（v1 有界）。
- 预算耗尽 / 跳过题（skipped）→ 客户端**不调用**此路由，直接进下一题。
- **不对追问的答案再生成追问**（C5）：`source="follow_up"` 的题答完后客户端 guard 跳过 follow-up，保证"每主题 ≤1"硬成立。

### 3.2.1 客户端廉价预门（成本优化，建议采纳）
"门+生成二合一"意味着：预算没耗尽前，**每道答完的题都会打一次服务端往返**，哪怕返回 `follow_up:null`。即延迟税/ token 成本按"答题数"计，不是按"生成的追问数"计。
- 缓解：客户端在调 follow-up 前先做一个**零成本预门**——若 `filler_count` 低 **且** transcript 足够长 **且** 含数字（明显答得好），直接跳过这次调用、进下一题，不打 LLM。
- 这是纯客户端规则、可单测、可关；把"明显答得好"的题免掉一次往返，显著降本而几乎不损动态感。

### 3.3 纯函数验证门 `verify.ts`（借鉴竞品 verify.py）
追问必须：非空、不与已问题目重复（字符串相似度）、长度 ≤ 上限、已 company-scrub。任一不过 → 丢弃追问，进下一题（优雅降级）。

### 3.4 延迟与超时（纳入审核 R1/R3）
- 单次短调用，在 maxDuration=60 内。**注意（B3）**：输入含 transcript + followUpTree + redFlags + 挖掘点，实际约 **1-1.5k token、非"几百"**。
- 因 `lib/llm.ts` 的 `chat()` 无 timeout，**客户端 fetch 必须加显式 abort 超时**，按上面体量定 **10-12s**（原 8s 偏紧、正常情况会偶发误杀）；超时即按"进下一题"处理（resolve 仍走 §5 幂等守卫）。
- 生成的 1-3s 客户端显示"面试官思考中…"过渡态（真人面试官本就停顿，不算体验损失）。

---

## 4. 机制三：双层评分（能力维度解耦为独立路由 + 客户端懒加载）

- **第一层（现有，锁定，完全不动）**：4 表达维度，per-turn 快评（evaluate-turn 不变）+ debrief 4 维雷达。
- **第二层（新增，独立路由 + 懒加载）**：岗位能力维度（来自方法论 `capabilityDimensions`，带权重），**整场聚合**，第二个雷达。

**关键修订（v3 G1，推翻 v2 的"同路由 allSettled"）**：
- **debrief 路由不变慢、只返 4 维**。能力评分**不进 debrief 路由**——因为 debrief/page.tsx:332 整页 gated 在一次阻塞 fetch，哪怕 allSettled 并行，路由也要等 R1（30-50s）返回，会把**每个用户**的复盘页从 ~10s 拖到 ~40s。能力本是可选副产物，不该拖慢主复盘。
- 能力评分独立到 **`app/api/m5/capability` 路由**，模型 **R1（reasoner）**（`{model:"reasoner", jsonMode:true}` 已在 m3/excavate:336 验证可用）。
- 客户端在**复盘页渲染出 4 维之后**，再**二次懒加载**调 capability 路由；能力雷达以 loading→fill 的方式后填（类似骨架屏）。
- capability 路由**失败/超时 → 仅不显示能力雷达**，4 维复盘完全不受影响（核心不变量天然成立——它在另一个请求里）。
- `capabilityScores` 为 debrief 结果的**可选**扩展字段，但**由 capability 路由产出、客户端合并**，不由 debrief 路由返回。
- 能力 `evidence` 引 transcript → **必须 company-scrub**（C5）。
- **判定锚（A2）**：每维评分时把该维的 `strongIndicator`（强答案的质量特征）作为打分参照注入 prompt——借竞品 grader"对照参照评分"的稳，但参照的是**质量特征**而非标准答案，**不撞 anti-fabrication**（不会逼用户的真实经历去对标某个"正确答案"）。

报告价值：从"你表达有进步空间"→"你的复杂度分析是短板"。

---

## 4b. 机制四：可观测性 / trace 落库（v5-O1）

**目标**：线上任何一场面试可复盘"用了哪个方法论、什么输入、产出什么、花多少 token、多慢、有没有报错"；并为后续评分 eval 校准提供数据底座。

- **新表 `m5_llm_traces`**（Supabase）：
  ```
  { id, session_id, route ("prep"|"follow-up"|"capability"|"debrief"),
    methodology_id, model ("chat"|"reasoner"),
    input_snapshot (截断 + scrubCompanyNames，或 hash),
    output_snapshot (截断), prompt_tokens, completion_tokens,
    latency_ms, ok (bool), err_msg, created_at }
  ```
- **写入方式**：共享 helper `lib/m5/trace.ts` 的 `recordTrace(...)`，每个 m5 路由在 LLM 调用后调用。**fire-and-forget**：trace 写失败只 `console.warn`，**绝不阻塞或拖垮主流程**（与 evaluate-turn 容错同纪律）。
- **隐私**：input 含简历/JD → 存**截断 + scrub**（或仅 hash），不堆原文。
- **范围边界（v5）**：只做"写 trace 表"。成本/质量**可视化看板**留作增量（§11，在 trace 表上做 admin 查询即可，不阻塞）。
- **价值链**：trace 是 §11 🔴-2「评分 eval 校准」的前置——没有 trace 就无法系统回看评分质量。

---

## 5. 客户端状态机改造（`app/m5/live/page.tsx`，实施最高风险，审核 R6 专章）

现状：1338 行 reducer。`USER_ANSWER_DONE` 现在**同步**推进 `nextIdx = currentIdx + 1`（约 :134-164）。**核心改造就是这一处：答完不要同步推进，先 hold 进 `thinking` 等 follow-up 落定**，其余多为连带。

改造要点（plan 必须逐条单列；已按二审纠正）：
1. **`USER_ANSWER_DONE` 拆两段**（真正的硬改）：① "记录答案 + 进 `thinking`（**不推进 index**）"；② follow-up 落定后的 "（有追问则）insert + 推进 / （无追问则）直接推进"。
2. **【B1·唯一真翻车点】follow-up resolve 幂等守卫**：thinking 态期间用户可能 PAUSE / FINISH / 退出，或 abort 后迟到的响应才回来。现有 `PAUSE/FINISH`（live:194-206）**不看 status**，迟到的 follow-up resolve 会**把暂停吹掉 / 在已结束后又推进**。修法：follow-up 的 `.then/.catch` 落地前先判 **`if (status !== "thinking" || 返回题目 id ≠ 当前母题 id) → no-op`**，把"推进"动作收进一个只在 thinking 态生效的 action。这条 lifecycle 必须在 plan 里单列推演（与静默60s/暂停恢复/跳过/查看思路/摄像头 全部交叉检查）。
3. **`thinking` 状态已存在**（live:47-54，是 dead state，无 action 进入）——**不是加枚举，而是加进入它的 transition + 在其中挂起等 follow-up**（C1 纠正）。注：现无 ASR 自动提交，进入 thinking 永远由用户显式"答完"触发，比预想简单。
4. **追问 insert 到母题之后（currentIdx+1）**，紧接母题被问（"接话"），不追加队尾（F3）。
5. **去重改 ID-based（含 B4 复位路径）**：把 TTS/ASR 的"已处理"判断从整数 index 改为 **question.id**（C3：异步挂起 + 中段 insert 后 ID 比标量更稳）。**务必同时改"重复问题"按钮的复位**——现为 `ttsPlayedForIdx.current = null`（live:1207），ID 化后要按 question.id 复位（B4，§5 原稿漏了这处）。
6. **修 evaluate-turn 重放并发（G2/B2）**：evaluate-turn effect 依赖含 `state.questions`（live:550-574），follow-up insert 改 questions 会重跑；现有 by-id 去重（live:554-557）只挡"返回后"、**不挡"在途"**。修法：加 in-flight **`Set<question_id>` ref**（覆盖在途窗口），或收窄 effect 依赖不依赖 `state.questions`。
7. **预算状态**：reducer 新增 `follow_ups_used`，达预算 / 追问的答案（不对追问再追问）/ skipped → 跳过 follow-up（§3.2）。
8. **finished 自动重算（C2，非要改点）**：reducer 已用实时 `s.questions.length`（live:146）、header 计数也实时（:894）；追问 insert 后完成判定**自动适配**，无需额外数学。
9. **【v5-R1】增量持久化（搭本次 reducer 重构顺风车）**：现存档只在 `finished` 写（live:631 早返回）→ 改为**每答完一题/进 thinking 就写**。同设备恢复用 **localStorage 增量写**（游客+登录都覆盖）；登录用户额外**增量写 Supabase**（把 live:671-686 那段移出 `finished` 门、改 upsert）。
10. **【v5-R1】"继续上次面试"恢复**：页面加载时检测到未完成 session（localStorage/DB）→ 弹"继续上次" → 用持久化 state **rehydrate reducer**（新增 `REHYDRATE` action）。注：**语音是瞬时态恢复不了**——恢复到"准备回答第 N 题"，不续在某句话中间，这对用户可接受。reducer 的 state 序列化/反序列化是纯函数，可单测。

> §5 是整个方案唯一的非纯函数复杂改动。**建议把"推进决策"抽成纯函数**（输入 status + 当前题 + follow-up 结果 → 下一 state），让 B1 幂等 + G2 并发都能单测；happy-path 手测抓不到这两条，plan 须配显式 race 用例（follow-up 先于 evaluate-turn 返回；thinking 态下 PAUSE 后 follow-up 迟到）。

---

## 6. 数据流与类型

### 6.1 类型扩展（`lib/interview-types.ts`，全部 additive / 可选，旧 session 兼容）
```ts
// InterviewQuestion 新增
source?: "main" | "follow_up";
parent_id?: string;     // 追问挂在哪道主题下
digHint?: string;       // A1：prep 预设的"该题若答浅往哪挖"，喂给 follow-up
// 注：whatItTests? 字段 InterviewQuestion 已有（interview-types.ts），A1 复用它挂能力点

// InterviewSessionConfig 新增
target_role?: string;       // tech 推断结果（展示用）
follow_up_budget?: number;

// DebriefResult 新增（capabilityScores 由独立 capability 路由产出、客户端合并，非 debrief 路由返回 — G1）
capabilityScores?: CapabilityScore[];
methodology_id?: string;

// 新类型
type CapabilityScore = { key: string; label: string; score: number; evidence: string };
type FollowUpDecision = { follow_up: InterviewQuestion | null; reason: string };
// MethodologySpec / CapabilityDimension 见 §2.1
// v5-R1：持久化快照复用现有 InterviewSession（已可序列化）+ reducer 新增 REHYDRATE action；状态序列化/反序列化为纯函数
// v5-O1：LlmTrace 类型定义在 lib/m5/trace.ts，不入 interview-types
// 说明：v5 仍不引入"服务端 session 状态/agent runtime"——DB 只作存储，客户端仍驱动全程（与 §0.3 一致）
```

### 6.2 端到端数据流（升级后）
```
配置页 → InterviewSessionConfig（+follow_up_budget；tech 时推断 target_role）
  ↓
prep-questions：registry 选方法论 → 注入 prompt → 主题库 InterviewQuestion[]（source=main）
  ↓
live 页（客户端驱动，语音，§5 改造）：
  每道主题 →（TTS 念题）→ 用户答（ASR + 口水话计数）→
    evaluate-turn（后台 4 维快评，不变）
    follow-up（预算内且未跳过 → 判断+生成 source=follow_up；否则进下一题）
  ↓
debrief：4 维雷达（V3.1，不变，~10s 返回）+ highlights→简历回填（不变）
  ↓（复盘页渲染出 4 维后，客户端二次懒加载）
capability 路由（独立，R1）→ 能力雷达后填；失败仅不显示，不影响 4 维
  ↓
localStorage（最近 2 场 FIFO）+ 登录用户 Supabase m5_interviews.turns_json（两个汇，体积见 §7）
```

---

## 7. 错误处理、非破坏性与遗漏风险（含审核 R7）

### 7.1 失败回退表
| 失败点 | 行为 |
|---|---|
| 方法论加载失败 | prep 回退现有 TYPE_SPECS，输出与今天一致 |
| follow-up 路由失败/客户端超时 | 进下一题，不阻塞 |
| 追问验证门不过 | 丢弃追问，进下一题 |
| 能力评分（独立 capability 路由，客户端懒加载）失败 | 仅不显示能力雷达，4 维 debrief 不受影响（在另一请求里） |
| 旧 localStorage session | 新字段全可选，安全回退 |
| 公司名 | 所有新产出文本继续 scrub |

**核心不变量**：把所有新机制关掉后，m5 行为与今天逐路由等价。能力评分的独立调用是守住该不变量的关键（R3）。

### 7.2 显式纳入的遗漏风险（审核 R7）
- **并发/竞态（含 G2 真 bug）**：(a) 答完一题时 evaluate-turn（fire-and-forget）与 follow-up 并发两个 LLM 请求——约定 follow-up 不等 evaluate-turn，各按 question.id 写回，互不依赖。(b)【G2，必修】follow-up insert 改 `state.questions` 会**重触发 evaluate-turn effect、对同一答案重复打分**——加 in-flight `Set<question_id>` ref 去重（见 §5 第 6 点）。所幸 debrief 从 transcript 重评、不消费 turn_evaluations，分数不被污染，但不修会浪费 token + UI 可能重复项。
- **follow-up token / 延迟成本（按答题数计）**：因"门+生成二合一"，预算未耗尽前每道答完题都打一次往返（含返回 null 的）。成本是"答题数 × 一次 chat 往返"，不是"追问数"。缓解见 §3.2.1 客户端预门；实施时按 15 题估算上限 token。
- **存储容量（两个汇，C5）**：15 主题 + ≤9 追问 + 每题 transcript + 双雷达，单 session 变胖。**localStorage（游客）和登录用户的 Supabase `m5_interviews.turns_json`（live:672-686）都要算**。实施时估算单场体积，必要时历史场只存摘要（不存全 transcript）。
- **中途刷新丢状态（v5-R1 解决）**：原 v1-v4 接受现状（纯内存 reducer，刷新即丢）；**v5 改为增量持久化 + "继续上次"恢复**（§5 第 9-10 点）。同设备恢复用 localStorage 覆盖全部用户；登录用户增量写 DB。语音瞬时态不恢复（回到"准备答第 N 题"）。
- **可观测性（v5-O1 升级）**：从 console 级升级为 **`m5_llm_traces` 表落库**（§4b）——follow-up 触发率/命中红旗率 + 成本/延迟/错误均可查询复盘；看板留作增量。

---

## 8. 测试与回归

### 8.1 单元测试（纯函数，借鉴竞品"纯函数好测"）
- `registry.ts`：按 type 分流、tech 关键词打分选岗（**含中文 JD 命中**，G3）、`generic-tech` 兜底、命中不到的回退。
- `verify.ts`：追问校验门（空/重复/超长/未 scrub 各 case）。
- `context.ts`：能力维度装配（权重、维度数；原 rubric，C4 折叠）。
- **维度单源一致性（A3）**：断言 capabilityDimensions 的 key 集合在 examineGuide / followUpTree / 报告雷达三处对齐，防 prose 漂移。
- 客户端预门（§3.2.1）：好答案跳过 / 差答案放行。
- **推进决策纯函数（§5）**：B1 幂等（thinking 态外的 resolve = no-op）+ G2 在途去重，单测覆盖。
- **race 用例**：① follow-up 先于 evaluate-turn 返回 → 同一 question_id 只评分一次（G2/B2）；② thinking 态下 PAUSE 后 follow-up 迟到 → 不吹暂停、不推进（B1）。
- **state 序列化/反序列化（v5-R1）**：dump→rehydrate 后 state 等价（纯函数，可单测）。
- **trace 容错（v5-O1）**：`recordTrace` 写失败不抛、不影响主返回（mock Supabase 报错断言主流程正常）。

### 8.2 回归测试
- prep-questions 关闭方法论加载 → 输出形状与今天一致。
- debrief 路由 → 只返 4 维、响应时间与今天一致（验证 G1：未被能力评分拖慢）。
- capability 路由 mock 失败 → 复盘页 4 维正常、仅无能力雷达。

### 8.3 手动验证（按 worktree 工作流）
- 本地 dev 跑完整语音面试一场：主题库 + 触发追问 + "思考中"态 + TTS/ASR 不重复不漏（§5）+ 复盘 4 维秒出、能力雷达后填。
- 验证 highlights→简历回填仍工作。
- 用户确认效果后再 merge + push + 删 worktree。

---

## 9. 实施建造顺序（一个 plan 内部）
1. `lib/m5/` 骨架 + 类型扩展（可选字段，零行为变化）+ 给 3 个现有 m5 路由补 `maxDuration=60`（顺手修 debrief 现存超时隐患）。
2. `methodology/specs.ts`（三个种子，matchKeywords 中英双覆盖，每维带 strongIndicator）+ `registry.ts`（分流+打分+兜底）+ 能力维度装配 + **维度单源一致性单测（A3）**。
3. prep-questions 注入方法论 + **每题填 whatItTests/digHint（A1 简历弱点驱动）** + 回退 + 回归。
4. follow-up 路由（**模型钉死 V3.1**，读 digHint）+ `verify.ts` + 客户端预门（§3.2.1）+ 超时 10-12s（B3）+ 单测。
5. **`live/page.tsx` 状态机改造（§5）**——最高风险：把"推进决策"抽**纯函数**（B1 幂等守卫 + G2 在途去重，可单测）；`USER_ANSWER_DONE` 拆 hold/推进 + thinking transition + ID 化去重（含 B4 重复问题复位）+ 预算/追问 guard。单列详细步骤 + 两条 race 用例 + 本地语音手测。
6. **`capability` 独立路由（R1）+ 客户端复盘页二次懒加载 + 能力雷达（loading→fill）**（§4 G1）。debrief 路由本身**只补 maxDuration、不加能力评分**。验证 4 维秒出不被拖慢。
7. **【v5-O1】`lib/m5/trace.ts` + `m5_llm_traces` 表 + 4 个路由接 `recordTrace`（fire-and-forget）** + 容错单测。
8. **【v5-R1】增量持久化 + "继续上次"恢复 + `REHYDRATE`**（搭 step 5 reducer，建议合并到 step 5 做）+ 序列化单测。
9. 全链路本地语音回归 + 刷新恢复手测 + trace 落库抽查。

每步独立可验证、可单独回退。

---

## 10. 明确不做（YAGNI / 防过度设计）
- 不做向量 RAG / embedding。
- **v1 不做题库锚点**（retriever + seed JSON）——ROI 最低、易拽向八股、`reference_answer` 与 anti-fabrication 打架（审核 R5）。见下"后续增量"。
- 不做服务端 session 状态 / agent runtime（保持客户端驱动）。
- 不上 frontmatter/YAML 解析（用 `.ts` 对象，审核 R4）。
- 不照抄竞品三处注水机制（记忆固化链 / 7 段 ContextAssembler / 模型 PLAN）。
- 不一次铺 7-10 个岗位（先 3 个种子验证框架）。
- per-turn 不加能力维度（只在 debrief 独立调用聚合）。

### 后续增量（本次范围之后，详见 §11 路线图）

---

## 11. 附录：现状 → v4 → 后续路线图

### 11.1 一场面试体验：今天 vs v5 做完后
| 环节 | 今天 | v5 做完后 |
|---|---|---|
| 出题 | 简历+JD 凭空生成、全场静态通用 | 注入岗位方法论 + 每题预设弱点挖掘点，更专业扣岗 |
| 会不会接话 | ❌ 念稿子，答得含糊也直接下一题 | ✅ 含糊/缺数字/命中红旗 → 当场追问（全场 5-10、每主题≤1）|
| persona 追问承诺 | 写了「严厉=4-5 层追问」但静态出题兑现不了 | 动态追问真正兑现 |
| 复盘评分 | 4 维（表达好不好） | 4 维秒出 + 岗位能力雷达（能力强不强）|
| 复盘速度 | ~10s | 4 维仍 ~10s；能力雷达懒加载后填，不拖慢 |
| 报告 | "表达有进步空间" | "复杂度分析是你的短板"（具体到能力项）|
| 中途刷新 | ❌ 全丢 | ✅ 增量持久化 + "继续上次"恢复（同设备全覆盖）|
| 可观测性 | console 级 | `m5_llm_traces` 落库，任意一场可复盘方法论/输入/成本/延迟 |
| 语音/简历回填闭环 | 已有 | 保留不变 |
| 工程 | 一组直连 LLM 的路由 | 可单测共享引擎核（加岗位=加一个 .ts）|

### 11.2 即便 v5 做完仍可继续改进（按性价比，🔴=建议下一步）

**🔴 第一档：拉开差距、且本产品独有（v5 之后最该做）**
1. **评分校准 / eval**——v5 的 trace 已就位，正好在它上面建小评测集（人工标注答案应得分）回归 prompt 改动。**这是 v5 之后唯一仍在范围外的生产级真门槛**，同 [[project_quiz_accuracy_issue]] 同类。
2. **用 m6 真实岗位 JD 出题**——竞品永远做不到（它 JD 写死、无爬虫）。让用户选真实在招岗位直接生成面试，打通"全链路+真实数据"优势。
3. **跨场进步追踪**——现在只存最近 2 场、各自孤立；做"复杂度分析 3 场从 2→4"趋势，粘性高、数据已在存。

**🟡 第二档：更像真人，工程更重**
4. 自适应难度（按上一题表现调下一题；竞品开场固定阶梯做不到）。
5. 多层追问（v4 每主题≤1；放开预算 + 防无限）。
6. 语音维度分析（语速/停顿/语气稳定度；现仅数口水话，音频流已有）。
7. 更多岗位方法论（前端/算法/数据/产品/运营 = 各加一个 MethodologySpec；岗位数到 7-10 再考虑 frontmatter+解析器）。

**🟢 第三档：锦上添花 / 成本约束放开后**
8. 跨设备会话持久化（v5 已做同设备恢复；剩"换设备续上"的 DB 增量同步）。
9. 可观测性看板（v5 已落 trace 表；剩在其上做 admin 成本/质量可视化）。
10. 真·实时打断 barge-in（全双工语音，工程量大；现为回合制）。
11. 视频/表情分析（有摄像头未用上；ROI 与合规需掂量）。
12. 题库锚点降级版（仅评分参考、不进出题 prompt；非必要不做，避免污染个性化出题）。

> 取舍提醒：v5 之后最该做的**不是继续堆 m5 花样，而是 🔴-1 评分 eval 校准**——它依赖 v5 的 trace、是评分从"看着专业"变"可信"的唯一途径，比任何新功能都更能把产品推向生产级。
