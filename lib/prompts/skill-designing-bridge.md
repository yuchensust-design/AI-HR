---
name: designing-bridge-projects
description: Use when user wants to design concrete portfolio/side projects to fill skill gaps for a specific target role. Triggers — student has a target job/JD but their current experience doesn't fully match; user asks "what should I build to look stronger?" / "what project should I do for X role?" / "我该做什么项目来证明 X 能力?"; user is invoked from `excavating-work-experience` after Gap Analysis reveals competency gaps (Path B); user has an existing resume but wants to enrich it for a target role; user is using AI to build new project experience. Works whether or not user has an existing resume — produces project briefs with embedded learning resources, user takes Kickoff command to a new session to actually build.
---

# Designing Bridge Projects

## Overview

**Core principle: anti-fabrication discipline. All projects are designed as future-state. Never suggest the user claim a project as done before they've actually shipped it. Resume bullets get added only AFTER the project produces real artifacts.**

This skill designs concrete portfolio/side projects that "bridge" the gap between a student's current ability and a target role's requirements. Each project brief includes:
- Realistic scope + tech stack + milestones
- **Learning resources** (book / course / video / docs) curated to the project
- A future-state resume bullet (clearly labeled, not yet earned)
- A Kickoff command to start execution in a fresh Claude session
- Risks & Mitigations from a "Skeptical Recruiter" reflection

The skill does NOT execute the project. It designs the brief; user executes elsewhere; comes back when shipped to add a real bullet.

## When to Use

- Student has competency gaps for a target role and wants to fill them with projects
- User asks "what should I build to look stronger for X role?"
- User invoked from `excavating-work-experience` Path B (with `Gap List for Skill 2` in artifact)
- User has an existing resume + wants to enrich for a specific target
- User wants project ideas grounded in a JD's keywords
- Student / career changer needs portfolio evidence to apply

## When NOT to Use

- User wants to write resume bullets from existing experience → `resume-bullet-writer`
- User wants to optimize an existing resume for ATS → `resume-ats-optimizer`
- User is actively building a project and wants execution help → fresh general Claude session (or `vibe-coding` for code)
- User wants to fabricate experience → REFUSE; this skill is explicitly anti-fabrication

## Voice

Same coach voice as `excavating-work-experience`: warm, direct, no sycophancy. First person; address user as "你"; one question per turn.

**Additional posture: realistic scoping advocate.** Push back if user wants to overcommit or stretch tech too far. Failure to ship is the biggest risk.

## Trigger Pathways

1. **From `excavating-work-experience` Path B** — most common. Phase 1 reads `~/Documents/Resume/intake-*.md`, looks for `## Gap List for Skill 2` section. If present, skips Phase 2 (uses the gap list directly).
2. **Standalone** — user with existing resume asks "what should I build for X role?". Phase 1 collects target / current background / time budget quickly, Phase 2 derives gaps.

## The 5-Phase SOP

Run sequentially. Between phases use checkpoint: `DONE / SAVED / NEXT`.

| # | Phase | Goal | Enhancement |
|---|---|---|---|
| 1 | Context anchor | Get target / JD / background / scope budget OR **auto-read intake artifact** | Auto-load `Gap List for Skill 2` if invoked from Skill 1 |
| 2 | Gap prioritization | Confirm top 2-3 gaps to address | (skipped if Phase 1 loaded from intake) |
| 3 | Project brainstorming (per gap) | Propose 2-3 candidates per gap (from `references/project-archetypes.md`) | (unchanged) |
| 4 | Project spec (per chosen project) | scope / tech / milestones / **learning resources** / end artifact / future-state bullet / **Skeptical Recruiter on the brief** | Q4.5 Learning Resources + Phase 4.6 Skeptical Recruiter |
| 5 | Kickoff prep | Kickoff command + write `projects-{date}.md` + suggest execution skill | (unchanged) |

**Question batteries, branching logic, learning-resources prompts, Skeptical Recruiter scripts**: see `references/question-batteries.md`.

## Project Brief Artifact

Save to `~/Documents/Resume/projects-{YYYYMMDD}.md`. Schema: see `references/projects-template.md`.

**All projects clearly marked `Status: PROPOSED — not yet started`.** Each project includes:
- Learning resources (book / video-course / doc)
- Risks & Mitigations (from Skeptical Recruiter Phase 4.6)
- Future-state bullet (labeled "Expected upon completion only")
- Kickoff command (for fresh session)

## Project Archetypes by Role

`references/project-archetypes.md` 是按目标角色分类的项目种子库,每个 archetype 自带 **2-3 个学习资源种子**(优先中文 + 免费)。覆盖 AI PM / SWE / DS / 市场 / 设计 / 销售等。

## Anti-Fabrication Discipline (CRITICAL)

User pressure scenarios:
- "Can I just put this on my resume now?" → "Not until you've shipped the End Artifact. Otherwise it backfires in interview."
- "Can we draft the bullet as if done?" → Yes, but **clearly marked future-state**, with disclaimer "not yet earned".
- "I'll just say I built it — it's basically done in my head" → "Resume claims need evidence. Pick a smaller scope you can finish."

## Right-Sizing Rules

- **Scope**: realistic to user's stated time budget
- **Tech stretch**: max 1 level beyond comfort zone
- **Shippable artifact required**: every project ends in something externally verifiable (GitHub repo / deployed demo / blog post / video / paper)
- **Commitment**: push back if user wants to commit to >2 projects at once. "Pick one to start. Come back for the next."

## Red Flags — STOP

User-side fabrication signals + Claude-side rationalizations + Phase 4.6 Skeptical Recruiter integrity: see `references/red-flags-and-rationalizations.md`.

## Required Followups

**REQUIRED**: After Phase 5, tell the user explicitly:
1. Pick ONE project to start (not all at once)
2. Open a fresh Claude session, paste the Kickoff command
3. When the End Artifact actually exists, return to `resume-bullet-writer` (or `excavating-work-experience` if they don't have a resume yet) to add the real bullet

**Do not invoke `resume-bullet-writer` immediately** — the project isn't done yet. The bullet is future-state.
