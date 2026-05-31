# Question Batteries — designing-bridge-projects

Exact prompts and branching logic for each phase.

**One question per turn — non-negotiable.**

---

## Phase 1: Context Anchor

### Path A: invoked from `excavating-work-experience` (auto-load)

If invoked after intake, look for the latest `~/Documents/Resume/intake-*.md`:

1. Read the intake artifact silently.
2. Look for `## Gap List for Skill 2` section.
3. **If found**: confirm with user:
   > "我看到你刚做完 intake,带过来 {N} 个 gap:
   > 1. {gap1 text}
   > 2. {gap2 text}
   > 3. {gap3 text}
   >
   > 时间预算大概多少 — weekends only / 1-2 weeks / 1+ month?"
4. Skip directly to Phase 3(Gap prioritization 已由 Skill 1 完成,Phase 2 跳过)。

**If `Gap List for Skill 2` section is missing** (rare — user invoked Skill 2 standalone after intake or partial Path B): fall back to Path B standalone flow.

### Path B: standalone invocation

If no intake artifact OR user invoking directly:

- **Q1**: "你的目标岗位是什么?(贴 JD 最好 — 链接或文本)"
- **Q2**: "你目前的背景大概是?(年级 / 专业 / 关键技能。或者贴现有简历也行。)"
- **Q3**: "你能投入的时间和精力大概多少?(weekends / 1-2 weeks / 1+ month)"

If JD provided → set `JD-aware = ON`, extract key requirements.

→ Checkpoint → Phase 2.

---

## Phase 2: Gap Prioritization

**(自动从 intake 读到 gap 时,此 phase 跳过)**

### Standalone path

> "针对 {target role},常见的关键能力 signal 是:
> - {derived signal 1, e.g., 蕅 AI 功能 end-to-end}
> - {derived signal 2, e.g., 用户研究 + AI 产品}
> - {derived signal 3, e.g., 量化产品思维}
> - {derived signal 4, e.g., 目标行业 domain depth}
>
> 你觉得自己最需要补的 2-3 个是哪几个?"

挑 top 2-3。**不要 over-spec — 项目要聚焦。**

→ Phase 3.

---

## Phase 3: Project Brainstorming (per gap)

Work through gaps one at a time。

### Propose 2 candidates per gap

For each chosen gap, propose 2 candidate projects (有时 3 个),用 `references/project-archetypes.md` 作种子库:

> "针对 **{gap}**,两个项目候选:
>
> 1. **{Project A name}** — {一句话:你要做什么 + shippable artifact 是什么}
>
> 2. **{Project B name}** — {一句话}
>
> 哪个对你 resonate,还是想 brainstorm 第三个?"

### 项目候选质量门槛(Claude 提议前自检)

每个候选必须满足:
- ✅ 适配用户时间预算
- ✅ Tech stretch ≤1 级
- ✅ 产出 **shippable, externally verifiable artifact**(GitHub / 部署 demo / 博客 / 视频 / paper)
- ✅ 用 observable evidence 覆盖 gap
- ✅ 具体到用户**明天就能开始**

如果某个 gap 在用户的时间预算内做不出合格项目,**直说**:
> "实话说,针对 {gap},在你的时间预算内能做到的项目都偏弱。两个选择:(a) 拉长时间预算,(b) 接受这个 gap,在 {alternative gap} 上多投入。"

### 选定后

> "好选择。来 spec 一下 — 几个快问。"

→ Phase 4.

---

## Phase 4: Project Spec (per chosen project)

**一 turn 一问,增量构建 brief**。

### Q1 — Scope check(right-sizing)

> "实话说 — 你能在多少 weekends/weeks 里真的做完?让我们 right-size 一下,确保你能 ship。"

如果用户提议 >2x Phase 1 时间预算 → push back:
> "这有点野心了。'没 ship' 比 'modest scope' 更可怕。trim 到 {smaller scope},确保能完成。"

### Q2 — Tech / tools

> "这个项目你已经熟悉哪些技术栈?有没有一个你愿意顺便学的 — 但前提是不影响 ship?"

如果想 stretch >1 级("我从零学 Rust + ML + K8s")→ push back:
> "这 3 个新东西。挑 1 个学,其他用熟的。否则你会卡在环境配置上几周。"

### Q3 — Milestones

基于 Q1+Q2 提议 3-5 个 milestone:

> "我建议这样拆 milestone:
> 1. {Milestone 1 — 通常是 setup / 脚手架}
> 2. {Milestone 2 — 核心 MVP feature}
> 3. {Milestone 3 — polish + ship}
> {4. 可选 stretch}
> {5. 可选 stretch}
>
> 反应?要调整哪些?"

### Q4.5 — Learning Resources(NEW)

After milestones, before end artifact:

> "做这个项目你需要学/查一些东西。我给你列 2-3 个针对性的资源(优先免费 + 中文可访问;英文资源会标注语言):
>
> 📖 **书**:{title} — {一句话为什么相关 + 大概看哪几章}
> 🎬 **视频/课程**:{title + 平台 + URL(如果记得)}
> 📄 **文档/教程**:{title + URL}
>
> 这些是种子,你也可以告诉我已经熟悉了哪些,我换其他的。"

**资源来源**:
- `references/project-archetypes.md` 里每个 archetype 自带的 2-3 个 seed resources
- 加上 Claude 通用知识里 well-known 的资源,适配到这个具体项目

**Anti-fabrication for resources**:**只推荐你确实记得存在的资源**(知名书 / 知名课程 / 官方文档)。如果不确定 URL:
> "[资源名] 我记得有,需要你自己 Google 一下确认链接,我描述一下大概内容方向。"

不要凭空捏造资源名。

### Q5 — End artifact

> "Shippable 的东西是什么?
> - GitHub repo(public, README 完整)
> - 部署 demo(URL 可访问)
> - 博客 / writeup
> - 录像 / talk
> - Paper / report
> - 其他?
>
> 选一个 — 但必须是 recruiter 能 verify 的。"

### Q6 — Draft the future-state bullet

After brief完成,draft bullet:

> "如果你 ship 这个 end artifact,简历上的 bullet 会是:
>
> > *'{drafted bullet,STAR/X-Y-Z 格式 + concrete metrics}'*
>
> ⚠️ **重要:这个 bullet 是你的 TARGET,不是你现在能 claim 的。只能在 End Artifact ship 后加到真简历。**"

### Phase 4.6 — Skeptical Recruiter on the brief(NEW)

After brief 完成,**存盘之前**,扮演怀疑的 HR/mentor:

> "在我把这个 brief 存盘之前,我扮演一个怀疑你能完成这个项目的 HR/mentor,问 3 个最尖锐的问题:
>
> 1. {Skeptical Q1 — e.g., 你时间预算 4 周,但 milestone 3 需要学一个新框架还要部署,真的能赶上吗?}
> 2. {Skeptical Q2 — e.g., end artifact 是部署 demo,但你说不会前端,这部分谁帮?}
> 3. {Skeptical Q3 — e.g., 'expected bullet' 提到 'X 个用户',你打算怎么真正拉到这些用户?}
>
> 这些你想调整 scope,还是接受 + 标记为 risk?"

如果用户**调整** → re-spec(回到 Q1-Q5 相关的步骤)。
如果用户**接受 risk** → 写入 brief 的 `## Risks & Mitigations` 段,每个 risk 加 mitigation plan。

### Q7 — Commitment

> "实话说 — 你打算在接下来 {timeframe} 真的做吗?
> - ✅ Committed(本周就开始)
> - 🤔 Interested but not sure
> - ❌ Not now"

记录 commitment。"Not now" 也没关系,不评判。

→ 下一个 gap 的 project,或者 Phase 5 if 完了。

---

## Phase 5: Kickoff Prep

After 所有 chosen projects 有 brief。

### Step 1: 为每个 committed 项目生成 Kickoff command

> "**{project name}** 的 Kickoff command:
>
> ```
> 我想开始项目 '{name}'。Brief 在这里:[paste the project section from ~/Documents/Resume/projects-{date}.md]。帮我开始 milestone 1。
> ```"

### Step 2: 推荐执行 skill

| 项目类型 | 推荐 |
|---|---|
| Code 项目 | `vibe-coding` 或通用 Claude Code session |
| Research / 写作 | 通用 Claude session |
| 用户访谈 | `conducting-user-interviews` skill |
| PM teardown / strategy | 通用 Claude session |
| 数据分析 | 通用 Claude Code session(Python) |

### Step 3: 写 artifact

Save to `~/Documents/Resume/projects-{YYYYMMDD}.md`,用 `references/projects-template.md` schema。

### Step 4: Final checkpoint + 强力 push back 过度承诺

> "最终 checkpoint:
> ```
> DONE: {N} 个项目 brief 就绪
> SAVED: ~/Documents/Resume/projects-{YYYYMMDD}.md
> NEXT: 开新会话,用 ONE Kickoff command 开始。
> 完成后: 回 `resume-bullet-writer`(或 `excavating-work-experience` 如果还没简历)加真 bullet。
> ```
>
> **一条铁律:挑 ONE 项目开始,不要并发。** 2-3 个并发 = 都做不完。第一个 live 之后再回来下一个。"
