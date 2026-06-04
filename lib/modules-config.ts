/**
 * 首页「能陪你做的 5 件事」数据
 * 用于 StepsSection / StepTimelineNav / StepDetailCard
 *
 * metrics 是 marketing 数字,按各模块真实功能特性 draft,不是后台真实统计。
 */

export type StepMetric = {
  label: string;
  value: number; // 0-100
};

export type StepCta = {
  label: string;
  href: string;
};

export type StepModule = {
  no: "01" | "02" | "03" | "04" | "05";
  title: string;
  icon: "compass" | "notebook" | "file" | "bulb" | "mic";
  slogan: string;
  desc: string;
  bullets: string[];
  primaryCta: StepCta;
  secondaryCta: StepCta;
  metrics: [StepMetric, StepMetric, StepMetric];
};

export const STEP_MODULES: StepModule[] = [
  {
    no: "01",
    title: "求职定位",
    icon: "compass",
    slogan: "先定方向,再决定怎么投",
    desc: "AI 根据你的经历、目标行业、城市与薪资预期,先帮你聊出真正值得冲的岗位方向,避免一开始把简历海投、投错赛道。",
    bullets: [
      "RIASEC 兴趣测评 + 经历交叉验证",
      "目标岗位 / 城市 / 薪资区间建议",
      "阶段性行动清单与求职节奏规划",
    ],
    primaryCta: { label: "制定求职定位", href: "/m1" },
    secondaryCta: { label: "查看职位推荐", href: "/m1" },
    metrics: [
      { label: "推荐方向清晰度", value: 88 },
      { label: "经历交叉匹配", value: 84 },
      { label: "路径可执行性", value: 91 },
    ],
  },
  {
    no: "02",
    title: "经历挖掘",
    icon: "notebook",
    slogan: "把模糊的经历,讲出可投的故事",
    desc: "Skeptical Recruiter 风格追问每段课程 / 实习 / 项目,把我做过变成我做了什么、为什么、结果如何,产出可直接进简历的 STAR bullet。",
    bullets: [
      "STAR 框架结构化追问 + 复盘",
      "自动识别量化点和细节缺口",
      "Skeptical Recruiter 当场追问,水分提前剔",
    ],
    primaryCta: { label: "开始挖掘经历", href: "/m2" },
    secondaryCta: { label: "查看 STAR 范例", href: "/m2" },
    metrics: [
      { label: "STAR 完整度", value: 86 },
      { label: "细节覆盖率", value: 79 },
      { label: "量化点密度", value: 82 },
    ],
  },
  {
    no: "03",
    title: "简历优化",
    icon: "file",
    slogan: "一份简历,多个版本,版版能投",
    desc: "基于目标 JD 自动改写、关键词匹配、量化补足,Word 一键导出,ATS 扫描通过率大幅提升。",
    bullets: [
      "针对目标 JD 实时关键词匹配",
      "多版本简历对照 + ATS 友好排版",
      "Word 一键导出,投递不变形",
    ],
    primaryCta: { label: "优化简历", href: "/m3" },
    secondaryCta: { label: "浏览 JD 案例", href: "/m3" },
    metrics: [
      { label: "关键词命中率", value: 89 },
      { label: "描述适配度", value: 82 },
      { label: "ATS 通过率", value: 95 },
    ],
  },
  {
    no: "04",
    title: "项目陪练",
    icon: "bulb",
    slogan: "缺什么补什么,补完直接写进简历",
    desc: "AI 根据你简历缺的方向,设计 2-4 周可 ship 的项目 brief,每日 task 卡组陪你做完,产出可直接进简历的成果。",
    bullets: [
      "项目 brief + 每日 task 卡组",
      "学习资源 + 关键里程碑跟踪",
      "完工后自动写回简历 bullet",
    ],
    primaryCta: { label: "开始一段项目", href: "/m4" },
    secondaryCta: { label: "查看项目库", href: "/m4" },
    metrics: [
      { label: "项目可交付率", value: 83 },
      { label: "简历加分有效度", value: 87 },
      { label: "每日完成节奏", value: 80 },
    ],
  },
  {
    no: "05",
    title: "模拟面试",
    icon: "mic",
    slogan: "练一次,知道改哪条,反哺简历",
    desc: "3 种风格面试官(亲切姐姐 / 严厉压力 / 严谨技术),4 维评分 + 录音回放 + 追问建议,AI 识别 2-3 段答得最好的瞬间拟成 bullet,反哺到简历。",
    bullets: [
      "3 性格面试官:亲切姐姐 / 严厉压力 / 严谨技术",
      "4 维评分:逻辑性 / 具体性 / 应答清晰度 / 口水话频次",
      "亮点瞬间反哺 03 简历,形成闭环",
    ],
    primaryCta: { label: "开始模拟面试", href: "/m5" },
    secondaryCta: { label: "查看复盘范例", href: "/m5" },
    metrics: [
      { label: "4 维评分覆盖", value: 92 },
      { label: "反哺简历转化率", value: 78 },
      { label: "复盘可操作性", value: 85 },
    ],
  },
];
