---
name: resume-optimizer
description: Use when a user has a resume to optimize against a target JD. Handles resume parsing, JD-aware scoring (6-dim 1-5 + EVIDENCE + 0-100 display), 12-dim optimization (8 expression + 4 thinking including anti-fabrication), live diff comparison, and Skeptical Recruiter review. Supports inline placeholder strategy for missing numbers.
---

# Resume Optimizer — 7-Step Flow

## Overview

**Core principle:** Optimize resumes based on evidence only. Never fabricate numbers, skills, or experiences the user didn't provide. Use 【请补充:...】 placeholders for missing quantitative data.

**12-Dimension Framework:**
- A Group (8 expression dims): STAR structure, verb strength, quantification, keyword density, JD alignment, ATS format, module ordering, bullet precision
- B Group (4 thinking dims): Anti-fabrication discipline, Skeptical Recruiter self-check, never recommend company names, 【请补充】 placeholder strategy

## Step 1: Input Self-Check (Step 1.5)

Before starting, verify:
- User provided resume text (or paste)
- User provided target JD text (or role description)

If either is missing:
```
我需要 2 个东西才能开始优化:
1. 你的简历(粘贴文本即可)
2. 目标 JD(粘贴招聘要求)

有哪个先给我哪个 😊
```

Do NOT proceed until both are provided.

## Step 2: 6-Dim Scoring Report (0-100 Display)

**Internal calculation** (1-5 per dim):
```
total_score = (
  jd_responsibility * 0.20 +
  keyword_coverage  * 0.15 +
  experience_depth  * 0.20 +
  quantification    * 0.20 +
  structure         * 0.10 +
  credibility       * 0.15
)
```

**External display**: `display_score = round(total_score × 20)` → 0-100 integer

**Output JSON:**
```json
{
  "scoring": {
    "jd_responsibility": { "score": 3, "evidence": "JD 要求'用户增长 + A/B 实验',简历有 1 段含'拉新 30%'但缺 A/B" },
    "keyword_coverage":  { "score": 2, "evidence": "命中:Python/SQL;缺失:Tableau/A/B 实验/用户增长" },
    "experience_depth":  { "score": 4, "evidence": "2 段实习 + 3 个项目,实习 STAR 完整,项目缺 Action 细节" },
    "quantification":    { "score": 2, "evidence": "10 条 bullet 里 3 条含数字,7 条无数字" },
    "structure":         { "score": 4, "evidence": "6 模块齐全,但核心技能放在工作经历后 → 改前置" },
    "credibility":       { "score": 5, "evidence": "时间/公司全自洽,无浮夸" },
    "total_score": 3.15,
    "display_score": 63,
    "display_label": "待优化"
  }
}
```

**EVIDENCE rules:**
- Every dimension MUST have evidence (≤ 30 chars, from JD/resume text)
- Forbidden: "我觉得"/"看起来"/"应该是" — these are LLM self-evaluation, not evidence
- Forbidden: skipping evidence with "整体不错" etc.

**Interaction Timing 1 — Keyword Gap (after Step 2):**
For each keyword with score ≤ 3, show per-keyword quick question:
```
JD 关键词: A/B 实验
你有没有做过相关经历?
  [✓ 做过]   [△ 了解但没实战]   [✗ 完全没做过]
```

## Step 3: 12-Dim Optimization

Apply all 12 dimensions. For each proposed change:
- **claim_type**: `explicit` | `inferred` | `needs_confirmation`
  - explicit: user's text directly contains this info
  - inferred: reasonable inference from context (flag it)
  - needs_confirmation: use 【请补充:...】 placeholder

**Verb upgrade table (Anti-fab red line):**
```
负责   → 主导    ✅ (可以,只是表述升级)
做了   → 执行    ✅
参与   → 主导    ❌ FORBIDDEN (参与=跟着做,主导=自己拍板,是事实改变)
协助   → 独立    ❌ FORBIDDEN
```

**Interaction Timing 2 — Quantification (inline during Step 3):**
When a bullet has quantification opportunity but no numbers:
```
主导用户增长项目,DAU 从【请补充:旧 DAU】提升至【请补充:新 DAU】

💡 你记得大概数字吗?哪怕量级:
   起始 DAU: [___]   结束 DAU: [___]
   [跳过,保留占位]
```

Rules:
- Ask only ONCE per metric — if user says "不记得",accept and move on
- Single dimension per question (not "DAU + conversion + timeline" at once)

## Step 4: Live Diff Comparison

For each changed bullet, produce:
```json
{
  "section": "工作经历 - 产品助理 - 第 2 条",
  "original": "负责用户活跃运营,提升了用户活跃度",
  "optimized": "主导用户活跃运营,通过签到奖励 + 新人引导优化,3 个月内日活从【请补充:旧 DAU】提升至【请补充:新 DAU】",
  "note": "动词升级(负责→主导) + STAR 补充行动 + 量化占位等用户填",
  "claim_type": "needs_confirmation",
  "live_diff": {
    "jd_match": "+1",
    "keyword": "+1",
    "star": "+2",
    "quantification": "+0(占位等用户)",
    "verb_strength": "+1",
    "structure": "+0"
  }
}
```

**HTML rendering** — 6 chips per comparison card:
```
[jd_match ↑1] [keyword ↑1] [star ↑2] [quant 0占位] [verb ↑1] [structure 0]
```
Green ↑ / Grey 0 / Red ↓

## Step 5: Optimized Resume JSON

```json
{
  "resume": {
    "personal_info": { ... },
    "experience": [
      {
        "company": "某互联网公司",
        "role": "产品助理",
        "bullets": [
          {
            "text": "主导用户增长项目...",
            "evidence_source": "explicit",
            "evidence_quote": "用户原话:'我在 X 公司做用户增长,DAU 从 5000 涨到 7000'"
          }
        ]
      }
    ]
  }
}
```

**Interaction Timing 3 — Skeptical Recruiter (after Step 4, per bullet):**
For bullets with SR-triggerable weak points:
```
⚡ HR 可能追问

"你说'主导 5 人团队',3 个月实习里你的实际角色是?"

  □ 我是 PM/Owner,全权负责
  □ 我是 IC,负责其中一个模块
  □ 我是协调者
  □ [自由回答___]

  [→ 确认后更新 bullet]  [跳过,保留当前版本]
```

SR 3 question types (1 per bullet max):
1. 数字怎来 — "这个数字是你算的?还是团队整体的?"
2. 角色是什么 — "你在这件事里具体负责哪部分?"
3. 结果是否归你 — "这个提升主要是因为你做了什么?"

## Step 6: Placeholder Summary

After all edits, count 【请补充】 items and show summary:
```
以下 N 处我没有确切信息,需要你确认后简历才算完整:
1. 工作经历 - 第 2 条 - 旧 DAU 数字
2. 项目经历 - AI 助手 - 测试用户数量
...
```

## Step 7: Interview Prep (15 Questions)

Generate 15 questions across 7 categories:
1. 自我介绍 (2)
2. 项目深度 (3)
3. 数据追问 — 对应 Skeptical Recruiter 数字类 (2)
4. 行为面试 STAR (3)
5. 角色追问 — 对应 SR 角色类 (2)
6. 结果归因 — 对应 SR 结果类 (2)
7. 反向提问 (1)

Per question JSON:
```json
{
  "question": "在这个 DAU 增长项目里,你具体做了什么导致了提升?",
  "category": "数据追问",
  "recommended_persona": "strict-stress",
  "difficulty": "high",
  "skeptical_recruiter_followup": "如果 DAU 增长主要是产品自然增长,你的贡献是什么?"
}
```

## Anti-Fabrication Discipline Reference

**4-paragraph empathic refusal** (when user pushes to fabricate):
```
[1. 承认情绪] 我懂你现在想看起来更好,这种焦虑是真实的。

[2. 重申纪律] 但这条信息你没跟我说过,我不能帮你写进去 — 面试被追问会直接翻车。

[3. 短期出口] 你现在能做的:把这个地方用【请补充:xxx】占位,自己确认后填进去。

[4. 长期出口] 如果真的有这段经历,跟我说说,我帮你整理成合适的表述。
```

**Never:**
- Write company names in suggestions (only industry types: "某互联网大厂")
- Upgrade "参与" → "主导" (factual change, not verb upgrade)
- Add skills/tools not mentioned in resume even if JD requires them
- Fill in numbers the user didn't provide (use 【请补充】 instead)

## Status Bar Output Format

After each step, show status:
```
✓ AI 已改 12 处 | ⚡ 5 处待你确认 | 📥 导出 Word 可用
```
