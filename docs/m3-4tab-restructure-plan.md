# m3/result 4-模块重构方案（对标 ResumeAI Pro + 融合差异化）

> 状态：**待用户 review**。review 通过后再动手。
> 关键词 bug 已修（技能区/tech_stack/课程喂进匹配器，已验证 Python/SQL 正确命中）。

---

## 0. 一句话目标

把 m3/result 从"单视图（关键词条 + 左 Chat + 右预览）"重构成**清晰的 4-tab 结构**（岗位匹配 / 简历对比 / 简历中心 / 面试准备），先对齐竞品"把问题摊给用户看"的呈现质量，再叠加你的差异化（anti-fab 来源标注 / Skeptical Recruiter / 真人模拟面试联动）。

---

## 1. 核心判断：数据基本都有，重点是"编排 + 补显示 + 持久化"

| Tab | 竞品有什么 | 你已有的数据 | 缺什么 |
|---|---|---|---|
| **岗位匹配** | 匹配度圆环 + 关键词 ✓/✗ + 缺失说明 + 问题总结(7) + 优化方向(6) | `dashboardData`(综合分+4维)、`llmJdKeywords/llmMatchedKeywords`(已修)、`KeywordGapSection` | ① 问题总结 ② 优化方向 ③ 关键词 ✓/✗ 全量 chip（现在只显示缺失） |
| **简历对比** | 共 N 处修改 + 规则标签 + 三段 diff | `data.edits[]`（含 original/suggested/reason/category/claim_type/sr_question）、`decisions` | ① 集中对比列表视图（现在散在简历 hover）② 决策持久化 |
| **简历中心** | 优化后纯文本 + 复制 | `ResumePreview` + `finalize-resume` + `export-docx`（下载 Word） | ① 一键复制纯文本（小补） |
| **面试准备** | 静态 6 类 Q&A 文档 | **m5 真人模拟面试**（更强，但没联动） | ① m3→m5 入口 ② 可选：轻量静态 Q&A 预览 |

**结论**：80% 是把已有数据重新组织进 tab，只需补 2 个 API 字段（问题总结+优化方向）+ 决策持久化 + m3→m5 入口。

---

## 2. 目标页面结构

```
Nav
─────────────────────────────────────
[顶部 sticky 工具栏]  ← 改简历/JD · 已改 N 处 · ⚡待确认 M 处 · [导出 Word]
─────────────────────────────────────
[评分大卡 M3ScoreDashboard]  ← 保留(竞品也有圆环),综合分 + 4 维度
─────────────────────────────────────
[ Tab 切换条:  岗位匹配 | 简历对比 | 简历中心 | 面试准备 ]
─────────────────────────────────────
        ↓ 当前 tab 内容区
```

### Tab 1 · 岗位匹配（最关键，"让用户看到问题"）
```
┌ 关键词命中总览 ────────────────────┐
│ 匹配度 82 圆环  ·  命中 13/15 进度条 │  ← 复用 dashboard 数据
├ JD 核心关键词命中情况 ──────────────┤
│ ✓SQL ✓Python ✗原型绘制 ✗Axure ...  │  ← 全量 chip(命中绿/缺失红),新增"全量"显示
│ ✗原型绘制：简历未提及相关经验        │  ← 缺失逐条说明(来自 gaps / 生成)
├ 原始简历问题总结 ───────────────────┤
│ 1. ... 2. ... 3. ...               │  ← 【新】suggest-edits 补 original_issues[]
├ 核心优化方向 ───────────────────────┤
│ 1. ... 2. ...                      │  ← 【新】suggest-edits 补 optimization_directions[]
├ 你的技能自评(可选保留) ─────────────┤
│ 缺失关键词 · 我会用/略懂/不会        │  ← 复用 KeywordGapSection
└─────────────────────────────────────┘
```
**差异化叠加**：缺失说明里区分"简历真没有"(需补经历) vs "有但没写清"(可改写)——对应你的 gaps.fixable 字段（易补/中等/难补）。竞品没有这层。

### Tab 2 · 简历对比
```
共 N 处修改 ·（来源图例:📄简历内容 ✍️你填的 🤖AI推测待确认）
┌ [category标签][区块名]  ▼ 展开 ──────┐
│   原始内容: ...                     │
│   优化后:   ...    [✓采纳][✗不用][✎改] │
│   修改说明: ...                     │
│   📄来源 / ⚡HR可能追问(SR) / ⚠️编造风险 │  ← 你的差异化(竞品没有,竞品反而偷偷造假)
└─────────────────────────────────────┘
```
**差异化叠加**：每条带 `claim_type` 来源标注 + `sr_question` ⚡ + `fab_warning`。这是你比竞品强的地方——竞品给简历偷偷加 Axure/Figma/编数字，你明确标"这是 AI 推测，待你确认"。

### Tab 3 · 简历中心
```
优化后简历(反映已采纳的修改)
[一键复制纯文本]  [下载 Word]
[ResumePreview 渲染]
```
基本复用现有 ResumePreview + handleDownload，补一个"复制纯文本"。

### Tab 4 · 面试准备（混合策略 = 既对齐竞品又突出差异化）
```
┌ 你的简历+JD 已就绪,两种练法: ────────┐
│ 🎥 真人模拟面试(推荐) → 跳 m5         │  ← 你的差异化:视频+性格切换,竞品只有静态文档
│    3 性格 × 3 类型,带 4 维复盘        │
│ 📄 快速面试题预览(可选,轻量) ─────────┤
│    6 类高频题 + 参考答案(基于你简历)  │  ← 对齐竞品,新 API /api/m3/interview-prep
└─────────────────────────────────────┘
```

---

## 3. 需要新增/改动的清单（每步明确）

### 3.1 后端 API

**A. `/api/m3/suggest-edits` 扩 2 字段**（route.ts，已返回 optimization_summary）
- 加 `original_issues: string[]`（3-7 条原简历问题，对标竞品"原始简历问题总结"）
- 加 `optimization_directions: string[]`（3-6 条优化方向，对标竞品"核心优化方向"）
- prompt 里加任务 + JSON schema 加字段；前端 `SuggestEditsResult` 类型加字段

**B.（Tab4 可选）新增 `/api/m3/interview-prep/route.ts`**
- 输入：parsedResume + jdContext
- 输出：`{ categories: [{ name, questions: [{ q, reference_answer, tip }] }] }`（6 类，对标竞品）
- anti-fab：参考答案只用简历真实内容，不编数字（这是和竞品的关键区别）

### 3.2 前端组件

**新建组件**（拆小文件，单一职责）：
| 文件 | 职责 |
|---|---|
| `components/m3/ResultTabs.tsx` | tab 切换容器 + state（URL `?tab=` 同步） |
| `components/m3/JobMatchTab.tsx` | Tab1：关键词总览 + 全量 chip + 问题总结 + 优化方向 |
| `components/m3/KeywordHitChips.tsx` | JD 关键词 ✓/✗ 全量 chip + 缺失说明 |
| `components/m3/DiffListTab.tsx` | Tab2：集中对比列表（复用 EditSuggestionCard 逻辑 + 来源标注 + SR） |
| `components/m3/InterviewPrepTab.tsx` | Tab4：m5 入口卡 + 可选静态 Q&A |

**改造**：
- `app/m3/result/page.tsx`：主结构从单视图改为 `评分大卡 + <ResultTabs>`；现有 ResumePreview 移入 Tab3，KeywordGapSection 移入 Tab1，edit 决策逻辑下沉到 Tab2
- 现"左侧 Chat 跟AI再改" stub：移入 Tab2 底部或暂时收起（它本来是 stub）

### 3.3 持久化（修现有缺陷）

- DB 表 `m3_resumes` 加列 `edits_decisions_json jsonb`（migration）
- `decisions`/`rewritten`/`srAnswers` 改用 `saveField` 持久化（登录态），游客存 localStorage
- 修复"刷新丢决策"的现有 bug

### 3.4 m3 ↔ m5 联动补全

- Tab4 加"去真人模拟面试 →" 跳 `/m5?from=m3`，带 conversation 上下文
- （m5→m3 回写已有，不动）

---

## 4. 分阶段实施（建议顺序）

| Phase | 内容 | 产出可验证点 |
|---|---|---|
| **P0** | suggest-edits 补 2 字段 + ResultTabs 骨架 + Tab1 岗位匹配（关键词全量 chip + 问题总结 + 优化方向） | 用户能清楚看到"简历差在哪 + 怎么改" |
| **P1** | Tab2 简历对比集中列表 + 来源标注/SR/anti-fab + 决策持久化 | 集中对比 + 差异化呈现 + 刷新不丢 |
| **P2** | Tab3 简历中心（复用预览+下载+复制） | 优化后简历 + 一键复制 |
| **P3** | Tab4 面试准备（m5 入口 + 可选静态 Q&A API） | 闭环到模拟面试 |

每个 Phase 独立 commit，本地 dev 验证后给你看，你确认再进下一个。全程在 worktree `oc-m3-antifab`，不动 main。

---

## 5. 设计决策（已锁定 2026-06-07）

1. **Tab4 面试准备**：✅ 保留静态面试题文档（基于 JD + 改好的简历，给用户背/熟悉）+ 底部加跳 m5 模拟面试入口。两者都做。
2. **评分大卡位置**：✅ 常驻顶部（tab 外）。
3. **"跟AI再改" chat**：✅ 做成真功能 —— 输入"把 X 改得更技术"→ 重新生成对应建议条。新增 `/api/m3/refine-edit`。
4. **范围**：✅ P0+P1+P2+P3 一次做完。每 Phase 独立 commit + 本地 dev 验证。

## 6. chat 真功能补充设计（决策 3）

- 位置：Tab2 简历对比 底部（或常驻侧栏），输入框 + 发送
- 流程：用户输入自然语言指令（"把项目经历改得更技术" / "第 2 条加上 SQL"）→ POST `/api/m3/refine-edit`，带 { 当前 edits, 用户指令, parsedResume, jdContext } → LLM 返回新增/替换的 edit(s) → 合并进 data.edits + 持久化
- anti-fab：refine 同样受 claim_type 约束，不编造用户没有的经历
