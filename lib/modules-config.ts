/**
 * 首页「能陪你做的 5 件事」数据
 * 用于 StepsSection / StepTimelineNav / StepDetailCard
 *
 * 设计取向(2026-06-04 WEB 重写):
 * - 不写 marketing 百分比,改用「定性能力维度 + 来源标签」对
 * - 加 outcomes(产出物清单)和 handoff(下一步承接)字段
 * - 让 HR 第一眼看见能力链 + 数据判断 + 闭环承接
 */

export type StepCapability = {
  label: string;   // 指标维度,如 "JD 关键词命中数"
  source: string;  // 来源,如 "来自 JD 解析" / "来自规则模板"
};

export type StepCta = {
  label: string;
  href: string;
};

export type StepHandoff = {
  text: string;                                            // "下一步 → STEP 03 写进简历"
  targetStep?: "01" | "02" | "03" | "04" | "05";           // 点击切换到对应 step
};

export type StepModule = {
  no: "01" | "02" | "03" | "04" | "05";
  title: string;
  icon: "compass" | "notebook" | "file" | "bulb" | "mic";
  slogan: string;
  desc: string;
  bullets: string[];
  outcomes: string[];
  capabilities: StepCapability[];
  handoff: StepHandoff;
  primaryCta: StepCta;
  secondaryCta: StepCta;
};

export const STEP_MODULES: StepModule[] = [
  {
    no: "01",
    title: "求职定位",
    icon: "compass",
    slogan: "先定方向,再决定怎么投",
    desc: "方向不清楚时海投只会浪费时间。先用 RIASEC 测评叠加你的经历信号,看哪些方向值得真投。",
    bullets: [
      "RIASEC 兴趣测评 + 经历交叉验证",
      "目标岗位类型与行业方向建议",
      "阶段性行动清单与求职节奏规划",
    ],
    outcomes: [
      "3-5 个推荐岗位方向",
      "每个方向的推荐依据(兴趣维度 + 经历证据)",
      "经历缺口标记(哪些方向需要补什么)",
    ],
    capabilities: [
      { label: "RIASEC 6 维分布", source: "来自 18 道量表题" },
      { label: "兴趣 chip", source: "来自岗位 tag 池" },
      { label: "经历交叉信号", source: "来自经历挖掘" },
      { label: "推荐置信度", source: "来自三段融合算法" },
    ],
    handoff: { text: "下一步 → STEP 02 把经历讲出来", targetStep: "02" },
    primaryCta: { label: "制定求职定位", href: "/m1" },
    secondaryCta: { label: "查看职位推荐", href: "/m1" },
  },
  {
    no: "02",
    title: "经历挖掘",
    icon: "notebook",
    slogan: "把模糊的经历,讲出可投的故事",
    desc: "经历不是没有,是没讲透。用结构化追问把「我做过」拆成「做了什么、为什么、结果如何」,沉淀可投简历的 STAR 素材。",
    bullets: [
      "STAR 框架结构化追问 + 复盘",
      "自动识别量化点和细节缺口",
      "Skeptical Recruiter 当场追问,水分提前剔",
    ],
    outcomes: [
      "结构化 STAR 素材库",
      "量化证据清单(数字、规模、影响)",
      "可投简历的候选 bullet 草稿",
    ],
    capabilities: [
      { label: "已识别经历数", source: "来自对话挖掘" },
      { label: "STAR 完整候选数", source: "来自 LLM 解析" },
      { label: "量化证据数", source: "来自细节追问" },
      { label: "可追问风险点", source: "来自 Skeptical Recruiter" },
    ],
    handoff: { text: "下一步 → STEP 03 写进简历", targetStep: "03" },
    primaryCta: { label: "开始挖掘经历", href: "/m2" },
    secondaryCta: { label: "查看 STAR 范例", href: "/m2" },
  },
  {
    no: "03",
    title: "简历优化",
    icon: "file",
    slogan: "一份简历,围绕目标 JD 改到能投",
    desc: "JD 才是衡量简历的尺子。基于目标 JD 做关键词命中、缺口映射、Live Diff,让简历更像「这个岗位会留下来的版本」。",
    bullets: [
      "JD 关键词命中 + 能力缺口映射",
      "Live Diff 6 维对比 + 来源溯源",
      "ATS 友好排版 + Word 一键导出",
    ],
    outcomes: [
      "1 份针对目标 JD 的 Word 简历",
      "Live Diff 6 维对比表(改前/改后)",
      "3-5 条候选 bullet(STAR / X-Y-Z)",
      "每条改动的素材来源溯源",
    ],
    capabilities: [
      { label: "JD 关键词命中数", source: "来自 JD 解析" },
      { label: "JD gaps 数", source: "来自缺口映射" },
      { label: "高优先级改动数", source: "来自 LLM 评估" },
      { label: "ATS 友好排版", source: "来自规则模板" },
    ],
    handoff: { text: "下一步 → STEP 05 模拟面试 / 等待面试反哺", targetStep: "05" },
    primaryCta: { label: "优化简历", href: "/m3" },
    secondaryCta: { label: "浏览 JD 案例", href: "/m3" },
  },
  {
    no: "04",
    title: "项目陪练",
    icon: "bulb",
    slogan: "缺什么补什么,完工后再写进简历",
    desc: "缺什么补什么。AI 根据简历 gap 给一个 2-4 周可 ship 的项目 brief,每日 task 跟到完工,完成前一律标 PROPOSED。",
    bullets: [
      "2-4 周项目 brief + 每日 task 卡组",
      "学习资源 + 关键里程碑跟踪",
      "完工后才允许写进简历(Anti-fabrication)",
    ],
    outcomes: [
      "2-4 周项目 brief",
      "每日 task 卡组",
      "学习资源链接清单",
      "PROPOSED 标记(完工前不可写进简历)",
    ],
    capabilities: [
      { label: "gap 类型分布", source: "来自简历分析" },
      { label: "时间预算", source: "来自用户输入" },
      { label: "项目可交付边界", source: "来自 brief 拆解" },
      { label: "Anti-fabrication 边界", source: "来自 PROPOSED 标记" },
    ],
    handoff: { text: "完工后 → STEP 03 写进简历", targetStep: "03" },
    primaryCta: { label: "开始一段项目", href: "/m4" },
    secondaryCta: { label: "查看项目库", href: "/m4" },
  },
  {
    no: "05",
    title: "模拟面试",
    icon: "mic",
    slogan: "练一次,知道下一次改哪条",
    desc: "3 种面试官风格 × 3 类场景,4 维评分识别可回写简历的亮点,把答出来的价值反哺到简历,形成完整闭环。",
    bullets: [
      "3 类场景:半结构化 / 行为面 / 技术面",
      "3 种面试官风格:亲切 / 严厉 / 严谨",
      "4 维评分 + transcript evidence + 亮点回写",
    ],
    outcomes: [
      "4 维评分报告(逻辑/具体/清晰/口水话)",
      "transcript evidence(每条评分的证据)",
      "可回写简历的亮点 bullet 候选",
    ],
    capabilities: [
      { label: "4 维 rubric", source: "来自评估 prompt" },
      { label: "transcript evidence", source: "来自 ASR + 评估" },
      { label: "可回写简历的亮点数", source: "来自 LLM 识别" },
      { label: "面试官风格 × 场景矩阵", source: "来自 3×3 设计" },
    ],
    handoff: { text: "↺ 反哺 STEP 03 简历优化,形成闭环", targetStep: "03" },
    primaryCta: { label: "开始模拟面试", href: "/m5" },
    secondaryCta: { label: "查看复盘范例", href: "/m5" },
  },
];
