# 飞轮落地报告:把全家桶连成「两件核心 + 5 个喂料口」

日期 2026-06-10 · 分支 `feat/night-interaction-polish` · 基于对 oc-night-polish 全量代码勘察(带 file:line 证据)

## 0. 这份报告回答什么

赛题就两件事:**① 看岗位**(找匹配岗位)**② 改简历**(对 JD 改到能过初筛)。
叙事要把另外 5 个模块从"并列功能"收成"往这两件供弹药的有向飞轮":

| 喂料口 | 一句话 | 喂给谁 |
|---|---|---|
| 找方向 | 定投哪类岗位 | → **看岗位** |
| 挖经历 | 挖出简历没写的料 | → **改简历** |
| 补项目 | 补上 JD 缺口 | → **改简历** |
| 练面试 | 答出的亮点反哺简历 | → **改简历** |
| 复盘投递 | 投递反馈回流让匹配更准 | → **看岗位** |

报告逐条给:**现状(代码证据)→ 应该怎么连 → 可行性 → 改什么 → bug 风险**。最后给横切风险、优先级、和"先别做什么"。

---

## 1. 核心结论(先看这条)

**改简历这一侧已经有一条现成、已验证的"喂料总线":`m3_resumes.hidden_experience_json`。**

- 练面试(m5)采纳亮点 → 写进 `hidden_experience_json` → `/m3/result` 读出来 → 喂给 `suggest-edits` → 生成 `hidden-experience-add` 类改写建议。这条**已经跑通**(m5/debrief/page.tsx:387 写,m3/result/page.tsx:171-173 读,api/m3/suggest-edits/route.ts:76,133 消费)。

这意味着:**通往"改简历"的三个喂料口(挖经历 / 补项目 / 练面试)可以共用同一条总线,不需要各发明一套管道。** 复用已验证路径 = 可行性高、bug 面小。这是整份报告里最重要的一句。

通往"看岗位"的两个喂料口(找方向 / 复盘投递)是另一回事:看岗位目前**只读简历**推关键词,完全不读目标岗位方向、也不读投递反馈。这一侧没有现成总线,可行性中到低。

一句话定调:**"改简历"侧的飞轮 8 成是接线活(低风险);"看岗位"侧是新增信号(中风险)。别把两侧当一回事一起拍脑袋做。**

---

## 2. 逐条连接分析

### 2.1 练面试 → 改简历 ✅ 已完成(作为参照样板)

- **现状**:完整闭环已上线。`adoptHighlights()`(m5/debrief/page.tsx:405-437)把面试亮点转成 `HiddenExperience`(:26-49),写 `hidden_experience_json`(:387),跳 `/m3/result?c=&backfill=1`,m3 读出并喂 suggest-edits。
- **价值**:这是**唯一已验证的样板**。下面两条(挖经历、补项目)就是把它复制到新数据源。
- **要改**:无(已做,夜间还修了 evaluable 确定性 bug)。

### 2.2 补项目 → 改简历 ⭐ 最该先做(半条已通,价值最直接)

- **现状(半开环)**:
  - 入向已通:补项目**已经读** 改简历的 JD gaps(m4/page.tsx:198 `jdContext?.gaps`;api/m4/generate-projects/route.ts:116-145 收 gaps 进 prompt;生成的项目带 `source_gaps` 回指,m4-types.ts:42-43)。
  - 回向断了:补项目产物存在 `m4_projects.learning_cards_json`,**改简历从不读它**(m3/result 全文 0 处引用 m4;suggest-edits RequestBody 无 m4 参数;m3_resumes schema 无 m4 字段)。m4 的"送进简历"按钮(m4/page.tsx:710)只是 `router.push('/m3')`,**不带数据**。
- **应该怎么连**:照搬 2.1 样板。用户把项目标记 DONE+写笔记(`committable=true`,m4-types.ts) → 转成 `HiddenExperience` → 写进**同一条** `hidden_experience_json` → 改简历自动生成"项目补强"建议。
- **可行性:高**。复用总线 + 转换逻辑、入向已存在、`committable` 语义现成。
- **要改**:
  1. 复用 m5 的 `highlightToHiddenExperience` 同款转换,写一个 `m4Project → HiddenExperience`(topic 标 "补项目 · {gap}");
  2. m4 "送进简历"按钮:采纳前把 committable 项目转换 + 合并写 `hidden_experience_json`,再跳 `/m3/result?c=&backfill=1`;
  3. suggest-edits 的 prompt 已支持 hidden-experience-add,**无需改后端**(项目作为一种 hidden experience 即可),除非要单独标 "来自补项目" 的来源徽章(可选)。
- **bug 风险**:见 §3 的"哪一行"和"去重"——补项目和练面试可能往同一条 hidden 数组塞,必须 dedup。

### 2.3 挖经历 → 改简历 ⭐ 该做(同总线,纯新增接线)

- **现状(完全断开)**:挖经历产物(`IntakeArtifact`+`CandidateBullet[]`,带 STAR、competency、anti_fab_note)只写 `m2_intakes.intake_json`(m2/page.tsx:320-329)。改简历**从不读 m2_intakes**。用户得手动把挖到的料再敲进改简历的"挖掘"阶段。
- **应该怎么连**:`CandidateBullet` 结构和 `HiddenExperience` 高度兼容(都带 STAR + anti_fab + 文本)。挖经历"收工"后,转换 + 写 `hidden_experience_json`。
- **可行性:高**(同总线、结构兼容),略低于补项目仅因为**入向还没有**任何 m2↔m3 关联,是从零加一条边。
- **要改**:
  1. `CandidateBullet → HiddenExperience` 转换(同款);
  2. 触发点二选一:**(推荐)** 挖经历完成态加"导入到改简历"按钮(显式、可控,像现有 m2→m4 deep-link m2/page.tsx:879);或提交时 fire-and-forget 自动写(隐式、省事但更难调试)。先做显式按钮。
- **bug 风险**:同 §3。挖经历可能产出 10+ bullet,一次性灌进去会淹没 suggest-edits——**导入时让用户勾选**或限 top-N,别全塞。

### 2.4 找方向 → 看岗位 ◐ 可做但属另一侧(中可行)

- **现状(断开)**:找方向产出 `target_role_json`(role_type/industry/employability),存 `m1_assessments.target_role_json` + localStorage `m1_target_role`(m1/result/page.tsx:150,157)。**补项目已经读它**(m4/page.tsx:173),但**看岗位从不读**。看岗位的关键词纯从简历"最近3段经历倒推"(m6-splitter.md:15),完全无视用户想投的方向。
- **应该怎么连**:看岗位进页时读 `m1_target_role`,预填搜索词 / 作为 splitter 的优先关键词信号。
- **可行性:中**。机制和"改简历侧总线"无关,是另一套(目标岗位信号注入搜索)。改动点不多但跨前后端 + prompt。
- **要改**:
  1. m6/discover 进页读 localStorage(登录态读 `m1_assessments.target_role_json`),预填 `filters.role` 或自动触发一次匹配;
  2. (可选增强)match-resume API 收 `targetRole?` 透传给 splitter,prompt 加"若有目标方向,优先用它当 keyword 1"。
- **bug 风险**:
  - 目标岗位**散落两处**(m1 的 target_role vs 改简历的 jd_context.role_name),口径不一会让用户困惑"它到底按哪个投"。要定**优先级**(建议:看岗位场景以 m1 target_role 为默认、用户可改)。
  - 预填别变"强制锁定"——必须可清空可改,否则老用户复用旧方向会被绑架。

### 2.5 复盘投递 → 看岗位 ✗ 暂缓(最复杂、demo 价值最低)

- **现状(断开)**:复盘投递功能完整(tracker/,算 response/interview/offer rate,诊断 `direction_mismatch` 等,api/tracker/diagnose),但推荐动作只链到 找方向/改简历/练面试,**从不碰看岗位**;看岗位每次从零打分,对历史投递一无所知。
- **应该怎么连**:按 direction 聚合投递结果(高回复率方向加权、低回复率降权)喂给看岗位的 Scorer。
- **可行性:低**。需要(a)足够投递样本才有信号——新用户/demo 根本没数据;(b)改看岗位排序逻辑,是核心路径上**风险最高**的改动;(c)收益对评委不可见(要攒数据才看得出)。
- **结论:本轮不做**。投入产出最差,且动核心排序最容易引入"匹配突然变怪"的隐性 bug。叙事里这条用"规划中"一句话带过即可,别为它写代码。

---

## 3. 横切 bug 风险(这是"改完别留一堆 bug"的关键)

所有往 `hidden_experience_json` 写的连接(补项目、挖经历,加已有的练面试)**共享同一组地雷**。这是必须在动手前定死的契约,否则三条连接会互相踩。

### 风险 A:「写哪一行 m3_resumes」—— 最致命
- `useLatestResume` 读的是**全局最新**那一行(updated_at desc,**不按 conversation_id**)(useLatestResume.ts)。
- 但 `/m3/result?c=convId` 读的是**该 conversation 那一行**的 `hidden_experience_json`(m3/result:171-173)。
- m5 backfill 写"最新 m3 行",再跳 `?c=convId`。**若用户最新 m3 行 ≠ 跳转的 convId,采纳的内容不显示**——看起来像"采纳了但没生效"。
- **要求**:补项目/挖经历的 backfill 必须和 m5 用**同一个**"解析目标行"逻辑,并保证写入行 == 跳转 `?c=` 行。**建议抽一个 `resolveBackfillRow(user, convId)` 公共函数**,三条连接都调它,别各写各的。这是本次最该先做的"地基"。

### 风险 B:去重
- 练面试 + 补项目 + 挖经历可能往同一条 hidden 数组塞,反复采纳会堆重复项 → suggest-edits 反复建议同一条。
- **要求**:写入前按稳定 key 去重(m5 用 `question_id`;补项目用 `m4-{projectId}`、挖经历用 `m2-{bulletId}`,前缀区分来源)。merge 而非 append。

### 风险 C:游客 vs 登录 双路径
- 每条连接都得同时处理 localStorage(游客)和 DB(登录)两套,像现有同步 hook 一样。**只做 DB 会让游客 demo 直接断**(评委很可能不登录就点)。
- **要求**:转换 + 写入逻辑抽成与登录态无关的纯函数,登录态只决定"写 DB 还是 localStorage"。

### 风险 D:灌入量过大淹没建议
- 挖经历可能一次产 10+ bullet。全灌 → suggest-edits 一屏几十条,体验崩。
- **要求**:导入时让用户勾选 / 限 top-N。

### 风险 E:目标岗位口径分裂(仅 §2.4 找方向→看岗位)
- target_role(m1)与 jd_context.role_name(m3)两个"目标岗位"来源,必须定优先级,否则跨模块"按哪个岗位"不一致。

---

## 4. 可行性总评与优先级

| 连接 | 现状 | 可行性 | demo 价值 | bug 风险 | 建议 |
|---|---|---|---|---|---|
| 练面试→改简历 | ✅ 已通 | — | 高 | — | 已做 |
| **补项目→改简历** | 半开环 | **高** | 高 | 低(共用总线) | **P0 先做** |
| **挖经历→改简历** | 断开 | **高** | 中 | 低 | **P1** |
| 找方向→看岗位 | 断开 | 中 | 中 | 中 | P2(另一侧,单独评估) |
| 复盘投递→看岗位 | 断开 | 低 | 低 | 高 | **暂缓,叙事一句话带过** |

**落地顺序建议:**
1. **P0 地基**:抽 `resolveBackfillRow` + `mergeHiddenExperience(dedup)` 两个公共函数,把现有 m5 backfill 重构到它们上(等价重构,有 61 单测兜底验证不回归)。**这一步不加功能,只把地基打正**,后续两条才安全。
2. **P0 功能**:补项目→改简历(复用地基,入向已通,最快见效)。
3. **P1**:挖经历→改简历(同地基,加导入按钮 + 勾选限量)。
4. **P2(可选,单独一轮)**:找方向→看岗位(目标岗位注入搜索)。
5. **不做**:复盘投递→看岗位。

---

## 5. 叙事侧:大部分已经做了

勘察发现首页其实**已经在往两件核心收**:导航顺序 找方向·**看岗位**·**改简历**·练面试·复盘·挖经历·项目·日记(看岗位第2、改简历第3,挖经历/项目已右移);画像已从6个简化成2个(新生→找方向 / 有简历→改简历);看岗位 Hero 已置于首页第2屏。

**还差的(纯文案/布局,低风险):**
- Hero 标题仍泛("少一点迷茫,多一点底气"),主 CTA 仍"开始我的求职闭环→找方向"。建议改成结果导向 + CTA 直达"上传简历+JD→看匹配岗位+命中率"。
- `MainFlowDiagram` 仍是 1→6 等权线性图(components/MainFlowDiagram.tsx:11-18,硬编码易改)。建议改成**飞轮图**:正中"看岗位⇄改简历"两大节点,外圈 5 个喂料口用箭头指入并标"喂什么"——正好可视化本报告 §1 的总线。
- 每个辅助模块卡片加一句"我为核心供什么"(§0 表格那 5 句)。

这些和 §2 的接线**互不依赖**,可并行、可先上,风险最低。

---

## 6. 一句话总结

- **改简历侧飞轮**(补项目/挖经历/练面试 → 改简历):有现成总线 `hidden_experience_json`,是**接线活,可行性高**;唯一真风险是"写哪一行 + 去重 + 双路径",用一个 P0 地基函数统一掉就稳。
- **看岗位侧飞轮**(找方向/复盘 → 看岗位):是**新增信号**,找方向那条中等可做、复盘那条暂缓。
- **叙事**:已做大半,剩 Hero 文案 + 飞轮图 + 模块小标,纯前端低风险。

> 这是设计/可行性报告,**未改任何代码**。请 review:是否认可 P0(地基重构)→ 补项目 → 挖经历 的顺序?找方向→看岗位 要不要进本轮?确认后我再出实施计划(writing-plans),不会直接动手。
