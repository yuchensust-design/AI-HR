# Project Archetypes by Target Role

按目标角色分类的项目种子库,每个 archetype 含 **2-3 个学习资源种子**(优先中文 + 免费)。

Phase 3 brainstorming 用这个作种子,加上 Claude 通用知识适配到用户具体情况。

每个 archetype 必须产出 **shippable, externally verifiable artifact**(没有"我学了 X"无证据的)。

---

## AI Product Manager (AI PM)

### Archetype 1: Ship 一个 AI 工具(小但完整)
- **Gap covered**: shipping AI features end-to-end / AI 产品落地
- **Examples**: AI 简历评分 / AI 学习计划 / 行业问答 bot / 复习卡片生成器
- **End artifact**: 部署 demo + GitHub + 50+ 真实用户 + 写一篇 writeup
- **Learning resources**:
  - 📖 《AI 产品经理:方法、技术与实践》(机械工业出版社,中文)
  - 🎬 吴恩达《ChatGPT Prompt Engineering for Developers》(DeepLearning.AI,免费,英文 + 中文字幕)
  - 📄 Anthropic Claude API quickstart(英文,实操跟着做)

### Archetype 2: AI 产品的用户研究
- **Gap covered**: 用户研究 + AI 产品 sense
- **Examples**: 访谈 10 个 ChatGPT/Claude 用户在某个工作流的使用,综合写出 insight
- **End artifact**: 一篇 1500-2500 字的公开 writeup(知乎 / Medium / 个人博客)+ 访谈结论 + 产品建议
- **Learning resources**:
  - 📖 《用户访谈实战》(Steve Portigal,中文译本)
  - 🎬 Lenny Rachitsky 的播客 episodes on AI products(英文)
  - 📄 IDEO Design Kit 的用户研究方法卡片(英文 + 部分中文)

### Archetype 3: AI 产品 teardown / 战略思考
- **Gap covered**: 产品分析能力 + 战略思维
- **Examples**: 深度拆解 Notion AI / Cursor / Perplexity 的某个 AI 功能
- **End artifact**: 1500-3000 字 blog post + 框架图
- **Learning resources**:
  - 📖 《俞军产品方法论》(俞军,中文)
  - 🎬 极客时间《产品经理基础课》或 《刘飞的产品思维》(中文,部分免费)
  - 📄 a16z 关于 AI 产品的 essays(英文)

### Archetype 4: No-code AI workflow + 实测
- **Gap covered**: 实操 AI 工具 + 量化效果
- **Examples**: 用 Coze / Dify / 扣子搭一个真实任务的自动化(客服分类、内容审核、商品描述生成)+ 量化前后效果
- **End artifact**: 可访问的 workflow + 前后效果数据 + writeup
- **Learning resources**:
  - 📖 (无主流书)— 用平台自身教程
  - 🎬 Coze / Dify 官方视频教程(中文,免费)
  - 📄 各平台官方文档 + 案例库

### Archetype 5: 提示工程实验 + eval
- **Gap covered**: prompt 严谨性 + AI evals 基础
- **Examples**: 给某个任务设计 3 个 prompt 变体,在 50 个例子上 eval,写报告
- **End artifact**: 可复现 notebook(Colab / Jupyter)+ writeup
- **Learning resources**:
  - 📖 (Anthropic 官方 Prompt Engineering Guide,英文免费)
  - 🎬 DeepLearning.AI 的 AI evals 短课(英文,免费)
  - 📄 OpenAI Cookbook 里的 eval 示例(英文)

---

## Software Engineer (SWE)

### Archetype 1: Open source 贡献
- **Gap covered**: 公开 code / 协作能力
- **Examples**: 给你常用的工具(VS Code 插件 / Python 库 / npm 包)提交有意义的 PR(不是 docs typo)
- **End artifact**: 1-3 个 merged PR with substantive code
- **Learning resources**:
  - 📖 《Pro Git》(免费,中英文)— 协作流程
  - 🎬 GitHub 官方 'How to contribute to open source' 视频(英文)
  - 📄 每个目标项目的 CONTRIBUTING.md(必读)

### Archetype 2: 有用户的 side project
- **Gap covered**: 生产级工程 / 真实用户
- **Examples**: 解决你身边人需求的小工具,部署+真用
- **End artifact**: 部署 URL + GitHub repo + 20+ 真用户 + monitoring
- **Learning resources**:
  - 📖 《SaaS by the Numbers》(免费 e-book)
  - 🎬 Vercel / Railway 官方 deploy 视频
  - 📄 你选的技术栈官方文档

### Archetype 3: 技术深度博客系列
- **Gap covered**: 技术深度 / 表达能力
- **Examples**: 3 篇关于某个具体话题(数据库锁 / 异步 / 性能优化等)的深度文章
- **End artifact**: 3 篇博客 + 代码示例
- **Learning resources**:
  - 📖 《Designing Data-Intensive Applications》(中译《数据密集型应用系统设计》)
  - 🎬 极客时间相关专栏(中文,付费但常打折)
  - 📄 论文 / 官方文档(看选什么主题)

---

## Data Scientist / ML Engineer

### Archetype 1: 复现 paper + 扩展
- **Gap covered**: end-to-end ML + 研究能力
- **End artifact**: GitHub repo with notebook + 写哪里扩展了 + 结果
- **Learning resources**:
  - 📖 《Hands-On Machine Learning with Scikit-Learn, Keras & TensorFlow》(中译版有)
  - 🎬 吴恩达 ML 系列(Coursera,免费旁听,英文+中文字幕)
  - 📄 Papers with Code(英文,选 paper 的好平台)

### Archetype 2: 公开数据集 dashboard / 分析
- **Gap covered**: 数据沟通 / 可视化
- **End artifact**: 部署 dashboard + writeup
- **Learning resources**:
  - 📖 《Storytelling with Data》(中译版有)
  - 🎬 Streamlit / Plotly Dash 官方教程
  - 📄 Kaggle dataset + community notebooks

### Archetype 3: Kaggle 比赛 + writeup
- **Gap covered**: 实战 ML pipeline
- **End artifact**: Kaggle 提交 + 详细 writeup(中等以上排名)
- **Learning resources**:
  - 📖 《Kaggle 竞赛攻略》(国内有几本)
  - 🎬 Kaggle Learn 官方课程(英文,免费)
  - 📄 每场比赛 winner 的 solution writeups

---

## 市场 / 增长 (Marketing / Growth)

### Archetype 1: 内容系列 + 量化效果
- **Gap covered**: 内容营销 + 数据驱动
- **End artifact**: 5-10 篇文章 + 数据截图(读者数 / 互动数)
- **Learning resources**:
  - 📖 《增长黑客》(范冰,中文)
  - 🎬 Growth.Design 案例库(英文 + 视觉)
  - 📄 Reforge / Growth Tribe 公开内容

### Archetype 2: 真实小 campaign
- **Gap covered**: campaign 执行
- **End artifact**: campaign writeup + 数据
- **Learning resources**:
  - 📖 《广告狂人的 black book》或同类(中文)
  - 🎬 极客时间相关营销课
  - 📄 各广告平台官方学院(巨量学院 / 腾讯广告等)

### Archetype 3: SEO 从 0 到 N
- **Gap covered**: 自然增长
- **End artifact**: 小博客/站点 0 → N 访问量 + 方法 writeup
- **Learning resources**:
  - 📖 (无主流中文书)— 用 Ahrefs 博客 / Moz 教程
  - 🎬 Ahrefs Academy(英文免费)
  - 📄 Google Search Central 官方文档

---

## 设计 (UX / Product / Visual Designer)

### Archetype 1: 知名产品 redesign + case study
- **Gap covered**: 设计判断 / case study 写作
- **End artifact**: 完整 case study(research → wireframe → mockup → decision)
- **Learning resources**:
  - 📖 《About Face》(Alan Cooper,中译版)
  - 🎬 Figma 官方 community 教程
  - 📄 dribbble / Behance 优秀 case study 模仿

### Archetype 2: 小型 design system
- **Gap covered**: 系统化设计
- **End artifact**: 组件库 in Figma + 文档
- **Learning resources**:
  - 📖 《Design Systems Handbook》(免费,英文)
  - 🎬 Figma DS 教程视频
  - 📄 Material / Apple HIG / Ant Design 借鉴

---

## 销售 / BD (Sales / Business Development)

### Archetype 1: 真实 outreach campaign(志愿)
- **End artifact**: campaign + 响应率 + lessons writeup
- **Learning resources**:
  - 📖 《SPIN 销售巨人》(中译版)
  - 🎬 LinkedIn Sales Navigator 官方教程
  - 📄 Reddit r/sales 高赞 thread

### Archetype 2: Account research(5 个 deep dive)
- **End artifact**: 5 个完整 account plan + outreach 草稿
- **Learning resources**:
  - 📖 《Predictable Revenue》(中译版)
  - 🎬 (各 SaaS 公司销售培训视频)
  - 📄 LinkedIn / Crunchbase / 公司财报

---

## 如何使用这个 catalog

1. 找最接近用户目标角色的 section
2. 匹配 Phase 2 的 gap
3. 提 2 个候选(适配用户时间预算 + tech comfort)
4. 不要照搬:**根据用户具体情境改造**
5. Learning resources 选 2-3 个相关的,加上 Claude 通用知识补充其他

## 扩展原则

新加 archetype 时:
- 必须有 shippable artifact 要求
- 至少 2 个学习资源(优先中文 + 免费)
- 资源真实存在(不要编名字)
- 时间预算可估算
