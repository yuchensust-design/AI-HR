// m2「挖经历」地基资产 — plan 09 §0.7 E (Task 0)
//
// 三块地基:① OPTION_SETS 认领式多选字典  ② REFRAME_RULES 结构化 reframe(长尾/"别的"路径)
// ③ DEPTH_ANCHORS 中/深档 few-shot 锚例。
//
// 设计纪律(plan 09 §0.7):
// - key 必须 = EXPERIENCE_CATEGORIES 的 key(修 L3)
// - 🔴-3:每个 option 自带 competency 标签 —— reframe 只能给"已勾的事实"贴这个标签,
//   绝不新增未陈述的行为/规模/影响。high_signal 项认领后需轻确认"主导还是参与"(修 H9)。
// - Alt-2:REFRAME_RULES 是结构化数据(触发短语→能力标签→相邻类目→追问),
//   服务多选覆盖不到的高价值长尾(创业/科研/小众),与 OPTION_SETS 并列为第一支柱。

export type OptionItem = {
  /** 用户看到、用来"认领"的动作项 */
  label: string;
  /** 选中后可贴的能力标签(🔴-3:贴在已陈述事实上,不新增事实) */
  competency: string;
  /** 显著加分类(主导性强)→ 认领后轻确认"主导还是参与"(修 H9) */
  high_signal?: boolean;
};

export type OptionSet = {
  /** = EXPERIENCE_CATEGORIES 的 key */
  key: string;
  /** 认领卡问法 */
  prompt: string;
  options: OptionItem[];
  /** 强制兜底项(修 H5:一等公民,不是空输入框) */
  other_label: string;
};

// ① 认领式多选字典 —— Task 0 先做 3 类跑通,验证通过再补其余 7 类
export const OPTION_SETS: Record<string, OptionSet> = {
  teaching: {
    key: "teaching",
    prompt: "这段助教 / 教学,你做过下面哪些?(多选,沾边都算)",
    options: [
      { label: "批改作业 / 阅卷", competency: "标准把控 · 评估能力" },
      { label: "答疑解惑", competency: "知识表达 · 沟通能力" },
      { label: "出题 / 备课 / 做讲义", competency: "内容设计 · 结构化输出", high_signal: true },
      { label: "带讨论课 / 习题课", competency: "公开表达 · 带教", high_signal: true },
      { label: "一对一帮同学补弱项", competency: "因材施教 · mentoring" },
      { label: "整理笔记 / 错题集并分享", competency: "知识沉淀 · 利他协作" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  club: {
    key: "club",
    prompt: "这段社团 / 学生组织经历,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "策划并执行过活动", competency: "活动策划 · 落地执行", high_signal: true },
      { label: "拉赞助 / 对接外部资源", competency: "商务沟通 · 资源整合", high_signal: true },
      { label: "管过一个小组 / 部门", competency: "微型领导力 · 团队协调", high_signal: true },
      { label: "运营公众号 / 社媒账号", competency: "内容运营 · 用户视角" },
      { label: "招新 / 带新人", competency: "招募 · 带教" },
      { label: "管过财务 / 物资 / 排期", competency: "流程管理 · 资源调度" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  course_project: {
    key: "course_project",
    prompt: "这个课程项目 / 小组作业,你具体做过哪些?(多选,沾边都算)",
    options: [
      { label: "写需求 / 做前期调研", competency: "需求分析 · 用户研究" },
      { label: "负责某个模块的开发 / 实现", competency: "工程实现 · 独立交付", high_signal: true },
      { label: "做 PPT / 汇报 / 答辩", competency: "结构化表达 · 总结提炼" },
      { label: "协调分工 / 推进度", competency: "项目推进 · 跨人协作", high_signal: true },
      { label: "数据分析 / 可视化", competency: "数据分析 · 洞察提炼" },
      { label: "测试 / 查 bug / 把质量", competency: "质量把控 · 严谨度" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  competition: {
    key: "competition",
    prompt: "这段比赛经历,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "写代码 / 做技术实现", competency: "工程实现 · 快速落地", high_signal: true },
      { label: "做算法 / 数学建模", competency: "建模 · 算法能力", high_signal: true },
      { label: "写方案 / 路演 / 答辩", competency: "方案设计 · 公开表达" },
      { label: "查资料 / 做调研", competency: "信息搜集 · 分析" },
      { label: "团队分工 / 统筹推进", competency: "协作 · 统筹", high_signal: true },
      { label: "拿过名次 / 入围", competency: "竞争力 · 抗压" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  internship: {
    key: "internship",
    prompt: "这段实习里,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "独立负责过某块业务 / 项目", competency: "业务执行 · 独立交付", high_signal: true },
      { label: "写文档 / 报告 / 周报", competency: "文档 · 总结提炼" },
      { label: "做数据分析 / 出数据", competency: "数据分析 · 量化思维" },
      { label: "跨部门 / 对客户跟进对接", competency: "沟通协调 · 推进" },
      { label: "做调研 / 竞品分析", competency: "调研 · 洞察" },
      { label: "用过具体工具 / 系统", competency: "工具实操 · 上手快" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  personal: {
    key: "personal",
    prompt: "这个个人项目,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "独立从 0 做完并上线 / 发布", competency: "端到端交付 · ownership", high_signal: true },
      { label: "写代码 / 搭建实现", competency: "工程实现 · 自学落地", high_signal: true },
      { label: "做设计 / UI / 视觉", competency: "设计能力 · 审美" },
      { label: "写内容 / 文档 / 博客", competency: "内容输出 · 表达" },
      { label: "自己定需求 / 功能", competency: "产品思维 · 用户视角" },
      { label: "持续维护 / 迭代 / 收反馈", competency: "迭代 · 用户视角" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  volunteer: {
    key: "volunteer",
    prompt: "这段志愿 / 公益经历,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "组织 / 带队", competency: "组织 · 协调", high_signal: true },
      { label: "一线服务 / 执行", competency: "执行力 · 责任感" },
      { label: "招募 / 培训志愿者", competency: "招募 · 带教", high_signal: true },
      { label: "宣传 / 做物料", competency: "宣传 · 内容" },
      { label: "对接机构 / 资源", competency: "资源对接 · 沟通" },
      { label: "长期坚持参与", competency: "持续投入 · 自驱" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  campus_event: {
    key: "campus_event",
    prompt: "这段校园活动,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "上台 / 主持 / 演讲 / 辩论", competency: "公开表达 · 临场", high_signal: true },
      { label: "策划 / 组织活动", competency: "活动策划 · 落地", high_signal: true },
      { label: "幕后执行 / 统筹", competency: "执行 · 协调" },
      { label: "宣传 / 拍摄 / 剪辑", competency: "内容制作" },
      { label: "拉人 / 招募参与者", competency: "动员 · 沟通" },
      { label: "拿过奖 / 名次", competency: "竞争力 · 成果" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  parttime: {
    key: "parttime",
    prompt: "这段兼职,你做过哪些?(多选,沾边都算)",
    options: [
      { label: "家教 / 辅导", competency: "教学 · 沟通" },
      { label: "客户服务 / 销售", competency: "客户沟通 · 销售", high_signal: true },
      { label: "翻译 / 写稿", competency: "语言 · 内容" },
      { label: "运营 / 带账号", competency: "运营 · 用户视角" },
      { label: "收银 / 门店 / 一线", competency: "责任感 · 细致" },
      { label: "长期做 / 有回头客", competency: "靠谱 · 责任感" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
  hobby: {
    key: "hobby",
    prompt: "这个兴趣你深挖过哪些?(多选,沾边都算)",
    options: [
      { label: "长期钻研(一年以上)", competency: "持续投入 · 专精" },
      { label: "做出过作品 / 成果", competency: "产出 · 实践", high_signal: true },
      { label: "写分享 / 教程 / 科普", competency: "内容输出 · 表达" },
      { label: "运营社群 / 账号", competency: "运营 · 影响力" },
      { label: "参加圈内活动 / 比赛", competency: "投入 · 实践" },
      { label: "成体系地系统自学", competency: "学习能力 · 自驱" },
    ],
    other_label: "以上都不是 / 我做的是别的",
  },
};

// ② 结构化 reframe(Alt-2)—— 用户选"别的"或自由文本时,主动点亮被低估/长尾价值。
// trigger 命中 → 贴 competency 标签 + 用 adjacent 类目的认领卡接着挖(而非空框),并用 probe 主动追问。
export type ReframeRule = {
  /** 触发短语模式(匹配用户自由文本) */
  trigger: RegExp;
  /** 可贴的能力标签(🔴-3:贴在用户已说的事上) */
  competency: string;
  /** 相邻 option_set key —— 命中后用它的认领卡继续挖(修 H5) */
  adjacent: string | null;
  /** 主动追问话术(降"凭空回忆"门槛) */
  probe: string;
};

export const REFRAME_RULES: ReframeRule[] = [
  // —— 高价值长尾(多选字典覆盖不到,但最该挖)——
  {
    trigger: /创业|做了个产品|自己开了|开过店|摆摊|搞了个项目/,
    competency: "0→1 实践 · 端到端 ownership",
    adjacent: "personal",
    probe: "这个有真实用户 / 客户用过吗?大概多少?是你一个人还是带着人做?",
  },
  {
    trigger: /科研|论文|实验室|跟.*导师|课题|发表|专利/,
    competency: "研究能力 · 严谨求证",
    adjacent: "course_project",
    probe: "你在课题里具体负责哪一块?有没有产出(论文 / 报告 / 数据 / 专利)?",
  },
  {
    trigger: /开源|github|贡献了|提了.*pr|维护.*库/,
    competency: "工程协作 · 开源实践",
    adjacent: "personal",
    probe: "你贡献的是哪部分?有没有被合并 / 被别人用?star 或下载量大概多少?",
  },
  // —— 被低估的常见经历(多选也能接,但用户常自己不提)——
  {
    trigger: /帮室友|给同学讲题|帮.*debug|讲过题/,
    competency: "技术教学 · 沟通能力",
    adjacent: "teaching",
    probe: "大概帮了几个人?他们之后能自己上手了吗?",
  },
  {
    trigger: /组织.*聚餐|策划.*活动|办过.*活动|拉了个群/,
    competency: "活动策划 · 协调",
    adjacent: "club",
    probe: "多少人参与?有没有遇到冲突 / 临时状况、你怎么处理的?",
  },
  {
    trigger: /自学|坚持.*(个月|年)|啃完了|刷完了/,
    competency: "学习能力 · 自驱",
    adjacent: "hobby",
    probe: "学到什么程度?有没有做出一个能展示的小东西 / 作品?",
  },
  {
    trigger: /家教|翻译|代写|兼职|赚过钱/,
    competency: "客户沟通 · 责任感",
    adjacent: "parttime",
    probe: "服务过几个客户 / 学生?最长合作多久?有回头客吗?",
  },
];

// ③ 深度锚例(few-shot)—— 喂进 prompt,让 LLM 稳定区分 中档(draftable)vs 深档(strong)。
// 修 H10:深档"反直觉洞察"为可选加分项,不是达标必需。
export const DEPTH_ANCHORS = {
  // 中档 = charter + 1 个具体动作 + 1 个量化或影响(答不出量化标【请补充】照样成稿)
  medium: [
    "为 30+ 名同学提供高数答疑并整理常见错题集,期末多数同学反馈受用。",
    "运营院系公众号,月均产出 4 篇推文,单篇最高阅读【请补充】。",
  ],
  // 深档 = STAR 较完整 + (可选)一个反直觉洞察
  deep: [
    "课程小组作业中负责数据模块:原方案查询慢(S),需在答辩前跑通可视化(T);" +
      "我改用预聚合 + 缓存重写取数逻辑(A),把出图时间从十几秒降到 1 秒内、答辩拿到院系前三(R)。" +
      "反直觉:真正卡点不是算法而是数据没整理干净 —— 先洗数据比换模型更省事。",
    "社团招新季带 3 人小组做地推(T,报名一度冷清 S);" +
      "我们把'扫码送贴纸'改成'现场 30 秒小测+即时点评'(A),三天报名从 20 涨到 90+(R)。" +
      "反直觉:发赠品不如让人先体验一次'有收获',参与感比物质激励更拉转化。",
  ],
};
