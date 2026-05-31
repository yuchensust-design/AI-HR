# Projects Artifact Template

Skill saves a populated version of this template to:
`~/Documents/Resume/projects-{YYYYMMDD}.md`

Replace `{YYYYMMDD}` with today's date in ISO format(例如 `projects-20260529.md`)。

Field names stable — downstream skills consume predictably。

---

```markdown
# Bridge Projects — {date}

## Context
- Target role:
- JD source: (if any — pasted text / URL)
- Source intake artifact: (path to intake-*.md if invoked via Path B)
- Persona type: [ student-internship / student-jobhunt / recent-grad / cross-major-pivot ]
- Time budget: [ weekends / 1-2 weeks / 1+ month ]
- JD-aware mode: [ON / OFF]

## Project P1: {name}
- **Status**: PROPOSED — not yet started
- Fills gap: {competency / domain gap}
- JD relevance: {keywords this project covers, if JD-aware}
- Scope: {realistic time estimate}
- Tech / tools:
  - 已熟悉: {list}
  - 顺便学: {1 个 max}
- Milestones:
  1. ...
  2. ...
  3. ...
  4. (可选 stretch)
  5. (可选 stretch)
- **Learning resources** (NEW — Phase 4.5):
  - 📖 Book: {title} — {为什么相关 + 看哪几章}
  - 🎬 Video / course: {title + 平台 + URL}
  - 📄 Doc / tutorial: {title + URL}
- End artifact: {GitHub repo / 部署 demo / 博客 / 视频 / paper}
  - Verifiable URL placeholder: (ship 后填)
- **Expected resume bullet (upon completion only)**:
  > *{drafted bullet using strong verb + scope + outcome + metric}*
  > _⚠️ 这条 bullet 还没拿到。只能在 End Artifact 公开可验证后加到真简历。_
- **Risks & Mitigations** (NEW — Phase 4.6 Skeptical Recruiter 产出):
  - Risk: {description} | Mitigation: {plan}
  - Risk: {description} | Mitigation: {plan}
  - Risk: {description} | Mitigation: {plan}
- Kickoff command(粘贴到新会话):
  > ```
  > 我想开始项目 '{name}'。Brief 在这里:
  > [paste Project P1 block above]
  > 帮我开始 milestone 1。
  > ```
- Suggested execution skill: { vibe-coding / 通用 Claude session / conducting-user-interviews / etc. }
- User commitment: [ ✅ Committed / 🤔 Interested / ❌ Not now ]

## Project P2: {name}
[repeat schema 上面]

## Project P3: {name}
[repeat schema — 如果有 3 个 chosen gap]

---

## 下一步给用户

1. **挑 ONE 项目开始**(不要并发 — 并发项目都不会 ship)
2. 开新 Claude session,粘贴你挑那个项目的 Kickoff command
3. 跟着 milestones 真做。Ship End Artifact
4. End Artifact 公开可 verify 后回这里:
   - 有简历 → `resume-bullet-writer` 加真 bullet
   - 没简历 → `excavating-work-experience` 做包含新项目的 intake
5. 然后回来做这份单子上的下一个项目

## NOT 不能做

- ❌ End Artifact 还没存在就把 Expected bullet 加到真简历(面试反噬)
- ❌ 并发启动所有项目(都 ship 不了)
- ❌ 开始后随意 inflate scope(右尺寸比野心更重要)
- ❌ 跳过 Risks & Mitigations(在 milestone 卡死时这个救命)
```
