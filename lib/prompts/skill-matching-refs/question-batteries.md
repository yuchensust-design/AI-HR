# Question Batteries — matching-and-augmenting-resume

Exact prompts and flow for each phase。

**一 turn 一问 — 不可商量。**

---

## Phase 1: 简历识别 + 解析

### Opener

> "在开始之前,我需要你的简历。可以选:
> 1. 直接粘贴简历文本(任何格式都行)
> 2. 上传 PDF/Word(我会读)
> 3. 已经有解析过的 intake-*.md 文件,告诉我路径
>
> 另外告诉我你感兴趣的 1-3 个目标岗位(职位名 + 行业 + 公司,有 JD 链接更好)。"

### 解析步骤(Claude 内部)

1. 读简历,提取:
   - 教育(学校、专业、年级、GPA、相关课程)
   - 实习/工作(公司、岗位、时间、bullet)
   - 项目(名称、技术栈、描述、成果)
   - 社团/活动/竞赛
   - 技能(技术栈、语言、工具)
   - 其他(认证、出版物等)
2. 写到 `~/Documents/Resume/parsed-resume-{YYYYMMDD}.md`,schema 跟 Skill 1 的 intake-artifact 一致(便于下游复用)
3. 读回 high-level 总结让用户确认:
   > "我读完了。摘要:{专业} 大{年级},{N} 段实习,{M} 个项目,{K} 个社团/竞赛。目标岗位:{...}。对吗?"

→ Checkpoint → Phase 2

---

## Phase 2: 岗位匹配 + 不足分析(题目 Pain A)

### Step 1: 派生候选岗位池

如果用户给了具体岗位/JD → 直接用。
如果用户只说"想找互联网工作"等模糊方向 → Claude 派生候选(基于专业 + 兴趣):
> "基于你的背景({专业 + 实习经历 + 项目方向}),我建议考虑这些方向:
> 1. {方向1 — e.g., AI 产品经理}
> 2. {方向2 — e.g., 算法工程师}
> 3. {方向3 — e.g., 数据分析师}
> 选 2-3 个深入分析,还是有其他想加的?"

### Step 2: 每个岗位计算 priority score + 匹配原因 + 不足

输出到 `~/Documents/Resume/matched-jobs-{YYYYMMDD}.md`(模板见 `references/matched-jobs-template.md`)

每个岗位包含:
- **Priority score**: 1-5(5 = 现在简历就能投, 1 = 差距很大不建议短期内冲)
- **匹配原因**: 引用简历的具体段落或项目,说明为什么 match
- **不足**: 列出 JD 关键词哪些没覆盖(分类:技术 / 软技能 / 工具 / 域知识)
- **可补救程度**: 哪些不足容易补(2 周内可学的)vs 难补(需要项目/经验积累)

### Step 3: 读回排序后的 ranking

> "排序好了,贴在 matched-jobs-{date}.md。前 3:
> 1. {岗位A} — Priority 4/5,主要因为 {强匹配点}
> 2. {岗位B} — Priority 3/5,可冲但要补 {gap}
> 3. {岗位C} — Priority 2/5,差距较大
>
> 接下来 Phase 3 我会问你一些选择题挖隐藏经验,这些隐藏点可能直接提升排名。继续?"

→ Checkpoint → Phase 3

---

## Phase 3: 信息挖掘增强(选择题为主 — 图中核心)

### 设计原则(从图中提取)

1. **让用户少打字**:选择题为主,降低输入门槛
2. **沾边都算**:任何相关的、能 connect 的都行,不要审判
3. **JD + 公司业务 双维度**:不只 JD 关键词,公司业务/行业特性也作为挖掘维度
4. **每题留一个填空**:4 选项 + 1 个 "其他(填空)" 兜底

### 提问方法论(详见 `references/multiple-choice-design.md`)

每个 gap 出 1-2 道选择题,引导用户回想:

**通用模板**:
> "{公司/岗位特征引子}。你之前有以下哪种相关经验?(可多选)
> A. {跟特征 1 直接相关的体验}
> B. {跟特征 2 直接相关的体验}
> C. {跟特征 3 间接相关的体验}
> D. {跟特征 1-3 都沾边的兴趣/学习}
> E. 没有但很感兴趣 + 愿意学
> F. 其他(填空)__________"

**举例**(图中给的"音乐公司"例):
> "字节跳动这个目标岗位会涉及音乐相关业务(汽水音乐 / 抖音音乐 / 短视频 BGM)。你之前有以下哪种音乐相关经验?(可多选)
> A. 学过乐器 / 唱歌 / 系统的音乐课程
> B. 写过乐评 / 听音乐很投入 / 参加过音乐演出/活动
> C. 做过音乐相关的产品分析 / 用户研究 / 用户访谈
> D. 持续关注音乐行业新闻 / 了解音乐产业生态
> E. 没有但很感兴趣,愿意快速学
> F. 其他(填空)__________"

### 每个 gap 1-2 题策略

Phase 2 识别的每个 top gap(competency / domain / JD keyword)出 1-2 题。优先挖:
1. **公司业务相关的 domain 体验**(图中重点)
2. **JD 软技能相关的故事**
3. **JD 技术栈的实操或学习经验**

### 用户回答 → augmented-storybank

任何回答 ≠ "都没有" 的选项,都展开追问 1 个深度问题:
> "你选了 B(写过乐评)— 在哪里写的?写了几篇?哪一篇你印象最深、为什么?"

3-5 个 follow-up 后,把这些隐藏经验转成 STAR 形态写到 `~/Documents/Resume/augmented-storybank-{YYYYMMDD}.md`。

### 停止条件

3-5 个新增故事 OR 用户开始疲倦(连续 3 次"都没有"或"不太相关"就停)。

→ Checkpoint → Phase 4

---

## Phase 4: 突击/学习建议(按时间预算分流)

### Step 1: 问时间预算

> "你大概有多少时间可以投入到补 gap?
> 1. < 1 周(突击模式 — 投递前抱佛脚)
> 2. 1-4 周(中期 — 校招前/后 1 个月)
> 3. ≥ 1 个月(长期 — 暑期/寒假/gap)"

### Step 2: 按预算分流推荐

**< 1 周(突击)**:
为每个 top gap 推:
- 1 篇行业新闻 / 公司财报摘要(中文,可读 5-10 分钟)
- 1-2 个 YouTube/B 站短视频(20 分钟内)
- 1 份面经(脉脉 / Nowcoder / 一亩三分地)
- 公司业务概览(官网 + 维基)

**1-4 周(中期)**:
- 1-2 本经典书(中文优先,例:《俞军产品方法论》/《人人都是产品经理》)
- 1 个系统课程(极客时间 / 阿里云大学 / Coursera 旁听)
- 关键概念清单(可索引,不必都背)
- 2-3 个真实案例研读

**≥ 1 月(长期)**:
> "时间充裕,我强烈建议**做一个真实项目**来补 gap。这比单纯学知识让简历更强,面试也有故事可讲。让我把你接到 `designing-bridge-projects`,那个 skill 专门设计补 gap 项目 + 学习资源,你也可以决定要不要做。"
>
> → handoff `designing-bridge-projects`,传 augmented-storybank + matched-jobs gap

### 写到 learning-plan-{date}.md

按 gap 分组,每组列具体资源。**Anti-fabrication**:只推 Claude 确认存在的(知名书 / 知名课程 / 官方文档);不确定的描述方向让用户自己 Google。

→ Checkpoint → Phase 5

---

## Phase 5: 综合输出 + Handoff

### Step 1: 总结

> "我帮你产出了 4 个文件:
> - `parsed-resume-{date}.md` — 解析后的简历(结构化)
> - `matched-jobs-{date}.md` — 岗位匹配 + 不足分析
> - `augmented-storybank-{date}.md` — 新挖出的 {N} 个隐藏故事
> - `learning-plan-{date}.md` — 按时间预算的学习计划"

### Step 2: 路由

> "下一步你想做什么?(可多选)
> 1. 优化简历 bullet(用上新挖的故事) → 我交给 `resume-bullet-writer`
> 2. 做项目补 gap(≥1 月时间) → 我交给 `designing-bridge-projects`
> 3. 一键生成 Word 简历 → 我跑 `tools/generate-resume-docx.py`
> 4. 模拟面试练习 → 跳到模拟面试 web app
> 5. 都先看看上面 4 个文件,有想法再回来
>
> 选哪个?"

### Step 3: 最终 checkpoint

```
DONE: 5 phase(parse + match + augment + learn + route)
SAVED: 4 个 artifact 在 ~/Documents/Resume/
NEXT: {chosen next step}
```
