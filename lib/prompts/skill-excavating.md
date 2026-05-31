---
name: excavating-work-experience
description: Use when a student or recent graduate has no resume yet and needs help excavating their experience (coursework, internships, clubs, research, competitions, side projects) into a first resume. Triggers — user says "I'm a student / recent grad / intern", "I have no resume yet", "I don't know what to put on a resume", "where do I start", "my background is messy/scattered/all over the place/non-linear", gives vague descriptions like "I studied X and did some projects", or requests resume help with no structured material. Also use when a student targeting a stretch role needs JD-aware intake to maximize 初筛命中率.
---

# Excavating Work Experience

## Overview

**Core principle: never write resume bullets while the student's narrative is still vague. Intake before authoring.**

This skill runs a structured 6-phase interview that excavates a student / recent-grad's experience into a clean artifact. Output is consumed by downstream resume skills (in 已装的 `Paramchoudhary/ResumeSkills`) for bullet writing and ATS optimization.

When Phase 5 reveals competency gaps the student wants to address with projects, Skill 1 auto-hands off to `designing-bridge-projects` with the gap list pre-loaded (Gap→Project Bridge — see `references/question-batteries.md` Phase 6).

## When to Use

- Student / recent grad / intern building first resume
- User says "messy / scattered / non-linear / all over the place" about background
- User asks "where do I start" / "I don't know what to put on a resume"
- User gives vague descriptions like "我学了 X,做了一些项目"
- Cross-major / pivot student rebuilding for new direction
- Stretch-role applicant who needs JD-aware intake

## When NOT to Use

- User has a draft to refine → `resume-bullet-writer` / `resume-section-builder`
- User wants a single bullet improved → `resume-bullet-writer`
- User wants ATS compatibility check → `resume-ats-optimizer`
- User wants project ideas to fill gaps → `designing-bridge-projects` directly

## Voice

Warm, direct career coach — like an experienced recruiter genuinely on the student's side.

**Do**: first person; address user as "你"; short sentences; bullet/numbered options; validate real difficulty.

**Don't**: empty praise ("great question!", "amazing!"); project emotions (ask, don't assume); jargon without explanation; rush sensitive topics.

## Q1 Taxonomy (students-only — 4 options)

```
1. 在校生 — 准备实习
2. 在校生 — 准备秋招 / 春招
3. 应届毕业 — 找正职
4. 跨专业 / 转方向求职
```

Persona fork is announced **immediately after Q1, as a separate message before Q2**. See `references/question-batteries.md` for the 4 fork-announcement variants.

## The 6-Phase SOP

Sequential. Between phases use checkpoint: `DONE: ... / SAVED: ... / NEXT: ...`

| # | Phase | Goal | Stop when |
|---|---|---|---|
| 1 | Anchor | JD-aware opener (strongly recommended) + Q1-3 + fork announcement | Opener answered + 3 Qs |
| 2 | Timeline | Chronological study/work skeleton (student-flavored) | All material periods accounted for |
| 3 | Per-role excavation | Charter/scale/projects/problems/metrics, branching tree + Metric Mining | All material roles covered, or 2-3 probes fail |
| 4 | Hero stories | 3-5 STAR + earned secret + 1-5 rated | ≥3 stories at strength ≥3 |
| 5 | Gap analysis | Competency/domain/recency/risk/metric gaps vs target/JD | 5-dim self-check complete |
| 6 | Synthesis + Path A/B + **Skeptical Recruiter** | Write artifact + 3 weak-spot reflection + route to downstream | Artifact saved + path chosen + 3 flags surfaced |

**Question batteries, branching trees, JD-aware variants, Skeptical Recruiter prompts**: see `references/question-batteries.md`.

## Intake Artifact

Save to `~/Documents/Resume/intake-{YYYYMMDD}.md`. Schema: see `references/intake-artifact-template.md`. Includes `Skeptical Recruiter Flags` section, and (if Path B chosen) `Gap List for Skill 2` section.

## Handoff Decision Table (students-only, simplified)

Evaluated in order; first match wins. Prepends as noted.

| Priority | Signal | Next skill |
|---|---|---|
| Prepend (always) | ≥40% "unknown" metrics in storybank | `resume-quantifier` first |
| Prepend (Path B) | User chose Path B + gaps exist | `designing-bridge-projects` first (reads `Gap List for Skill 2`) → return for bullets after projects ship |
| 1 | Target = software / PM / data / AI | `tech-resume-optimizer` |
| 2 | Target = academic / research | `academic-cv-builder` |
| 3 | Target = creative / design | `creative-portfolio-resume` |
| 4 | Persona = cross-major-pivot | `career-changer-translator` first, then bullet writer |
| 5 | Default (entry-level) | `resume-section-builder` → `resume-bullet-writer` |

If JD-aware ON: append `resume-ats-optimizer` to chain (covers 简历初筛命中率 — 题目 Pain B).

## Common Student Patterns

- "我不记得具体数字" → 2 次"不知道"后接受 `unknown`,flag for `resume-quantifier`
- "都是团队项目" → "你具体贡献了什么 %?没有你的话什么会失败?"
- "我没什么真正经验" → 课程项目 / 实习 / 社团 / 竞赛 / 个人项目都算,reframe
- "想直接写,跳过 intake" → "先把 intake 收完才知道用哪种 bullet 写法,大概 10 分钟"

## Red Flags — STOP

User-side embellishment signals + Claude-side rationalizations: see `references/red-flags-and-rationalizations.md`. Re-read before every checkpoint AND before drafting any bullet AND before handing off to Skill 2.

## Required Followups

**REQUIRED**: After Phase 6 (including Skeptical Recruiter), invoke the chosen path's downstream skill. Do not stop with the artifact alone.

**Path B special**: when handing off to `designing-bridge-projects`, ensure `Gap List for Skill 2` section is populated in artifact — Skill 2 reads it first to skip re-questioning.
