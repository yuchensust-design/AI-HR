# Intake Artifact Template

The skill saves a populated version of this template to:
`~/Documents/Resume/intake-{YYYYMMDD}.md`

Replace `{YYYYMMDD}` with today's date in ISO format (e.g., `intake-20260529.md`).

Field names stable — downstream skills (especially `designing-bridge-projects`) parse this predictably.

---

```markdown
# Career Intake — {date}

## Profile
- Persona type: [ student-internship / student-jobhunt / recent-grad / cross-major-pivot ]
- Target role(s):
- Industry:
- Constraints: [城市, 远程/混合, 薪资带, 时间线, accessibility]
- Career stage: first-job

## Target JD (if provided)
- Source: [pasted-text / URL]
- Key requirements:
  - Technical / hard skills:
  - Soft skills:
  - Tools / tech:
  - Domain experience:
- JD-aware mode: [ON / OFF]

## Timeline
| Years | Org / School | Role / Program | Function | Notes (gap/promo/lateral/荣誉) |
|-------|--------------|----------------|----------|--------------------------------|

(For students: degrees, internships, substantial coursework projects, club leadership, competitions, research, side projects.)

## Per-Role Detail

### {Org} — {Role} ({YYYY–YYYY})
- Charter (1-2 行):
- Scale: [team / budget / users / scope]
- Key projects:
- Problems solved:
- Tools/tech:
- JD-relevance: [覆盖了哪些 JD keywords, 若 JD-aware]
- Excavation depth: [shallow / medium / deep]

[Repeat per role]

## Storybank

| ID | Title | Category | Strength (1-5) | Earned Secret (one line) | JD-keyword (if any) |
|----|-------|----------|----------------|--------------------------|---------------------|
| S001 | | Peak / Challenge / Impact / Failure / Learning Sprint / Praise | | | |

### Story Details

#### S001: {short title}
- Category: [Peak / Challenge / Impact / Failure / Learning Sprint / Praise]
- Situation:
- Task:
- Action (你具体做的):
- Result:
  - How big:
  - How fast:
  - How much:
  - How many:
  - How well:
- Earned Secret:
- JD-keyword covered:
- Strength: X/5

[Repeat per story — 目标 3-5 个 strength ≥3]

## Gap Analysis

- **Competency gaps** (vs 目标岗位 / JD): [目标岗位需要但没故事支撑的关键技能]
- **Domain gaps**: [技术 / 业务 / 人际 — 哪个 under-represented]
- **Recency gaps**: [所有故事都来自一个 role 吗?]
- **Risk gaps**: [有任何真利害关系的故事吗?]
- **Metric gaps**: [storybank 中 "unknown" 的比例 — ≥40% 则 prepend `resume-quantifier`]

## Skeptical Recruiter Flags (Phase 6.5 产出)

3 个 HR 最可能追问的弱点(Claude 从 artifact 自动提取):

- **Weak spot 1**: {描述} | Suggested fix: {建议}
- **Weak spot 2**: {描述} | Suggested fix: {建议}
- **Weak spot 3**: {描述} | Suggested fix: {建议}

## Handoff

- **Chosen path**: [ A (apply now) / B (design projects first via designing-bridge-projects) ]
- **Recommended next skill**: [skill-name]
- **Reason**: [why this skill given the intake signals + chosen path]
- **Optional follow-ups**: [其它可考虑的 skill]
- **Chain if JD-aware**: [chosen skill] → `resume-ats-optimizer`(覆盖初筛命中率)
- **If Path B**: 见下方 `Gap List for Skill 2`,Skill 2 启动时会自动读

## Gap List for Skill 2 (仅 Path B 时存在 — Skill 2 自动读)

- **Gap 1**: {gap text} | JD relevance: {keywords} | Why student needs to address: {一句话上下文}
- **Gap 2**: ...
- **Gap 3**: ...
```
