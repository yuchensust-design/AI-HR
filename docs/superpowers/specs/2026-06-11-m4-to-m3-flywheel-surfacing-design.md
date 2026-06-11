# 补经历(m4)→ 改简历(m3)飞轮:素材可见化 + 智能落点 — 设计

日期:2026-06-11 · 状态:✅ A+B 已实现并验证(未提交)
关联:[[project_flywheel_connections]]、2026-06-11-m4-handoff-and-reasoning-quality-design.md

## 用户报告

点 m4「把这段经历送进简历优化」→ 跳到 m3,**界面看不到任何带来的信息**。
诉求:
1. m3 单独开一个框,展示从补经历带来的素材。
2. 把笔记变成项目的 **STAR**;
3. 若不是项目、只是学了知识/概念 → 落到 **技能** 或 **自我评价**;
4. 这个落点需要 **LLM 灵活判断**。

## 根因(已查代码确认)

**数据没丢,是展示层缺失。**
- m4 adopt → `projectToHiddenExperience()` 生成一条 hidden_experience(`m4-<id>`),
  登录态写 `m3_resumes.hidden_experience_json`,游客写 localStorage 总线 —— **链路正常**。
- m3 优化(`/api/m3/suggest-edits`)**确实读了** hidden_experiences,会产出 `category=hidden-experience-add` 的改建议 —— **消费正常**。
- **但 m3 setup 页从不渲染 hidden_experience**:只有一句「素材已带上」空文案(m3/page.tsx ~556),
  没有任何实体内容;且只识别 `from=debrief`,不识别 `from=m4`。
  → 用户一落地看到空白,以为没带成功。**这是设计遗漏,非数据 bug。**

## 现有可复用能力(已确认)

- 简历模型有区块:`experience[] / projects[] / activities[] / self_eval[] / skills{languages,frameworks,tools,domain}`
  (parse-resume/route.ts)。
- suggest-edits 的 `BULLET_SECTIONS = experience/projects/activities/self_eval`,
  支持 `new:projects[..]`(hidden-experience-add)、`alert:` 等 target。
- 现状局限:hidden-experience-add **只会落成 `new:projects[..]`(永远当项目)**;
  没有「落技能 / 落自我评价」的路径;项目素材 `star_breakdown=null`,未 STAR 化。

## 设计

### Part A — m3 把带来的素材「显出来」(直接修 bug)

1. m3 page 读 `from=m4`(现仅读 debrief)+ `data.hidden`,在 setup 页加一张
   **「📥 从补经历带来的素材 · N 条」卡**:
   - 每条显示 `topic_name` + 候选 bullet/`raw_user_material`(可展开);
   - **可编辑**(用户落地即可确认/修正真实成果,呼应反编造);
   - 注明「点『开始优化』后,AI 会把它合理织进简历」。
2. (可选)m3/result 把 `category=hidden-experience-add` 的建议高亮标「来自补经历」,
   让用户看到素材真的被用了(闭环验证)。

### Part B — LLM 灵活判断落点(项目 STAR / 技能 / 自我评价)

在 suggest-edits 里,对每条 hidden_experience **先分类再落点**(信号已有:
`topic_name` 前缀「补项目·」vs「补能力·」、`anti_fab_note`、学习卡的 `honest_use`):

| 素材类型 | 判定 | 落点 | 形态 |
|---|---|---|---|
| 真项目 + 有真实成果(notes) | 「补项目·」且 notes 含可信产出 | `new:projects[..]` | **STAR 化** bullets(情境/任务/行动/结果,结果以 notes 真实数字为准) |
| 学习/入门(概念、轻量产出) | 「补能力·」或 honest_use=了解/入门 | `skills.{tools/frameworks/domain}` 加具体技能 + 1 句 `new:self_eval` | 不冒充项目;只写"了解/入门 + 轻量产出" |
| 介于之间 | LLM 判断 | 就低不就高 | 宁可落技能,不灌水成项目 |

落点扩展需要:
- 新 target 类型 `new:skills.{group}`(把学到的工具/领域词加进技能区);
- 复用既有 `self_eval` 作 bullet section(`new:self_eval.bullets`)。
- STAR:在 hidden-experience-add 的 prompt 段要求项目类按 S/T/A/R 组织,
  **结果项强制引用 notes 真实成果,无则留待确认、不编造数字**(延续反编造)。

STAR 转换放在 **m3**(而非 m4 adopt 时):因为这里有简历上下文 + 目标 JD,
能按目标岗位定制 STAR 措辞;m4 adopt 保持轻(只传原始素材)。

## 落地档位(待用户选)

- **A 档(修 bug,~半天)**:只做 Part A —— setup 页显出素材卡(可编辑)+ 识别 from=m4。
  素材仍按现状(总是落成 new project)被优化消费。先让"看得见、可信"。
- **B 档(A + 智能落点,~1-1.5 天)**:再做 Part B —— suggest-edits 分类落点
  (项目 STAR / 技能 / 自我评价)+ 新 target。这才完整实现用户要的「灵活判断」。
- (可选)result 高亮「来自补经历」的建议。

推荐:**A 先落(直接消除"看不到"的硬伤)→ B 紧跟(质量)**。

## 实现记录(2026-06-11)

- **Part A**(app/m3/page.tsx):加 `localHidden` 本地副本 + `persistHidden`(localStorage+DB 双写);
  回流横幅下渲染「📎 带来的素材」可编辑 textarea(改成真实成果即时落库);识别 from=m4。
  验证:游客 from=m4 → 横幅 + 素材标题 + 原文进可编辑框,无报错。
- **Part B**:
  - suggest-edits/route.ts:hidden-experience-add 加「落点分流」规则 —— 项目类→`new:projects`(STAR)、
    学习类→`new:skills.{group}` / `new:self_eval.bullets`,就低不就高。
  - finalize-resume/route.ts:newSectionEdits 按 target 前缀分流渲染到「核心技能 / 项目经验(补充项目经历)/ 自我评价」。
    验证:三类 target 直打 finalize → 各落对应区块正确。
- **预览内联**(app/m3/result/page.tsx ResumePreview):已采纳的 new: 建议按落点内联进预览区块 ——
  `new:skills`→核心技能、`new:projects`→项目经验「补充项目经历」、`new:self_eval`→自我评价,
  每条带「补经历新增」标。与 finalize-resume 落点一致,所见即所得。
  (tsc+build 通过、无渲染崩溃;"采纳后内联显示"需真实 LLM 分析流跑起来才能完整 e2e,建议实跑眼检。)

## 追加根因修复(2026-06-11:项目仍进不了优化后简历)

用户:m3 setup 能看到素材了(Part A 生效),但优化后简历里没有这个项目。
深挖发现 **suggest-edits 早已重构成「按已有板块分桶并行」**(`callBucket`/活跃板块=已有内容的板块),
每桶被限制只产 `板块[i].bullets[j]` 改写、**从不产 new: 新增**;hidden_experience 被塞进每桶 prompt →
要么被硬塞进一条无关已有 bullet(把"基础数据分析"改写成光伏项目),要么(相关板块为空时)直接丢失。
→ hidden-experience-add 自分桶重构后**一直是坏的**(m4 与 m5 面试回流同此)。

修复(app/api/m3/suggest-edits/route.ts + result/page.tsx):
1. **新增专用 `callHiddenBucket()`**:只处理 hidden_experience_candidates,按落点分流产
   `new:projects`(STAR)/`new:skills`/`new:self_eval`,加进 Promise.all 与板块桶并行。
2. **板块桶 prompt 移除 hidden/外部素材**,明确「只改已有 bullet、不新增、不塞外部素材」→ 停止乱塞。
3. **result 页默认采纳 hidden-experience-add**(用户已在带入处确认 → 自动 accept,仍可改/撤)→ 直接显示进简历。
验证:同一 m4 素材直打 suggest-edits → 现在稳定产出 `new:projects[1].bullets` STAR 建议(category=hidden-experience-add),
+ 默认采纳 + Part B 预览/finalize 落点 → 项目进入优化后简历。tsc+build 通过。

## 追加修复(2026-06-11:改简历缺口→补项目 跳错会话且丢关键词)

用户:在改简历点 TensorFlow 缺口的「补项目」→ 跳到一个**与 TensorFlow 毫无关系的旧会话**(光伏缺陷检测)。
两个根因:
1. **会话编排忽略 fromm3**:登录态带 `?fromm3=` 但无 `c` 时,编排 effect 落到
   `listConversations → convs[0]`,把用户丢进**最近一个旧会话**(那条光伏的卡),而不是为这个缺口开新会话。
2. **关键词没进 URL**:m3 链接只传 `fromm3=<convId>`,**没带 `kw`(TensorFlow)**;
   即便开了新会话,m4 也不知道这次是补什么。

修复:
- **m3 链接**(m3/result/page.tsx):`/m4?gap=<kw>&fromm3=<m3convId>`,把缺口关键词带上。
- **m4 编排**(m4/page.tsx):新增 `fromM3 || gapKw` 分支 —— 为该缺口**单开新会话**
  (标题 `补:TensorFlow`),redirect 保留 `fromm3`+`gap`;不再串旧卡。
- **m4 落地**:`fromM3Active` 触发自动展开表单 + 一张「📥 从改简历带来的缺口 · 要补强的能力:TensorFlow」横幅;
  止血隐藏旧卡;生成后清掉 fromm3/gap。
- **差距分析聚焦**(analyze-gaps/route.ts):新增 `focusGap` —— prompt 要求差距报告**必含该关键词项并排最前**,
  围绕它给补强方向。让"补 TensorFlow"真的分析 TensorFlow,而非泛泛对照。
验证:游客 `/m4?gap=TensorFlow` → 横幅 + "要补强的能力:TensorFlow" + 表单自动展开(分析差距可点);tsc 通过、路由 200。
登录态多会话编排与 from=m1 同构(需登录实跑确认不再跳旧会话)。

## 追加修复(2026-06-11:补项目 JD 来源去噪 + 真岗搜索改为用户主动挑)

用户:从改简历点某缺口(分布式计算)进补项目,自己没传 JD,却冒出 AIDD/CADD —— 噪声。
查库实证:那条改简历会话 `meta.mode=role`、`raw_jd_text=""`,即**从没传过 JD**,要求全是按岗位名推断;
AIDD/CADD 不在该会话推断里,是补项目走 `mode=role` 时 `fetchMarketJDSample` **实时搜真岗**抓回来的
(真岗源非确定 → 噪声不可预测)。

修复(用户拍板的两段式):
- **Part 1 — 改简历单关键词 → 补项目:不搜真岗,对齐改简历口径。**
  - `analyze-gaps`:有 `focusGap` 或 `skipMarketSearch` → 跳过 `fetchMarketJDSample`。
  - m4 handoff:改简历是推断 JD(raw 空)时,用 `synthesizeJdFromContext`(jd_summary+must_have+加分项)
    合成一份 JD → `mode=full` 分析 → 缺口列表与改简历完全一致、focusGap 置顶、零市场噪声。
  - 验证:同条真实数据 → 第一条缺口=分布式计算,无 AIDD/CADD。
- **Part 2 — 直接进补项目(填岗位名、没贴 JD):真岗搜索改为用户主动开 + 挑一条。**
  - IntakeForm 加「岗位要求来源」二选一:🧠 AI 按岗位知识推断(**默认**,`skipMarketSearch`)/
    🔍 用真实在招岗位 → 调 `/api/m6/search-jobs` 列 6 条 → 用户挑一条 → `/api/m6/job-detail` 拉全文
    → 以 `mode=full` 用该岗 JD 分析。不再静默自动搜真岗。
  - 验证:实点搜出 6 条真岗、选中拉到 JD、确认"将用这条岗位的真实 JD 分析"。
  - 旧的 `fetchMarketJDSample` 自动 blend 路径自此不再被 UI 触发(保留兜底,不删)。

## 方向调整(2026-06-11:砍掉"搜真岗",改成 AI 生成可见 JD)

用户反馈"搜真岗 + 挑一条"太复杂、且 UI 丑(emoji 太多)、JD 也不一定拉得到。最终拍板:
**不再搜真实岗位。不管从哪个入口进补项目,只要没有真实 JD,就让 LLM 按岗位名生成一份 JD、
填进 JD 框里给用户看(可编辑)。JD 框成为唯一来源,差距分析永远 `mode=full` 基于框里这段。**

落地(取代上面 Part 2 的搜真岗整套):
- 删除:`/api/m6/search-jobs`/`job-detail` 在补项目里的调用、"岗位要求来源"二选一、选岗卡片、
  相关 state/函数/类型(MarketJob/marketJobToJd/groundMode/jobResults/picked* 等);并清掉这块的 emoji。
- 新增 `/api/m4/generate-jd`:`{roleName} → {jdText}`,LLM 生成贴近市场的中文 JD(岗位概述/职责/任职要求/加分项)。
- IntakeForm:JD 框下「让 AI 生成一份 JD / 重新生成」按钮;预填岗位名(m1)且 JD 空 → 自动生成一份;
  `分析差距`时若 JD 仍空但有岗位名 → 现场生成再分析。AI 生成的 JD 顶部标注「非真实 JD,可编辑」。
- m3→m4 仍复用改简历的推断要求(synthesizeJdFromContext)填进框,口径一致;focusGap 仍让所点缺口置顶。
- analyze-gaps 的真岗搜索(fetchMarketJDSample)自此不再被任何 UI 触发(保留兜底函数,不删)。
验证:游客 fresh /m4 无搜岗 UI 残留;填岗位名点生成 → JD 框填入 591 字 + "非真实 JD"标注 + "重新生成"。

## 铁律
- 调 LLM 的 route 必带 `maxDuration=60`;反编造不放松(STAR 结果项只用真实 notes);
- 表单/素材字段永不折叠;改完 dev server 实点验证;未经同意不提交。
