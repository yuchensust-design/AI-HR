# 审核报告 — m5 模拟面试升级设计

- 日期：2026-06-08
- 被审文档：[2026-06-08-m5-mock-interview-upgrade-design.md](./2026-06-08-m5-mock-interview-upgrade-design.md)
- 审核方式：逐条对照代码核实文档断言（默认怀疑，不照单全收）
- 已核实文件：`app/api/m5/{prep-questions,evaluate-turn,debrief}/route.ts`、`lib/{keyword-match,llm,interview-types,interview-type-prompts,interviewer-personas}.ts`、`app/m5/live/page.tsx`、`package.json`、`AGENTS.md`

---

## 总体判定：**需修订后实施**

工程方向是对的（可插拔方法论 / 纯函数门 / 非破坏分层），不是根本性错误。但文档对现有代码有**三处事实性误述**，且把全部实施风险压在了它一笔带过的那个文件（`live/page.tsx`）上。这些点会在实施时翻车或注水。按下面修订后可进入实施。

> 给实施 agent 的提醒：本报告里凡带 `file:line` 的都是已核实的事实，请直接以代码为准；设计文档与代码冲突处，以代码为准。

---

## 逐维度发现

### 1. 非破坏性 — 【高】部分成立，但有两个被掩盖的破口

**破口 A：`maxDuration=60` 被当成"现有不变量"，但现状根本没有。**
设计文档 §0.3 把"所有调 LLM 的路由 `maxDuration=60`"列为既有硬约束。实测 `grep maxDuration app/api/m5/` **零命中**——`prep-questions`、`evaluate-turn`、`debrief` 全没有，只有 m6 三个路由有。这与项目长期规则（线上默认 10s 静默退化）冲突。**新 follow-up 路由必须显式 `export const maxDuration = 60`，并应顺手给现有三个 m5 LLM 路由补上。** 文档没把这当"要新增的东西"，会误导实施者以为已存在。

**破口 B：debrief 的"能力评分失败不影响 4 维"这条优雅降级，按文档写法不成立。**
`app/api/m5/debrief/route.ts:375` 是**单次 V3.1 调用 + 单次 `JSON.parse`**，`max_tokens` 仅 3000（`:307`）。设计文档 §2.4 把 `capabilityScores` 描述成"在 debrief 整场聚合"的同一份输出。若把 N 维能力雷达 + evidence 塞进同一个 JSON，输出变长 → 截断/解析失败 → `debrief/route.ts:380-386` 直接 **502，连现有 4 维一起挂**。"省略 capabilityScores、4 维不变"只有在**能力评分走独立 try/catch 或独立 LLM 调用**时才成立。
**修改建议：能力评分走独立旁路（独立 catch，或第二次小调用），失败只丢自己。**

其余回退路径（方法论加载失败 → 回退 `TYPE_SPECS`；锚点为空 → 纯生成）在 prep 侧是真 additive，这部分判断正确。

### 2. 方法论选择机制 — 【高】文档高估了 `keyword-match.ts` 的能力

文档 §1.3 / §3.1 称用 `keyword-match.ts` "照搬竞品 `_score`、命中数最高者胜、取 top-K"。**核实：`lib/keyword-match.ts` 里没有 `_score`、没有排序、没有 top-K。** 它只导出 `matchKeywords(jdKeywords, resumeText) → {matched, missing}`（二元命中）、`getJdKeywords`、`canonicalizeKeyword`；`isHit` 还不是导出的。要做"岗位打分选 backend.md"和"题库 top-K 锚点"，**排序/检索逻辑是净新增代码**，不是"复用"——能复用的只有 `norm()` 和同义词表。

更要命的是那张同义词表 `keyword-match.ts:24-60` **几乎全是产品经理向**（AI产品 / 用户访谈 / PRD / 原型 / axure / figma…），后端词（Redis/MySQL/Kafka/JVM/线程池）**一个都没有**。用它给 `backend` 岗做关键词匹配，唯一的 role-specific 种子会因命中率低而**正好选错**。`type=semi`（半结构化，本就是简历项目追问为主）套后端方法论也语义不搭；非工程岗 / 短 JD / 中英混写会乱选。文档提到的"回退通用技术方法论"**没列进种子，等于不存在，必须补**。
**修改建议：方法论匹配自带独立关键词集（不依赖那张 PM 表）；或 v1 只对 `type=tech` 启用方法论匹配，`semi/bq` 不走。**

### 3. 动态追问的延迟与体验 — 【中】延迟乐观，且"客户端不变"是错的

延迟本身可控（几百 token 短调用，60s 内没问题），但前提是按第 1 点补 `maxDuration`，且 `lib/llm.ts` 的 `chat()` **没有任何 timeout**（OpenAI client 默认 ~600s），所谓"超时回退"实际只能靠客户端 fetch abort——文档没写客户端超时。

真正被低估的是**客户端状态机改动**。文档用"客户端驱动不变""live 页客户端接线"一句话带过，实际 `app/m5/live/page.tsx` 是 1338 行 reducer 状态机，`USER_ANSWER_DONE` 现在是**同步**推进 `nextIdx = currentIdx + 1`（`live/page.tsx:144-163`）。插入动态追问需要：
- (a) 新增"思考中"中间态（现有 `Status` 枚举没有）；
- (b) 把追问 splice 进 `questions` 或挂在 currentIdx 后；
- (c) TTS / ASR 全靠**整数 index 去重**（`ttsPlayedForIdx.current === state.currentIdx` `:503`、`asrStartedForIdx`），splice 改变索引会让这些 ref 误判（重复念题或漏念）；
- (d) `finished` 判定 `nextIdx >= questions.length` 要随动态长度重算；
- (e) `follow_ups_used` 预算是 reducer 里没有的新状态。

**这是整个方案最复杂、最难测（非纯函数）的改动，文档几乎没覆盖。** 每主题 ≤1 追问 + 预算 5-10 的设定本身合理，不算伪动态；但实施风险全在这个文件，plan 必须给它单列详细步骤。

### 4. 双层评分的价值 vs 复杂度 — 【中】有价值，但放同一次调用是错的

"复杂度分析是你的短板"确实比"表达有进步空间"强，价值成立；两个雷达（4 表达维 vs N 能力维）语义不重叠、UI 不冗余。但注意现状 debrief 用的是 **V3.1（chat），不是 R1**（`debrief/route.ts:375`，头注释写"R1+retry"但代码没实现 retry）。把 N 维能力评分压进这同一个已经很满的 V3.1 JSON（已含 4 维 + highlights + transcript_summary + evidence + missedSignals），既是 token 风险（同第 1 点 B），也会让评分质量打折。
**修改建议：拆成独立调用，这层用 R1 更合适（能力推理需要深推理），反正不在 per-turn 热路径。**

### 5. 题库锚点的投入产出 — 【中】ROI 存疑，且有把 LLM 拽向八股的风险

方向对（文档自己也承认"让 LLM 结合简历改写、不照抄"）。但：
- (a) 维护 30-50 题/岗 JSON + 锚点检索逻辑，相比纯 LLM 生成，提升主要在"防漏题/给评分参考答案"，对一个**简历个性化是核心优势**的产品，锚点可能把题往通用八股拽；
- (b) `reference_answer` 作评分旁路注入，会和 anti-fabrication 纪律打架（标准答案 vs 用户简历真实经历）。

**修改建议：v1 砍掉锚点，或降级为"只给评分参考、不进出题 prompt"。先验证方法论 + 追问两条轴，锚点作后续增量。** 直接呼应文档 §0.4"最低内容成本验证框架"。

### 6. 过度设计 / YAGNI — 【中】七个文件里有两个是仪式性的

- `verify.ts` 纯函数门：**保留**，真有用、可单测，follow-up 必须有它。
- `registry.ts` + `.md` frontmatter：**风险**。`package.json` 里**没有任何 YAML/frontmatter 解析器**（`grep gray-matter|js-yaml|yaml` 零命中）。要么加依赖（撞 `AGENTS.md` "这不是普通 Next.js"约定），要么手写解析嵌套 YAML（`capability_dimensions` 是对象列表），易错且与"复用竞品 loader、低成本"叙事矛盾。
  **建议：种子就两个，别搞 frontmatter+md，直接用 `.ts` 导出 `MethodologySpec` 对象**——零解析、类型安全、可单测，"加岗位=加一个 .ts"同样满足可插拔。等真有 7-10 个岗再上 frontmatter。
- `context.ts`（装配 prompt 段）：保留，合理。
- `question-bank/retriever.ts`：见第 5 点，可砍或降级。

### 7. 被遗漏的风险 — 【中】

- **并发/竞态（确认存在）**：答完一题时，`live/page.tsx:560` 的 evaluate-turn fire-and-forget 与新的 follow-up 调用会**同时**对同一 answer 发两个 LLM 请求。需明确两者关系（多半 follow-up 不等 evaluate，但要确认追问不会和"已评分"状态打架）。
- **localStorage 容量**：题数 15 + 追问 9 + 每题 transcript + 双雷达，单 session 体积明显变大；FIFO 仍 2 场但单条更胖，接近上限风险上升，文档没估算。
- **中途刷新丢状态**：现状纯内存 reducer，刷新即丢；动态追问让一场更长，丢失代价更高，文档未提。
- **旧 session 兼容**：新字段全 optional，这点文档做对了（`interview-types.ts` 已是全可选模式）。
- **可观测性缺失**：follow-up 触发率、命中红旗率没埋点，无法验证"动态"是否真发生（会不会几乎不追问），文档 §5 未覆盖。

### 8. 借来的竞品机制是否水土不服 — 【中】

- 纯函数 verify 门：**水土服**，TS 客户端一样能用。
- 方法论 registry：价值在"可插拔"，但竞品是 Python 服务端有界状态机里调度，这里是客户端无状态——registry 退化成"一个查表函数"，上 frontmatter 解析就是为"像竞品七层"而引入的仪式（见第 6 点）。
- 题库锚点：竞品有服务端 episodic 去重；这里只能 session 内字符串去重（文档已诚实标注），价值缩水（见第 5 点）。

**总体没有把竞品三处注水（记忆固化链 / 7段 ContextAssembler / 模型 PLAN）偷偷引进来——这点文档守住了，§0.1 和 §7 的"明确不做"是真的。** 唯一接近注水的是 frontmatter registry：它"看起来像可扩展框架"，但在两个种子 + 客户端无状态下，实际收益 ≈ 一个 switch。

---

## 优先修改清单（按重要性）

1. **能力评分拆成独立调用/独立 catch**（否则破坏"4 维不挂"的核心不变量），并明确这层用 R1。`debrief/route.ts:375-386`
2. **修正 `keyword-match.ts` 误述**：承认 top-K/打分是净新增代码；方法论匹配自带独立关键词集，**不依赖那张 PM 向同义词表**；补一个真实存在的回退岗位。`keyword-match.ts:24-60`
3. **给 follow-up 及现有三个 m5 LLM 路由补 `export const maxDuration = 60`**，并在客户端给 follow-up fetch 加显式超时（`llm.ts` 无 timeout）。
4. **把 `live/page.tsx` reducer 改造单列为 plan 重点步骤**：新增"思考中"态、动态题序、index-based ref 去重修复、预算状态、finished 重算。真正的实施风险在这里，不能用"客户端接线"一句带过。
5. **方法论种子从 `.md`+frontmatter 改为 `.ts` 导出对象**，去掉 YAML 解析器依赖与手写解析风险。

## 建议砍掉的部分

- **v1 砍掉题库锚点**（`retriever.ts` + seed JSON）：ROI 最低、最易把题拽向八股、与 anti-fabrication 打架。保留就降级为"仅评分参考、不进出题 prompt"。
- **砍掉 frontmatter/md 机制**，用 `.ts` 对象替代。
- 这样 `lib/m5/` 从 7 文件收敛到 4 个（registry/context/rubric/verify + follow-up），框架两条轴（方法论 + 追问）照样验证，内容成本更低——对齐文档 §0.4 你定的"最低成本验证框架"。

## 文档判断正确、不必改的地方（不为挑刺而挑刺）

- 三处竞品注水点的识别 + "明确不做"清单，守得住，没偷偷引回来。
- 新字段全 optional + 旧 session 安全回退，与 `interview-types.ts` 现有模式一致，做对了。
- prep 侧"方法论/锚点加载失败 → 回退 `TYPE_SPECS`"是真 additive。
- 双层评分语义不重叠、UI 不冗余，价值成立（只是别放同一次调用）。
- per-turn 不加能力维度、只在 debrief 聚合，判断正确（避免噪声 + 保 fire-and-forget）。
