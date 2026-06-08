# 审核报告 — m5 计划「最大化借鉴竞品 × 稳健落地」双轴体检（第三轮）

- 日期：2026-06-09
- 被审：[2026-06-08-m5-mock-interview-upgrade-design.md](./2026-06-08-m5-mock-interview-upgrade-design.md)（v3）
- 方式：以代码为唯一事实来源。竞品 `/Users/hyc/Downloads/offer-agent/code/interviewforge/` 逐文件读；本仓库 `app/api/m5/*`、`app/m5/live/page.tsx`(1338 行)、`lib/*` 逐处核实。前两轮报告仅作背景、可推翻。

---

## 1. 总体判定

**轴 A 有 3 处该补、轴 B 有 1 处必须钉死 + 3 处中等钉点；无结构性问题。补完即可进入 writing-plans / 写代码。**

- 工程方向（可插拔 .ts 方法论 / 纯函数 verify 门 / 能力评分解耦独立路由 + 懒加载 / 客户端驱动不变）经代码核实全部站得住。
- 竞品三处注水（`consolidate()` 死代码、7 段 ContextAssembler、PLAN 不调模型）已确认为真注水，plan 全部正确排除（详见 §4）。
- 轴 B 的真正风险只有一处是"读着顺、实现会翻车"的级别（thinking 态跨 pause/finish/迟到响应的幂等守卫），其余是可控钉点。

---

## 2. 轴 A 发现：竞品有、计划没充分吸收的机制

> 每条已先到竞品代码确认"真的这么做了"，再判断 plan 吸收够不够。

### A1【借鉴价值：高】简历弱点驱动出题 / 追问 —— plan 最该补的一条
- **竞品依据**：`resume/analyzer.py:10-14` 产 `weak_spots` + `topic_plan`；`topic_plan` **真驱动排程**：`loop/session_plan.py:31-33`（`topics = profile.topic_plan`，`topic = topics[i % len]`），`api/session.py:56-59` 把它喂进 `build_session_plan`。这是 examiner 锚点之外**更有价值、且不拽向八股**的点——它来自候选人简历本身，不是题库。（注：竞品 `weak_spots` 只进了 profile prompt 文本、没强串进 examiner 的"定点深挖"指令，属半用；plan 可以做得比竞品更彻底。）
- **本计划现状**：prep-questions 已把 `resume_text` 喂给 LLM 隐式个性化，但**没有**"抽取结构化弱点 / topic_plan → 定向出题 + 喂给 follow-up"这一步。follow-up 只靠方法论的泛 `redFlags` 判断，不知道"本题原本想挖简历里的哪个弱点"。
- **强论据**：strict persona 已写死纪律「每段经历至少挖 1 个 weak spot」（`interviewer-personas.ts:71`，已核实原文）。这和"动态追问填 persona 空头支票"是同一个立项逻辑——**弱点驱动是 persona 早就开的另一张支票**。
- **建议**：不新增 LLM 调用。让 prep-questions 在同一次出题里**额外输出每题的 `whatItTests` / 预设弱点**（`InterviewQuestion` 已有**可选** `whatItTests` 字段、`interview-types.ts` 已核实），follow-up 输入里带上它，让追问"挖本题预设的那个弱点"而非泛红旗。零新增往返、与现有架构天然咬合。

### A2【借鉴价值：中】能力评分给"判定锚"（但不是题库 reference_answer）
- **竞品依据**：`subagents/grader.py:10-16` 对照 `reference_answer` / `expected_points` 评分（确认真在评分路径上，不是注水）。
- **本计划现状**：capability 维度只给 `{key,label,weight}`（§2.1），R1 评分缺"该维度的好答案长什么样"的判定锚，分值会飘。
- **建议**：每个 `CapabilityDimension` 加一个 `strongIndicator: string`——**描述"强答案具备的质量"**（如"复杂度权衡：能说清两个方案的 trade-off 并给量化依据"），注入 capability 路由作评分锚。**这与被 R5 正确砍掉的题库 `reference_answer` 是两回事**：前者描述质量、不含事实，**不与 anti-fabrication 打架**；后者是对具体题的标准答案、会和"用户真实经历"冲突。务必在文档里写清这个区别，避免被误读成"锚点又回来了"。

### A3【借鉴价值：中】单源维度防漂移 —— 竞品最干净的一招，plan 部分重新引入了漂移
- **竞品依据**：**一套** dimensions 从 `skills/dimensions.py` 抽出 → 同时驱动 `session_plan`(出题) 和 `reporting/report.py:14-19`(雷达轴)，全程同一个 list（`skills/registry.py:48-55` → `loop/machine.py:96-104` → report）。这是竞品真正值得抄的结构。
- **本计划现状**：`MethodologySpec`（§2.1）里 `capabilityDimensions` 是结构化对象，但 `examineGuide` / `pacingGuide` / `followUpTree` 是**平行的手写 prose**。雷达轴用前者，出题/追问用后者的散文——**两者会随 spec 编辑漂移**（prose 提到的维度和 `capabilityDimensions` 列的对不上）。
- **建议**：§8 单测加一条**一致性断言**——`examineGuide`/`followUpTree` 必须覆盖每个 `capabilityDimension.key`；或更彻底，把"出题配比"**机械地从 `capabilityDimensions` 派生**（像竞品 `i % len`），而非在 `pacingGuide` 里再写一遍。

### A4【借鉴价值：中】verify 门补"分值校验 + 语义查重"
- **竞品依据**：`loop/verify.py:44-51` `verify_score` 校验分值是 `[1,5]` 整数；`verify_question` 查 `asked_ids` 去重（精确 id）。
- **本计划现状**：verify.ts 已做 非空/字符串相似度去重/长度/scrub——**已比竞品的精确 id 去重强**。但 (a) capability 路由渲染雷达前**没校验 R1 返回的分值范围**；(b) 没防"追问只是把母题换汤不换药地重述"。
- **建议**：capability 路由解析后先 `verify_score` 式范围校验再渲染；verify.ts 加一条纯函数启发式——follow-up 与**母题** token 重叠率过高即丢（不需要 embedding，可单测）。

### A5【借鉴价值：低 / 部分不借】retry & RAG
- **竞品依据**：`model_client.py:41-50` `_with_retry` 指数退避（0.5/1/2s，3 次），裹住每次 chat/embed。本仓库 `lib/llm.ts` 的 `chat()` **无 retry 也无 timeout**（已核实，OpenAI client 默认 ~600s）。
- **判断**：
  - **follow-up 不该 retry**——它在 8s 预算的热路径上，retry 必爆预算；失败→进下一题才是对的。
  - **capability 可选一次"快失败"retry**（5xx / parse error，**不含 timeout**——因 `maxDuration=60` + R1 30-50s 没有重试 timeout 的空间）。是廉价收益，但因懒加载已优雅降级，不做也站得住，列为可选。
  - **RAG**（`rag/retriever.py:18-34` embed→按 asked 去重→难度重排；`rag/chunking.py:16-18` 只 embed 题干、不混 reference_answer 防污染检索信号）是**真有效**的，但 v1 正确不上。其"难度递进 + 按 asked 去重 + 别让标准答案污染匹配信号"的判断逻辑，留给**后续题库锚点增量**时借，现在不动。

---

## 3. 轴 B 发现：感觉能实现、实则会翻车的稳健缺口

### B1【严重度：高】`thinking` 态的 follow-up 生命周期，跨 pause / finish / 迟到响应**没有幂等守卫** —— §5 最大的洞
- **依据（时序推演 + 代码）**：§5 让 `USER_ANSWER_DONE` 进 `thinking` 挂起等 follow-up，落定后由一个 resolve 动作 insert+推进 / 直接推进。但：
  - `PAUSE`（`live:194-196`）和 `FINISH`（`live:200-206`）**无视当前 status** 都能触发。用户在 `thinking` 态点暂停 / 点"结束面试 →"（`live:1271`）时，follow-up 的 fetch 仍在途（或 8s abort 计时器在跑）。
  - 当它**迟到返回 / abort 回调**时，resolve 动作会把状态从 `paused`/`finished` 推成 `asking`+前进——**把暂停吹掉、或在已结束后又推进一题**。
- **修法（必须写进 plan）**：resolve 必须是**幂等、带守卫**的 reducer 动作——`if (s.status !== "thinking" || a.parent_id !== currentQuestion.id) return s;`。即"只在仍处于 thinking 且 question id 匹配时才生效"。同时：thinking 态触发 follow-up 的那个新 effect，pause 时若 cleanup 把 fetch abort 了，resume 回 thinking 要能重发或读已 stash 的结果——这条 lifecycle（pending follow-up 跨 pause/resume/finish）§5 完全没覆盖，是手测 happy-path 抓不到的，必须显式设计 + race 用例。
- 这是整份设计唯一够得上"读着顺、实现会翻车"的点。其余都是钉点。

### B2【严重度：中】G2 重复打分 race —— 确认真实，但窗口比文档说的窄
- **依据**：evaluate-turn effect（`live:550-574`）**已有** by-id 去重（`alreadyEvaluated = turnEvaluations.some(e => e.question_id === lastAns.question_id)`，`:554-557`）。所以 G2 不是"完全无去重"——它只挡"评分返回**后**"的重跑，挡不住"评分**在途**时 `state.questions` 因 follow-up insert 改变 → effect 重跑 → `alreadyEvaluated` 仍 false → 对同一 question_id 发**第二次** evaluate-turn"。
- **修法**：plan 的 in-flight `Set<question_id>` ref 去重**正确**。推荐**用 Set**（而非"收窄 effect 依赖去掉 `state.questions`"）——Set 还能顺手挡 React StrictMode 双调用等其它重入，更防御性。debrief 从 transcript 重评、不消费 turn_evaluations，所以分数不会被污染（文档判断对），但不修会浪费 token + UI 重复项。

### B3【严重度：中】8s abort 偏紧，"几百 token"低估了输入
- **依据**：follow-up 输入含 `methodology.followUpTree` + `redFlags` + `answer_transcript` + `main_question` + persona/纪律。**transcript 本身**一段口语答案就 100-400 token，followUpTree/redFlags 又各几百——总输入更接近 1-1.5k token，不是文档 §3.4 说的"几百 token"。deepseek-chat 在这种输入下正常 2-5s+，**冷启动 / 长答案 / 高峰**会让 8s abort 偶发误杀（明明在生成有效追问，却被砍）。
- **修法**：abort 提到 **10-12s**；既然 `thinking`"面试官思考中…"本就是 UX 掩护，没必要 8s 这么急（abort 的唯一目的是防 `chat()` 无 timeout 的无限挂起）。文档把"几百 token / 1-3s"改成把 transcript 计入的实测区间。

### B4【严重度：中】ID 化去重漏了"重复问题"复位路径
- **依据**：§5-4 要把 TTS/ASR 去重从整数 index 改 `question.id`，但"🔁 重复问题"按钮**直接** `ttsPlayedForIdx.current = null`（`live:1207`）强制重播。ID 化后这处复位逻辑必须同步改成"复位当前 question.id 的 played 标记"，否则重复问题按钮失效（或永远重播）。§5 没列这处受影响 site。
- **附**：ASR 的 `asrStartedForIdx`（`live:440,450,453`）同理要一起 ID 化，§5-4 笼统说"TTS/ASR 去重"但没逐一点名这两个 ref + repeat 按钮三处。plan 须逐一列。

### B5【严重度：中→低】debrief 题号 / highlights "Q3" 映射随 follow-up 插入漂移
- **依据**：follow-up insert 进 `state.questions`/`state.answers`（`live:144-163` 的累积模式 + §5-3 的 currentIdx+1 插入），写进 localStorage（`:651-657`）和 Supabase `turns_json`（`:672-686`）。debrief 重评时若按数组顺序给"Q3"编号，追问会占用主序号、highlights 的"Q3"引用语义漂移。
- **修法**：follow-up **单独标注**（如"Q3·追问"），不占主题序号；debrief 渲染 transcript 时按 `source`/`parent_id`（§6.1 新增字段）区分主题与追问。§7.2 已列此风险但没给解法，plan 要给。

### B6【严重度：低 / 可测性】把 thinking→resolve 全做成 reducer 动作，守卫逻辑放 reducer
- **依据**：§5 是唯一非纯函数硬改，文档靠"本地语音手测 + race 用例"兜底。但 reducer 本身是纯的——B1 的幂等守卫、B2 的去重判断**应该放在 reducer 里**（纯函数、可单测），effect 只做 fetch+dispatch 这层薄壳。
- **修法**：新增 `ANSWER_HOLD`（→thinking、不推进）+ `FOLLOWUP_RESOLVED`（带守卫的 insert/推进）两个 reducer 动作，把 pause/finish/迟到 的 race 全收敛成"对 reducer 的动作序列断言"——这样 B1 那条手测难覆盖的路径变成纯函数单测可覆盖。这是对 §5"可测性兜底"最实在的钉法。

### scrub / 纪律一致性（轴 B item 7）——基本 OK
- follow-up 题面经 verify.ts 的 scrub（§3.3）、capability evidence 经 scrub（§4），`scrubCompanyNames` 函数已核实存在（`lib/scrub-company.ts`，另有 `scrubCompanyNamesDeep`）。只需确保 scrub 发生在**服务端 verify 门内**、返回前。anti-fabrication 纪律 follow-up 走 V3.1 + persona block，继承现有体系，无新破口。

---

## 4. 确认"不值得借"的竞品机制（含注水点，避免为借而借）

| 竞品机制 | 核实结论 | plan 处理 |
|---|---|---|
| `memory.consolidate()` | **真死代码**：全仓库仅 `memory/base.py:72-84` 有定义、**零调用方** | 正确不借 |
| 7 段 ContextAssembler | **对子 agent 实为注水**：examiner/grader 只发 `[SYSTEM,USER]`（`examiner.py:56-59`/`grader.py:29-31`），assembler 只是把 rules+profile 拼进 system prompt（`base.py:53-59`）。完整 7 段 compaction 仅主 loop 用（`machine.py:188`），m5 客户端驱动根本无主 loop | 正确不借 |
| PLAN 调模型 / 动态排程 | **伪动态**：`RulePlanner`（`planner.py:43-54`）纯规则、不调模型；题序 `session_plan.py:20-40` 开场就排死、`api/session.py:99` 在出题前就 set | 正确不借；plan 的运行时 follow-up 门**确实比竞品强** |
| 题库锚点 + reference_answer 进出题 | 竞品 examiner 真做（`examiner.py:52-61`），但对"简历个性化"产品 ROI 低、拽向八股 | R5 正确砍掉；A2 的"判定锚"是**质量描述**不是它，别混 |
| RAG retriever | 真有效（`retriever.py:18-34`），但 v1 不需要 | §10 正确不上；判断逻辑留给后续增量 |

---

## 5. 最高优先 5 条（跨两轴，按重要性）

1. **【轴B·高】钉死 thinking 跨 pause/finish/迟到响应的幂等守卫**（B1）——`FOLLOWUP_RESOLVED` 只在 `status==="thinking"` 且 parent_id 匹配时生效；pending follow-up 跨 pause/resume lifecycle 显式设计 + race 用例。**这是唯一会翻车的点。**
2. **【轴A·高】简历弱点驱动出题/追问**（A1）——prep 顺带输出每题 `whatItTests`/预设弱点，喂给 follow-up；兑现 persona「每段挖 1 个 weak spot」第二张空头支票。零新增往返。
3. **【轴B·中】把 §5 收敛成 reducer 动作 + in-flight Set 去重**（B6+B2）——守卫/去重放纯函数 reducer，使最难测的 race 路径可单测。
4. **【轴A·中】单源维度防漂移**（A3）——加 examineGuide/followUpTree 覆盖所有 capabilityDimension key 的一致性单测；这是竞品最该抄的结构，plan 现在用平行 prose 重新引入了漂移。
5. **【轴B·中】8s→10-12s abort + ID 化的三处复位 site 逐一点名**（B3+B4）——含"重复问题"按钮 `live:1207`、`asrStartedForIdx`、`ttsPlayedForIdx`。

**建议增补**：A1 的 `whatItTests` 透传、A2 的 `strongIndicator`、B5 的 follow-up 独立题号标注、capability 路由的分值范围校验（A4）。
**建议砍掉 / 不加**：follow-up retry（吃预算）；任何"题库锚点回归"的暗门（A2 的判定锚要写清不是它）；不必为竞品的"追问树分支选择"做对齐——它在竞品里根本不存在（见 §6）。

---

## 6. 不同意前两轮 / 本轮 prompt 预设之处

- **本轮 prompt 轴A-item3 的预设（"examiner 的追问树分支选择逻辑"）站不住**：竞品**没有**任何可执行的分支选择——`RulePlanner` 纯规则、不看历史表现、不调模型选下一主题（`planner.py:43-54`），连 prompt-tree 都不是。所以 plan 的 `followUpTree`（注入 prompt 的散文 + §3.1 的四分支启发）**已经比竞品强**。结论：plan 不必"对齐竞品追问树"，只需把自己的 followUpTree 写实、可观测（埋点哪条分支触发，§7.2 已要触发率，扩到分支级即可）。
- **本轮 prompt 轴B-item2 的"TTS 还在念母题时 follow-up 已返回"经推演不成立**：follow-up 仅在 `USER_ANSWER_DONE` 之后请求，此时母题 TTS 早已结束（TTS 只在 answer **之前**的 `asking` 态播，`live:501-547`）。且 C5 禁止对追问再追问，追问 TTS 期间也不会有新 follow-up 返回。**不必为此设计防护**——可从风险清单移除，省得 plan 背包袱。
- **关于 ASR 自动结束打架（本轮 prompt 轴B-item1 列的"ASR 自动结束"）**：现有代码**没有 ASR 自动提交**——`USER_ANSWER_DONE` 只由手动"✓ 答完了"（`live:1251`）/ 文字提交（`:596`）触发，静默计时器只弹提示（`:623`）不自动结算。所以 `thinking` hold **永远是用户显式触发**，比担心的简单。这是利好，plan 可据此简化。
- **前两轮关于"debrief 用 R1 / 30-50s"的口径要收紧**（不算错、但易误读）：现状 debrief 是**单次 V3.1(chat)**（`debrief/route.ts:375`，max_tokens 3000）、~5-10s；G1 的"拖到 ~40s"是针对"**若把**能力评分塞进 debrief 路由"的假设。v3 解耦到独立 capability 路由（R1）是对的，`{model:"reasoner",jsonMode:true}` 在 `m3/excavate:336` 已验证可用（已核实）。文档别再把 debrief 和 capability 混称"R1 30-50s"。

前两轮判断正确、不必动的：竞品三注水点的识别与排除、新字段全 optional 兼容旧 session、prep 方法论加载失败回退 TYPE_SPECS、双层评分语义不重叠、per-turn 不加能力维度、能力评分解耦 + 懒加载守住"4 维不挂"不变量——均经代码核实成立。

---

## 7. 能否进入写代码

**可以进入 writing-plans / 写实现计划。** 无结构性问题。前置条件：plan 必须把 **B1 幂等守卫**写成显式状态机规约 + race 用例（这是唯一会翻车点），并吸收 A1（弱点驱动）、A3（单源防漂移）两条高/中价值借鉴；B2-B6 作为钉点逐条单列。能力评分判定锚（A2）建议纳入但非阻塞。
