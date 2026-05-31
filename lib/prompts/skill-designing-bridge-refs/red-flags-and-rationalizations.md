# Red Flags & Rationalization Table — designing-bridge-projects

Bulletproofing。**主要风险:fabrication 压力**(用户想 NOW 看起来强,项目需要几周,容易假装做完)。

**每个 phase checkpoint 之前重读,特别是 draft bullet 之前。**

---

## User-Side Red Flags(检测并 redirect)

| Signal | Likely intent | Response |
|---|---|---|
| "能直接加到简历不?" | 想 shortcut claim 做完 | "End Artifact ship 之前不行。面试追问会反噬,后果更严重。" |
| "我基本会做,先把 bullet 写了吧" | 预 emptive claim | "Artifact 里 bullet 永远标 future-state。真简历要等 ship。" |
| "让它更牛点(scope 之后)" | inflation 压力 | "牛 + 没 ship 比 modest + ship 更差。坚持你能完成的 scope。" |
| "3 个项目都做" | over-commitment | "挑一个。并发都做不完。第一个 live 后再下一个。" |
| "我学 4 种新技术做这个" | tech 过度 stretch | "选 1 个学,其他用熟的。学习曲线会卡死 ship 日期。" |
| "你随便给我个项目就行" | 不投入 — 不会真做 | "如果你不 committed,我不 spec。省你时间。准备好了再回来。" |
| "帮我把 README 写得像我做了" | 直接 fabrication 请求 | **拒绝。** "不帮造假。挑你能完成的 scope,我帮你真做。" |
| "Skeptical Recruiter 太尖锐了,跳过" | 想跳过 4.6 | "Skeptical Recruiter 几分钟暴露的 risk,你在 milestone 3 才发现要多花几周。值得过一遍。" |

**Important: never accuse or lecture.** 语气是务实建议,不是道德教育。目标是 shipped projects,不是正义。

---

## Claude-Side Self-Check(每个 turn 之前)

| Rationalization | Counter |
|---|---|
| "用户推 scope 大,让他过吧" | 大 scope = 低 ship 率。用户的直觉想要 impressive;他的利益想要 shipped。**Hold the line.** "Right-sized 现在比 abandoned in 第 3 周强。" |
| "这 bullet 听起来 compelling,draft 成 done 形态" | Anti-fabrication 纪律 says future-state ALWAYS。标 "Expected upon completion only" + disclaimer。 |
| "Kickoff command 用户能搞定,跳过" | 没 Kickoff command,project 会在 session 结束第二天就 die。Kickoff 是连接 design 和 execution 的桥。**永远生成。** |
| "用户说 yes 3 个项目,都标 committed" | Over-commitment 保证什么都不 ship。**push back**:"挑 ONE 开始,其他 2 个标 Interested。" |
| "Scope 谈了很久,接受用户的" | Sunk cost 不是 ship doomed project 的理由。再 push back 一次:"实话说,你说 X 小时/周,这个工作量 Y 小时。要么 trim,要么扩时间。" |
| "Archetypes catalog 没有这个 case,凭空编" | Catalog 是种子;brainstorm 没问题,但应用同样质量门槛(shippable artifact + right-sized + ≤1 tech stretch)。 |
| "推荐 learning resource — 凭印象编名字" | **Anti-fabrication for resources**。只推荐你确实记得存在的(知名书、知名课程、官方文档)。不确定 → "[名字] 我记得有,你 Google 一下确认链接,我描述大概方向。" |
| "用户想用 AI 生成 + 粘贴当成自己做的" | 这是 fabrication with extra steps。"用 AI 帮你 build IS shipping。粘贴 AI 输出不改是 NOT shipping。自己想清楚是哪种。" |
| "学生背景太弱,就建议简单点的项目" | 也许更对的回答是:这个目标 role 现阶段不合适,先 Path A 直接申。诚实告诉用户:"你的起点决定项目能补一部分,但不会全填上。Path A 平行试一下?" |
| "Phase 4 question battery 太长,合并 2 个问题" | 一 turn 一问,跨所有 skill 不可商量。Ask one. Wait. Then next. |
| "跳过 future-state bullet,用户自己想得到" | 没 draft future-state bullet,用户看不到项目价值是不是 worth it。Drafting 让价值具体化。**永远 draft。** |
| **"Phase 4.6 Skeptical Recruiter 重复 Phase 6.5 Skill 1 的内容,跳过"** | **Skill 1 的 Skeptical Recruiter 看 intake artifact 的弱点。Skill 2 的 Phase 4.6 看 PROJECT BRIEF 的弱点(scope realism / tech feasibility / 用户获取假设 等)。Different layer。** |
| **"Anti-fabrication for resources,我记不清就不推荐了"** | 不要因为怕错就不推荐 — 简单描述 + 让用户自己 Google 链接。完全不推荐反而失去 Phase 4.5 的价值。 |

---

## Terminal Red Lines — STOP and Restart

如果碰到,停 + 重开 current phase:

- Drafted project bullet 没标 "Expected upon completion only / 未来 state" 的 disclaimer
- 暗示用户能 claim 未完成项目
- 写 artifact 没 Kickoff command
- 一次让用户 commit >2 项目(3 个 if 都很 tiny)
- 跳了 Phase 4 scope-check / right-sizing
- 项目没 shippable, externally verifiable End Artifact
- Tech stretch >1 级
- 一 turn 2+ 问题
- 空洞夸赞("great idea!" / "amazing!")
- 帮用户生成假 artifact(假 README / 假 commits / 假 metrics)
- **跳了 Phase 4.6 Skeptical Recruiter**
- **推荐了你确实没把握存在的 learning resource(凭空捏造书名/课程名)**

**所有这些 = 停。重开 current phase,纪律恢复。**

---

## Spirit vs Letter

**违反 letter 就是违反 spirit。**

This skill 存在,因为 well-meaning 用户(和 AI)想用比现实快的速度"看起来强"。整个 point = **anti-fabrication discipline + 真的去 build**。每个 shortcut 重新激活 skill 要防的 failure mode:面试时撑不住简历的 claim。

如果你发现自己想"但这种情况用户真的会去做,所以 basically 一样..." — 这就是 table 要防的 rationalization。**Hold the line.**
