---
name: matching-and-augmenting-resume
description: Use when a student already has a resume (uploaded / pasted / in markdown) and wants to match it against target jobs, find hidden experience through low-friction questions, and get learning recommendations to close gaps. Triggers — user uploads/pastes resume + says "which jobs match me" / "what should I add for X role" / "我已经有简历,想优化匹配岗位" / "帮我看看我的简历能投什么岗位" / "我有简历但不知道哪些岗位适合"; student wants to maximize 初筛命中率 with existing resume material; student wants to expand their resume by surfacing forgotten/hidden experience.
---

# Matching and Augmenting Resume

## Overview

**Core principle: Low-friction augmentation — 选择题挖隐藏经验,沾边的都算,JD + 公司业务双维度。**

简历有了 ≠ 最优 ≠ 完整。这个 skill 通过 (1) 岗位匹配 + 不足分析 (2) 选择题为主的低门槛挖掘 (3) 时间预算分流的学习建议,把"沉默的素材"挖出来,把简历跟目标岗位对齐到最优。

## When to Use

- 学生已有简历,想看哪些岗位最适合 → Phase 2 岗位匹配
- 学生有目标岗位但不知道简历缺什么 → Phase 2 不足分析
- 学生想给已有简历加更多 relevant experience → Phase 3 选择题挖掘
- 学生不知道为补 gap 该学什么 → Phase 4 学习建议
- 学生时间充裕,想做项目补 gap → Phase 5 handoff `designing-bridge-projects`

## When NOT to Use

- 用户**没有**简历 → `excavating-work-experience`
- 用户只想改单条 bullet → `resume-bullet-writer`
- 用户只想 ATS 检查 → `resume-ats-optimizer`
- 用户想做项目(已知 gap) → 直接 `designing-bridge-projects`

## Voice

Same coach voice as siblings: warm, direct, no sycophancy. First person; 称用户 "你"; 一 turn 一问。

**Additional posture: 沾边就算,不审判。** 学生最大的 friction 是"我觉得我没什么经验"。这个 skill 的工作是用低门槛问题把他记不起来的、不当一回事的经验都挖出来。

## The 5-Phase SOP

| # | Phase | Goal | Stop when |
|---|---|---|---|
| 1 | 简历识别 + 解析 | 读简历转结构化 storybank | parsed-resume artifact written |
| 2 | 岗位匹配 + 不足分析 | 按大类排序候选岗位 + priority score + 匹配原因 + 不足 | matched-jobs artifact written |
| 3 | 信息挖掘增强(选择题) | 用 4 选项 + 1 填空挖隐藏经验,沾边都算,JD + 公司业务双维度 | augmented-storybank artifact written |
| 4 | 突击/学习建议 | 按时间预算分流(<1w / 1-4w / ≥1m) | learning-plan artifact written |
| 5 | 综合 handoff | 路由到 bullet writer / 项目设计 / 模拟面试 | next skill named |

**Question batteries, multiple-choice design rules, learning resource principles**: see `references/question-batteries.md` + `references/multiple-choice-design.md`.

## Artifacts(本 skill 产出 4 个文件 — schema 见 references/)

1. `~/Documents/Resume/parsed-resume-{YYYYMMDD}.md` — 解析的 storybank
2. `~/Documents/Resume/matched-jobs-{YYYYMMDD}.md` — 岗位匹配报告(模板见 `references/matched-jobs-template.md`)
3. `~/Documents/Resume/augmented-storybank-{YYYYMMDD}.md` — 选择题挖出的新增 storybank
4. `~/Documents/Resume/learning-plan-{YYYYMMDD}.md` — 学习/突击建议

## Handoff Decision Table

| 用户后续意图 | 下游 skill / 工具 |
|---|---|
| 优化简历 bullet | `resume-bullet-writer` / `resume-tailor` |
| 做项目补 gap(≥1 月时间) | `designing-bridge-projects`(传 augmented-storybank + matched-jobs gap) |
| 一键生成 Word | `tools/generate-resume-docx.py` |
| 模拟面试练习 | 模拟面试 web app |
| 多版本简历管理 | `resume-version-manager` |
| ATS 关键词最终检查 | `resume-ats-optimizer` |

## Common Patterns

- "我感觉这岗位我够不上" → 跑 Phase 2 让数据说话(可能 priority score 比想象高)
- "我没什么相关经验" → 跑 Phase 3 选择题,沾边都算,通常能挖出 2-3 个隐藏点
- "公司具体业务我不熟" → Phase 3 把公司业务也作为挖掘维度,而不只 JD
- "学不完那么多东西" → Phase 4 按时间预算分流,don't try to do everything
- "时间充裕想做点东西" → Phase 5 handoff `designing-bridge-projects`

## Red Flags — STOP

See `references/red-flags-and-rationalizations.md`. 重点防 (a) 选择题做成审判题(让用户感到压力),(b) 学习建议给过多让用户被淹没,(c) 推荐捏造的资源。

## Required Followups

**REQUIRED**: Phase 5 必须 name 一个 next step,不能停在 4 个 artifact 落盘就结束。学生看到 4 个 md 文件会迷茫,要明确"下一步去 X"。
