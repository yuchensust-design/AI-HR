# Question Batteries — excavating-work-experience

Exact prompts and branching logic for each phase.

**One question per turn — non-negotiable.**

---

## Phase 1: Situation Anchoring (opener + max 3 questions + persona fork)

### Opener (always your first message — STRONGLY recommend JD)

> "在开始之前: **强烈建议你贴一份目标岗位 JD**(链接或文本)— JD-aware 模式会让后续提问的针对性大幅提升,也能在最终简历优化阶段直接对接 ATS 关键词,这是'提升初筛命中率'的关键一步。如果暂时没有,先广撒网也行,但效果会折扣一些。"

**If user pastes a JD**: extract key requirements into the artifact's `Target JD` section:
- Technical / hard skills
- Soft skills
- Tools / tech
- Domain experience

Set `JD-aware mode = ON`. In all later phases, prepend probes with JD-relevance and prioritize JD-keyword coverage.

**If no JD**: proceed in broad-exploration mode.

### Q1 (your first numbered question — 4 student-only options)

> "你目前的求职阶段?选最接近的:
> 1. 在校生 — 准备实习
> 2. 在校生 — 准备秋招 / 春招
> 3. 应届毕业 — 找正职
> 4. 跨专业 / 转方向求职"

### Fork announcement (immediately after Q1, separate message, BEFORE Q2)

| Q1 | Fork announcement |
|---|---|
| 1 (在校 — 实习) | "Got it — 我们会挖你的 **课程项目、社团角色、研究经历、竞赛、个人项目**,加上前期可能有的小型实习。在校阶段这些都算简历素材,不只是带薪工作。" |
| 2 (在校 — 秋招/春招) | "Got it — 秋招/春招阶段。我们要把 **已有的实习、课程项目、社团/学生工作、研究、竞赛、个人项目** 全部挖出来。这是收割你所有积累的时候。" |
| 3 (应届找正职) | "Got it — 应届毕业找正职。我们会覆盖 **所有实习、毕设/论文项目、社团、研究、副业**。现在是 harvest 你所有做过的事的时候。" |
| 4 (跨专业 / 转方向) | "Got it — 跨专业 / 转方向。我们会挖你 **现有背景的可迁移技能(transferable skills)**,加上你做过的任何 bridge 经验(项目 / 认证 / 志愿)。后面可能也会接 Skill 2 来设计补 pivot gap 的新项目。" |

### Q2 (dynamic by Q1 answer)

| Q1 | Q2 |
|---|---|
| 1 (在校实习) | "你想找什么类型的实习?(比如算法 / 后端 / AI PM / 用户研究等)在读什么专业、几年级?" |
| 2 (秋招/春招) | "你的目标岗位类型?(技术岗 / 产品岗 / 数据岗 / 等)什么专业、计划几月入职?" |
| 3 (应届正职) | "你的目标岗位 + 行业?(具体一些)毕业 / 已毕业多久?" |
| 4 (跨专业/转方向) | "你从什么背景转到什么目标?各说几个字,比如'计算机 → AI 产品经理'或'金融 → 数据分析师'。" |

### Q3

> "有什么硬约束需要我记住?(城市、远程/混合、薪资带、时间线、accessibility,任何要注意的)"

→ Checkpoint and move to Phase 2.

---

## Phase 2: Timeline Reconstruction (student-flavored)

### Opener (vary by Q1 persona)

**1-2 (在校生)**:
> "我们梳理一下你的时间线。从现在往前:你的学位/项目、实习(如果有)、有分量的课程项目、社团/学生工作、研究、竞赛、个人项目。先搭骨架 — 学校/机构、角色/项目名、大概起止时间。细节后面说。"

**3 (应届)**:
> "我们梳理一下你的时间线。从现在往前:实习、毕设/论文、社团、研究、个人项目。先搭骨架 — 学校/机构、角色/项目名、大概日期。"

**4 (跨专业)**:
> "我们梳理一下你目前的背景。从现在往前:你的学位/工作经历、相关项目、转方向后做的 bridge 经验(认证 / 课程 / 副业)。先搭骨架。"

Capture into a table:

| Years | Org / School | Role / Program | Function | Notes |

### Gap handling (≥6 month gaps)

For each ≥6 month gap, ask once, gently:

> "我看到 {A} 和 {B} 之间有段空档。是有意休息、家庭原因、自学、还是别的?都没问题,只是想理解整个形状。"

**Never pressure on gaps.** Acknowledge and move on.

### Closing readback

> "这是我整理的时间线 — 有要修正的吗?"

---

## Phase 3: Per-Role Excavation (branching tree + JD-aware + Metric Mining)

For each material role/period, run sequentially, most recent first.

For students: "role" 包括 **课程项目、实习、社团角色、研究助理、竞赛、个人项目**,不只是带薪工作。

### JD-aware prepend (only if JD provided in opener)

Before INITIAL PROBE for each role:

> "JD 提到 {top 2-3 keywords}。这里有触及到吗?哪怕只是边缘相关。"

Capture connection (or `none`) before continuing.

### INITIAL PROBE

> "你在 {role} 的 charter 是什么?用 1-2 句话,你真正负责的是什么?"

### Branches by response type

**Branch A — VIVID** (具体、有范围):
依次追问,一 turn 一个:
1. 规模:"团队大小 / 用户数 / 预算 / 范围大概多少?"
2. 项目:"最重要的 2-3 件你实际 ship 或 lead 的事是什么?"
3. 问题:"最难解决的问题是什么?"
4. 然后跑 **Metric Mining loop**。

**Branch B — VAGUE**:
> "换个问法 — 如果没有你,什么会出问题?什么是只有你在做、别人不会做的?"

**Branch C — LISTY / JD-like**(在背 JD/职责):
> "挑过去半年占你时间最多的那个项目,详细讲讲:目标、卡点、你做了什么。"

**Branch D — UNCERTAIN**(不知道怎么描述):
> "是更像 [例 A — 比如运营已有流程] 还是 [例 B — 比如从零搭新东西]?或者两者都有?"

**Branch E — BLANK 3 次**:
标记 `thin`,跳过。**不要榨干用户。**

### Cross-reference

> "你刚才在 {上家组织} 提到了 {X}。这次是相关的还是不同的?"

### Metric Mining loop (关键 — 每个 outcome 后必跑)

Always probe for at least one number. Pick 1-2 dimensions per turn matching the answer:

| Dimension | Prompt template |
|---|---|
| **How big?** | "团队 / 用户 / 预算 / 范围多大?" |
| **How fast?** | "时间线 / cycle time / time to ship?" |
| **How much?** | "收入 / 节省成本 / 节省工时?" |
| **How many?** | "次数 / 迭代 / 客户 / commits / 用户?" |
| **How well?** | "准确率 / 满意度 / 排名 / 通过率?" |

**第一次"不知道"** → "order of magnitude 也行,更接近 10 还是 100?"

**第二次"不知道"** → 接受 `unknown`,flag for downstream `resume-quantifier`。**不再追。**

### Per-role capture

- Charter(1-2 行)
- Scale
- Key projects(2-3)
- Problems solved
- Tools/tech
- JD-relevance(if JD-aware)
- Excavation depth: shallow / medium / deep

---

## Phase 4: Hero Story Mining (reflective prompts, one per turn)

After per-role excavation, mine **跨所有 role** for 3-5 STAR 形态的 hero story。

For students: stories 来自课程项目 / 实习 / 社团 / 竞赛 / 研究 / 个人项目都行。

### 6 prompt categories (use 3-5)

| Category | Prompt |
|---|---|
| **Peak** | "想一段你处于最佳状态的时刻 — 任何角色、课程、项目、活动都行。你在做什么?跟普通日子有什么不同?" |
| **Challenge** | "你处理过最难的情境是什么?**具体**难在哪?" |
| **Impact** | "什么事是没有你就不会发生的?" |
| **Failure** | "事后看,有哪个决定你会做得不同?学到了什么?" |
| **Learning Sprint** *(尤其学生)* | "什么时候你从零学会一个新东西/工具/话题,然后真的用它做出了东西?" |
| **Praise** *(可选)* | "有没有同事、教授、上司、导师具体感谢/称赞过你什么?" |

**JD-aware mode ON 时**:优先选 JD 强调的能力对应的类别(JD 强调 "ownership" → 先问 Impact;"collaboration" → 先问 Challenge)。

### Per story (4 follow-ups, one turn each)

1. **STAR walk**: "情境 = {S},任务 = {T},你具体做了 {A},结果 = {R}。对吗?"
2. **Earned Secret**: "从这件事里学到的**一个反直觉**的东西是什么?那种你这个角色/专业的人通常不会知道的洞察。"
3. **Metric Mining loop** 跑 Result:追至少一个数字
4. **Self-rating**: "按 1-5 分,5 = 独特 + 量化 + 能打动任何面试官,你给这个故事打几分?"

Stop at ≥3 stories at strength ≥3.

---

## Phase 5: Gap Analysis (5 dimensions, one per turn)

1. **Competency**(vs target / JD): "目标岗位需要的关键技能,有没有哪些没有故事支撑?"
2. **Domain**: "故事覆盖技术 + 业务 + 人际三维,还是集中在一个?"
3. **Recency**: "故事都来自一个 role,还是跨多个?"
4. **Risk**: "有没有任何一个故事是真有利害关系的?"
5. **Metric**: 数 `unknown` 比例。≥40% → flag `resume-quantifier`。

每个 gap 记到 artifact 里。Gap 不阻 handoff,影响 Phase 6 路由。

---

## Phase 6: Synthesis + Path A/B Routing + Skeptical Recruiter (Phase 6.5)

### Step 1: Write the artifact

Save to `~/Documents/Resume/intake-{YYYYMMDD}.md` using template in `references/intake-artifact-template.md`.

### Step 2: Read back summary

> "快速回顾:
> - Target: {target role}
> - Persona: {student-internship / student-jobhunt / recent-grad / cross-major-pivot}
> - JD-aware: {ON / OFF}
> - 挖到 role 数: {N}
> - Hero stories: {N}(平均强度 {X}/5)
> - Top gaps: {gap1}, {gap2}, {gap3}"

### Step 3 (Phase 6.5): Skeptical Recruiter checkpoint (NEW)

**在 path 决策之前**,扮演怀疑你的 HR,过 3 个最可能被追问的弱点:

> "在我把你交给下一个 skill 之前,我先扮演一个怀疑你的 HR,看 3 个最可能被追问的地方:
>
> 1. {Weak spot 1 — 从 artifact 挖,比如:某个 story 的 metric 是 'unknown' / 某个 gap 没被任何故事覆盖 / 某段经历挖到的深度不够 / 角色 listy 没具体化}
> 2. {Weak spot 2}
> 3. {Weak spot 3}
>
> 这些你想现在补一下,还是先收尾,handoff 后再处理?"

**Weak spots 来源**(Claude 自动从 artifact 提取最差几项):
- Storybank 里 strength ≤2 的故事
- "unknown" metric 多的 outcome
- Competency gap 里没故事覆盖的
- "depth: shallow" 的 role
- 角色 charter 含糊不清的

把暴露的 weak spots 写到 artifact 的 `## Skeptical Recruiter Flags` 段。

### Step 4: Path A/B routing decision

如果有 competency gap:

> "你的 top competency gaps for {target role} 是:{gap1}, {gap2}, {gap3}。
>
> A. **直接写简历**(用现有素材) → 我交给 {downstream-skill} 起草 bullet。快。
>
> B. **先做 1-2 个项目补 gap**(用 `designing-bridge-projects` 设计项目 brief + 学习资源)→ 这些 gap 会**自动传过去**,Skill 2 不会重新问。做完项目 ship 后回来加 bullet。慢但简历更强。
>
> 选哪个?"

如果没显著 gap:跳过 offer,默认 Path A。

### Step 5: Path B special — populate Gap List for Skill 2

如果用户选 B,在 artifact 末尾追加 `## Gap List for Skill 2` 段:

```
## Gap List for Skill 2
- Gap 1: {gap text} | JD relevance: {keywords} | Why student needs to address: {一句话上下文}
- Gap 2: ...
- Gap 3: ...
```

Skill 2 Phase 1 会自动读这段,跳过 Phase 2 重新问。

### Step 6: Apply Handoff Decision Table

按 SKILL.md 的 Handoff Decision Table 推荐下游 skill。

### Step 7: Final checkpoint

```
DONE: Intake interview (6 phases + Skeptical Recruiter)
SAVED: ~/Documents/Resume/intake-{YYYYMMDD}.md
PATH: A / B
NEXT: I recommend running {next skill} because {reason}.
{If Path B}: Gap List 已写入 artifact,Skill 2 启动时会自动读。
```
