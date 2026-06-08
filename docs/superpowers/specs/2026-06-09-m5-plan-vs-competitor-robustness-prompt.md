# 审核 Prompt — m5 计划「最大化借鉴竞品 × 稳健落地」双轴体检

> 用法：把「===== PROMPT 开始 =====」到「===== PROMPT 结束 =====」之间整段交给另一个 agent（务必给它**代码库读权限**，且能读竞品目录 `/Users/hyc/Downloads/offer-agent`）。

===== PROMPT 开始 =====

你是一名资深 AI Agent 工程 + 模拟面试产品的审核者。已有一份 m5 模拟面试升级设计（经两轮审核到 v3）。你的任务**不是再做一次通用审核**，而是沿**两个明确的轴**给它做体检，并以代码为唯一事实来源（默认怀疑文档，文档说"已纳入"只是设计意图、不是已实现的代码）：

**轴 A — 最大化借鉴竞品**：竞品 InterviewForge 是一个**只做模拟面试**的成熟 agent harness（已确认它没有真实岗位爬取、JD 是写死的；模拟面试是它唯一深耕的场景，也是和本产品唯一重合的功能）。请逐一排查：**竞品在模拟面试上做对、做稳的机制，本计划有没有遗漏、有没有可以更充分吸收的？**别把竞品的好东西落在桌上。

**轴 B — 稳健落地（不是"感觉能实现"）**：用生产级工程标准审视本计划，找出"读起来顺、实则会在实现/线上翻车"的地方——乐观假设、未定义的边界、并发/时序、错误恢复、延迟预算、状态机正确性、可测性。目标是把"感觉可以实现"变成"确定能稳健实现"。

## 你要读的材料
1. 本计划 v3（主审对象）：`docs/superpowers/specs/2026-06-08-m5-mock-interview-upgrade-design.md`
2. 两轮审核（背景，**非权威、可推翻**）：同目录 `...-REVIEW.md`、`2026-06-09-m5-design-review-prompt-round2.md`
3. 竞品模拟面试实现（轴 A 的对照源）：`/Users/hyc/Downloads/offer-agent/code/interviewforge/`，重点：
   - `subagents/examiner.py`、`subagents/grader.py`、`subagents/base.py`（出题/评分子 agent 的契约、最小权限、锚点+改写）
   - `loop/machine.py`、`loop/verify.py`、`loop/session_plan.py`（有界循环、纯函数验证门、难度阶梯排程）
   - `skills/*/SKILL.md` + `skills/registry.py`、`skills/dimensions.py`（方法论→出题→报告轴贯通）
   - `reporting/report.py`（维度聚合 + 雷达报告）
   - `resume/analyzer.py`（简历→结构化画像→驱动出题）
   - `rag/retriever.py`、`rag/chunking.py`（去重、难度重排、字段级 embedding——即使本计划不上 RAG，其"检索管道"思路是否有可借的判断逻辑）
   - `model_client.py`（`_with_retry` 指数退避）
4. 本产品代码（轴 B 落地核实）：`app/api/m5/{prep-questions,evaluate-turn,debrief}/route.ts`、`app/m5/live/page.tsx`（1338 行 reducer）、`app/m5/debrief/page.tsx`、`lib/llm.ts`、`lib/interview-types.ts`、`lib/interview-type-prompts.ts`、`lib/interviewer-personas.ts`、`lib/scrub-company.ts`；根 `AGENTS.md`、`package.json`。

## 轴 A：逐项排查"竞品有、计划没充分吸收"的机制
对每条，先到竞品代码确认它**真的这么做了**（别信文档转述，竞品宣传也有注水，如记忆固化 `consolidate()` 其实从不被调用——遇到这种"看着像、实际断"的别当成可借鉴项），再判断本计划吸收得够不够，给【借鉴价值：高/中/低】+【依据：竞品 file】+【本计划现状】+【建议】：
1. **出题**：examiner 的"题库锚点 + LLM 结合简历改写 + 记录 anchor_id"、resume analyzer 产 `weak_spots`/`topic_plan` 驱动针对性出题——本计划砍了锚点、且方法论只注入考察维度，**是否漏掉了"简历弱点驱动出题"这个比锚点更有价值、且不拽向八股的点**？
2. **评分**：grader 对照 `reference_answer` 评分 + 主动写 episodic；本计划能力维度只给 capabilityDimensions，**要不要给能力评分也提供"该维度的好答案长什么样"的判定锚**？
3. **追问**：竞品其实是开场 SessionPlan 确定性排程（伪动态）——本计划的真动态追问**比竞品强**，确认这一点，但 examiner 的"追问树分支选择"逻辑本计划是否落到可执行（而非一句"按追问树判断"）？
4. **方法论→报告轴贯通**：竞品 `dimensions.py` 让 SKILL 的考察维度**同时**驱动出题配比、追问、报告雷达轴——本计划三处用的是同一套 capabilityDimensions 吗，还是会各写一份导致漂移？
5. **有界与验证**：`loop/verify.py` 纯函数门 + `Bounds` 计数停机——本计划 verify.ts 覆盖面够不够（除了去重/长度，要不要校验"追问没换汤不换药地重复母题语义"）？
6. **稳健细节**：`model_client._with_retry` 指数退避——本计划 follow-up/capability 的 LLM 调用要不要重试，还是只靠超时？

## 轴 B：逐项找"感觉能实现、实则会翻车"的稳健缺口
给【严重度：致命/高/中/低】+【依据：file:line 或时序推理】+【修法】：
1. **状态机正确性**：§5 把 `USER_ANSWER_DONE` 拆"hold 进 thinking / follow-up 落定后推进"。请在 `live/page.tsx` 里逐步推演这条新路径会不会和现有的：静默 60s 提示、暂停/恢复、跳过 2 选 1、"查看回答思路"、摄像头/录制、ASR 自动结束 等已有机制打架。列出所有受影响的 action/effect。
2. **并发/时序**：除已知的 evaluate-turn 重放（G2），还有没有别的竞态？例如 follow-up 的 8s abort 触发后、迟到的响应回来了怎么办；thinking 态下用户点暂停/退出；TTS 还在念母题时 follow-up 已返回。
3. **延迟预算**：§3.4 "几百 token / 1-3s" 是否经得起推敲——follow-up prompt 要塞方法论 followUpTree+redFlags+transcript，实际 token 和首 token 延迟有多大？8s abort 会不会在正常情况下也偶发误杀？
4. **错误恢复闭环**：每个失败回退（方法论加载失败、follow-up 超时、capability 失败）落到 `live/page.tsx` / `debrief/page.tsx` 的具体 UI 状态了吗，还是只在文字上说"进下一题"？
5. **数据一致性**：动态题序后，debrief 的 transcript 拼接、题号映射、highlights 的 "Q3" 引用、Supabase `turns_json` 写入，会不会因为追问插入而错位？
6. **可测性兜底**：§5 是唯一非纯函数硬改，plan 靠"本地语音手测 + race 用例"。这够吗？哪些路径手测也难覆盖，要不要把状态机推进逻辑抽成纯函数 reducer 以便单测？
7. **scrub/纪律一致性**：新增的 follow-up 题面、capability evidence 是否都过了 `scrubCompanyNames`，并继承现有 anti-fabrication / 反 rationalization 纪律？

## 输出格式
1. **总体判定**：「计划已最大化借鉴 + 可稳健实现，进入 writing-plans」/「轴 A 有 N 处该补、轴 B 有 M 处该钉，列出后即可实施」/「有结构性问题需回设计」。
2. **轴 A 发现**（借鉴价值 + 依据 + 建议）。明确指出：哪些竞品机制确实不值得借（含注水点），避免为借而借。
3. **轴 B 发现**（严重度 + 依据 + 修法）。
4. **最高优先 5 条**（跨两轴，按重要性）+ **建议增补 / 砍掉**。
5. 明确表态：是否可以进入写实现计划 / 写代码。
6. 凡你**不同意前两轮结论**之处，点名说明。

===== PROMPT 结束 =====
