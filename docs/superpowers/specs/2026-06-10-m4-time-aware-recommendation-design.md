# M4 补项目 · 时间感知推荐引擎 — 设计

日期:2026-06-10 · 分支:feat/web-a · 状态:已与用户对齐,待实现

## 背景 / 问题

M4「补项目」当前把项目深度写死成「2-4 周」(`weeks: 2|3|4`),完全没有时间预算输入。
"只有 3-7 天"和"有 2 个月"的用户拿到的方案深度一模一样。

原始设计本就要求「gap + **时间预算** + role」三要素(见 `PARALLEL-DEV.md:866`、
`docs/B-skill-research-report.md` Phase 4「时间预算 3 档」、源 skill `lib/prompts/skill-designing-bridge.md`),
M4 产品化时丢掉了时间维度与学习资源/right-sizing/诚实条款。

用户两个核心诉求:
1. **gap 分析必须做准**(简历能力 × JD 要求),"没分析好后面都白搭"。
2. **按可准备时间出高 ROI 方案**;短时间(如 3 天)不该硬塞项目,而应转向学习型补强(书/视频/补概念)。

## 已拍板决策

- **时间档 = 3 档,用户必选、无默认**:`sprint` 冲刺 3-7天 / `standard` 标准 2-4周 / `deep` 深耕 1-2月+。
- **gap 分析 = M4 专用深度分析**(不只复用 M3 关键词级 gaps):逐条判定简历"已具备/部分/缺失"并引用原文,打 `impact × 各档可补度`。
- **输出按档分类型**:冲刺 → `LearningCard`(概念+资源+轻量产出);标准/深耕 → `ProjectCard`(周计划+交付物)。
- **架构 = 方案 A 两步管道**:`analyze-gaps`(出可见、可勾选的差距报告)→ `recommend`(吃报告+档位出卡)。

## 架构

```
IntakeForm(简历 + 目标岗位/JD + 时间档[必选])
  ├─① POST /api/m4/analyze-gaps   → GapReport(打分差距报告,摊给用户看 + 可勾选要攻哪几条)
  └─② POST /api/m4/recommend      → 冲刺: LearningCard[] / 标准·深耕: ProjectCard[]
```

JD 仍可选(沿用前次决策):有 JD → 深度分析(full);无 JD → 基于岗位名的通用推断(role)。

## 数据模型(lib/m4-types.ts 新增/演进)

```ts
type TimeTier = "sprint" | "standard" | "deep";

type GapCoverage = "none" | "partial" | "have";
type ScoredGap = {
  jd_requirement: string;
  current_coverage: GapCoverage;      // 引用简历判定有没有 —— 治"分析不准"
  evidence: string;                   // 判定依据(简历/JD 原文)
  why_matters: string;
  impact: 1|2|3|4|5;
  fixable_in: { sprint: boolean; standard: boolean; deep: boolean };
};
type GapReport = {
  overall_fit: 1|2|3|4|5;
  matched: { jd_requirement: string; resume_evidence: string }[];
  gaps: ScoredGap[];
  summary: string;
};

type Resource = { type:"book"|"video"|"doc"; title:string; note:string; url?:string; lang?:"zh"|"en" };

type LearningCard = {                  // 冲刺档
  kind: "learning";
  covers_gaps: string[];
  title: string;
  concepts: string[];
  resources: Resource[];
  micro_deliverable: string;           // 一页总结 / 一条帖 / 笔记
  est_hours: string;
  honest_use: string;                  // 诚实落点:了解/入门,非"做过项目"
};
type ProjectCard = M4ProjectDraft & {  // 标准/深耕
  kind: "project";
  plan_unit: "day" | "week";           // ≤1月按天 / >1月按周
  risks: { risk:string; mitigation:string }[];   // Skeptical Recruiter
  learning_resources?: Resource[];
};
```

- `M4Project` 加 `kind` 判别符 + `time_budget: TimeTier`;两种卡共用状态机
  (PROPOSED→IN_PROGRESS→DONE + committable)和飞轮回流。
- 学习卡做完也能进简历,但 `honest_use` 约束写成"了解/入门级",不冒充项目(反编造)。

## 推荐逻辑 · ROI + 深度档位

ROI 排序:`impact` 降序,过滤到 `fixable_in[tier]===true` 的 gap;高 impact 但当前档补不了 →
在 `summary` 里诚实提示(拉长时间 / 换 gap),不灌水。

| 维度 | 🏃 冲刺(sprint) | 🚶 标准(standard) | 🧗 深耕(deep) |
|---|---|---|---|
| 输出类型 | LearningCard | ProjectCard | ProjectCard |
| 攻击 gap 数 | top 1-2 | top 1-2 | top 2-3 |
| 拆解粒度 | — | 按天(plan_unit=day) | 按周(plan_unit=week) |
| 项目/卡数 | 1-2 张学习卡 | 1-2 个项目 | 1 个深项目(或 ≤2) |
| 概念/周数 | concepts 3-6 | weekly_plan 2-4 周 | weekly_plan 5-8 周 |
| 交付物 | 1 micro_deliverable | 1-2 deliverables | 2-3 + 迭代证据 |
| 技术拉伸 | 0(只用熟的) | ≤1 级 | ≤1 级,可含 1 新框架 |
| 指标 | — | 2-3 | 3-5 含持续追踪 |
| 资源 | 2-3 个/卡 | 可选 | 项目内需学的 |
| 简历落点 | 一行"了解/作品" | 一段 2-3 bullet | 完整一段经历 |

资源来源:复用 `lib/prompts/skill-designing-bridge-refs/project-archetypes.md` 的按角色种子库
(每原型自带 2-3 个书/视频/文档)+ 反幻觉(不确定 URL 只给名字+方向,不编造)。

## UI / 流程

1. **IntakeForm 加 Step 03「可准备时间」**:3 张档位卡,必选无默认;"开始分析"在简历+岗位+档位齐了才可点。
   (沿用铁律:字段永不折叠。)
2. **GapReport 屏**:展示 overall_fit + 已具备(matched)+ 缺口列表(coverage/impact 徽标),
   每条可勾选"要不要攻";底部"✦ 生成方案"→ ②。
3. **结果区按 kind 渲染**:`LearningCard`(概念清单 + 资源 + micro_deliverable + honest_use)
   或 `ProjectCard`(演进现有 ProjectDetail:周/天计划 + 交付物 + 指标 + 风险 + 笔记 + Ask AI)。

## 复用 & 铁律

- 复用:`ResumeUploadInline`、`useLatestResume`、`parse-jd` 的脱敏/normalize 写法、
  archetypes/学习资源种子、现有 `ProjectDetail` 渲染、hidden-experience 回流。
- 铁律:两个新 route 必带 `export const maxDuration = 60`;表单字段永不折叠;
  改完在 :3110 dev server 实点验证;未经同意不提交。

## 测试

- 单测:ROI 排序、tier→档位参数映射、schema normalizer(纯函数)。
- e2e(playwright):冲刺档 → 出 LearningCard;深耕档 → 出按周 ProjectCard;
  GapReport 渲染 + 可勾选;控制台无错误。
