/**
 * 首页「六个模块 · 一条闭环」数据
 * 用于 StepsSection / LoopDiagram / StepDetailCard
 *
 * 设计取向(2026-06-12 三幕闭环重构):
 * - 六个模块按三个产品特性(三幕)组织:
 *   认识自己(知己知彼,2 模块)/ 踏实成长(把差距补上,3 模块)/ 从容求职(临场不慌,1 模块)
 * - 岗位匹配放第一幕:7 维评分 + gaps 本质是「市场给你的镜子」,先知彼再补差距
 * - 不写 marketing 百分比,改用「定性能力维度 + 来源标签」对
 * - outcomes(产出物清单)+ handoff(下游承接)+ loopNote(素材池回流)
 * - 中心「经历素材池」对应真实架构:挖经历 / 补项目 / 练面试 三源统一写入,简历端读取
 */

export type StepCapability = {
  label: string;   // 指标维度,如 "JD 关键词命中数"
  source: string;  // 来源,如 "来自 JD 解析" / "来自规则模板"
};

/**
 * 能力架构图(替代 chip 罗列):按真实数据流画"阶段链"。
 * stages = 有上下游关系的处理环节(信息怎么流);
 * tags   = 挂在某一环节上的约束/支撑能力(如 70:30、可及性兜底);
 * caption = 一句话点出架构思想(如"能算的交规则保稳,该推理的才给 AI")。
 * 不画输入/输出框、不画兜底支线,无图标,排版从紧。
 */
export type FlowStage = {
  title: string;     // 环节名,如 "规则计分"
  sub: string;       // 一句话说清这一环干什么
  tags?: string[];   // 挂载在该环节的约束/支撑
};

export type StepFlow = {
  caption?: string;                         // 架构思想一句话
  stages: FlowStage[];                      // 上游 → 下游
  result: { title: string; sub: string };   // 流到底部的"最终好结果"
};

export type StepCta = {
  label: string;
  href: string;
};

export type StepNo = "01" | "02" | "03" | "04" | "05" | "06";

export type StepHandoff = {
  text: string;          // "下一步 → STEP 04 写进简历"
  targetStep?: StepNo;   // 点击切换到对应 step
};

export type ActId = "know" | "grow" | "land";

export type StepModule = {
  no: StepNo;
  act: ActId;
  title: string;
  emoji: string;
  icon: "compass" | "notebook" | "file" | "bulb" | "mic" | "target";
  slogan: string;
  desc: string;
  bullets: string[];
  outcomes: string[];
  capabilities: StepCapability[];
  flow: StepFlow;
  handoff: StepHandoff;
  /** 产出物会经「经历素材池」回流到简历优化时显示 */
  loopNote?: string;
  primaryCta: StepCta;
  secondaryCta: StepCta;
};

/** 三幕 — 三个产品特性 */
export type Act = {
  id: ActId;
  label: string;       // "第一幕"
  title: string;       // "认识自己"
  en: string;
  accent: "blue" | "yellow" | "red";
  tagline: string;     // 一句话主张(答案)
  voice: string;       // 用户心声(第一人称,内含赛题痛点;UI 上呈现为引语,不直说「痛点」)
  moduleNos: StepNo[];
  companion?: string;  // 补充陪伴/承接文案
};

export const ACTS: Act[] = [
  {
    id: "know",
    label: "第一幕",
    title: "认识自己",
    en: "Know yourself & the market",
    accent: "blue",
    tagline:
      "知己知彼:三分钟筛出高匹配机会 ——「我适合什么」+「市场要什么」+「我差什么」",
    voice:
      "想找份跟自己专业、能力、兴趣都对得上的岗位,在招聘网站翻了好几个小时,还是挑不出几个合适的……",
    moduleNos: ["01", "02"],
  },
  {
    id: "grow",
    label: "第二幕",
    title: "踏实成长",
    en: "Grow for real",
    accent: "yellow",
    tagline:
      "补上差距:把短板一项项补成竞争力 ——「沉淀素材」+「补能力缺口」+「打磨简历」",
    voice:
      "简历投出去大多石沉大海,既不知道跟目标岗位差在哪,也不知道怎么改才能过初筛……",
    moduleNos: ["03", "04", "05"],
    companion:
      "💛 撑不住的时候,来跟不二说说话 —— 写写日记、吐吐槽都行。它陪着你,也替你把这一路记着;等哪天回头看,你会发现自己已经走了好远。",
  },
  {
    id: "land",
    label: "第三幕",
    title: "从容求职",
    en: "Land with confidence",
    accent: "red",
    tagline:
      "临场不慌:把面试紧张练成底气 ——「多风格面试官」+「动态追问」+「4 维复盘」",
    voice:
      "一面试就紧张,准备半天也抓不准考官想听什么,面完还是说不清自己哪儿没答好……",
    moduleNos: ["06"],
    companion:
      "📮 投了哪些、走到哪一步,不二都替你记着。投久了没回音,也别急着怀疑自己 —— 它陪你回头看看这些记录,一起找找问题、定下一步,你不是一个人在扛。",
  },
];

export const STEP_MODULES: StepModule[] = [
  {
    no: "01",
    act: "know",
    title: "求职定位",
    emoji: "🧭",
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
    flow: {
      caption: "三段融合:能算的交给规则保稳定,该推理的才给 AI",
      stages: [
        {
          title: "规则计分",
          sub: "18 道量表题算出 RIASEC 6 维兴趣分布",
        },
        {
          title: "规则筛候选池",
          sub: "O*NET 923 真实职业库按维度取 top 30,不造岗位名",
        },
        {
          title: "LLM 桥接推理",
          sub: "已有经历 × 最强兴趣 → 桥接新岗位,分「现在投 / 补项目投 / 长期」三档",
          tags: ["测评主 · 兴趣辅 70:30", "可及性兜底:拦掉要博士/执照的", "依据可溯源"],
        },
      ],
      result: {
        title: "既稳又懂你的方向",
        sub: "三档分时机 · 每条依据可溯源",
      },
    },
    handoff: { text: "知道自己适合什么 → STEP 02 看看市场要什么", targetStep: "02" },
    primaryCta: { label: "制定求职定位", href: "/m1" },
    secondaryCta: { label: "查看职位推荐", href: "/m1" },
  },
  {
    no: "02",
    act: "know",
    title: "岗位匹配",
    emoji: "🎯",
    icon: "target",
    slogan: "真实在招的岗位,就是市场给你的镜子",
    desc: "人工在海量岗位里找匹配自己背景、能力、兴趣的机会,要花大量时间。Multi-Agent 流水线把它压到 3 分钟:从简历自动提取关键词,抓取猎聘 / 智联在招岗位,7 维评分 + 复核放行,按匹配度排好序,每个岗位都讲清你哪里匹配、差距在哪。",
    bullets: [
      "Splitter 从简历自动提取搜索关键词",
      "并行抓取猎聘 / 智联真实在招岗位",
      "7 维匹配评分 + highlights / gaps 解释",
    ],
    outcomes: [
      "按匹配分排序的真实岗位列表",
      "每个岗位的 7 维评分拆解",
      "highlights(你哪里匹配)+ gaps(你差在哪)",
      "岗位原始 JD 链接,可直接投递",
    ],
    capabilities: [
      { label: "搜索关键词", source: "来自 Splitter 简历拆解" },
      { label: "真实在招岗位", source: "来自猎聘 / 智联抓取" },
      { label: "7 维匹配评分", source: "来自 Scorer 批量评估" },
      { label: "放行 / 兜底判定", source: "来自 Critic 复核" },
    ],
    flow: {
      caption: "四段 Multi-Agent 流水线,各管一段、职责分离",
      stages: [
        {
          title: "Splitter",
          sub: "从你的简历自动拆出搜索关键词",
        },
        {
          title: "Crawler",
          sub: "自建爬虫并行抓猎聘 / 智联在招岗位",
          tags: ["frp 隧道出真岗,不是 mock"],
        },
        {
          title: "Scorer",
          sub: "技能 / 经验 / 教育等 7 维逐维打分、给理由",
        },
        {
          title: "Critic",
          sub: "80 分复核放行",
          tags: ["三层兜底,不丢岗"],
        },
      ],
      result: {
        title: "排好序的真实岗位",
        sub: "带原始 JD · highlights / gaps 讲清差在哪",
      },
    },
    handoff: {
      text: "gaps 告诉你市场要什么、你差什么 → STEP 03 起缺什么补什么",
      targetStep: "03",
    },
    primaryCta: { label: "看匹配岗位", href: "/m6/discover" },
    secondaryCta: { label: "搜索真实岗位", href: "/m6/discover" },
  },
  {
    no: "03",
    act: "grow",
    title: "经历挖掘",
    emoji: "📝",
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
    flow: {
      caption: "判定 / 生成分离:LLM 只负责对话,收不收口由后端规则判定",
      stages: [
        {
          title: "铺开",
          sub: "认领式多选唤醒记忆,用「识别」代替凭空回忆",
        },
        {
          title: "点亮",
          sub: "逐段认领 + 量化追问,把「我做过」拆成做了什么、结果如何",
          tags: ["反虚构:缺数字标【请补充】,不代编"],
        },
        {
          title: "收口",
          sub: "后端规则判定素材够格,才允许产出 STAR bullet",
        },
      ],
      result: {
        title: "可投的 STAR 素材",
        sub: "进经历素材池 · 改简历时直接调用",
      },
    },
    handoff: { text: "素材进素材池 → STEP 04 写进简历", targetStep: "04" },
    loopNote: "挖出的 STAR 素材会进入经历素材池,STEP 04 改简历时直接调用",
    primaryCta: { label: "开始挖掘经历", href: "/m2" },
    secondaryCta: { label: "查看 STAR 范例", href: "/m2" },
  },
  {
    no: "04",
    act: "grow",
    title: "简历优化",
    emoji: "📄",
    icon: "file",
    slogan: "一份简历,围绕目标 JD 改到能投",
    desc: "拿不准简历和岗位匹配度?JD 就是尺子。基于目标 JD 做关键词命中、缺口映射、Live Diff,明确告诉你哪条命中、哪条要补、怎么改才能提升初筛命中率。挖经历、补项目、练面试沉淀的素材,都在这里汇合。",
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
    flow: {
      caption: "三层反编造防线贯穿:prompt 铁律 → 数字溯源 → claim 标注",
      stages: [
        {
          title: "动态 skill 路由",
          sub: "按「简历 × JD」决定加载哪几段优化策略,不套模板",
          tags: ["素材池在这汇入:挖 / 补 / 练的成果"],
        },
        {
          title: "生成改动建议",
          sub: "每条标来源 + 置信度,置信度 < 0.7 只追问、不直接写",
        },
        {
          title: "溯源归一拦截",
          sub: "数字没出处 → 占位让你填;按 claim 四级标注(有据/推断/待确认/已拦截)",
        },
        {
          title: "Live Diff 6 维",
          sub: "改前改后逐维对比,每处改动可溯源",
        },
      ],
      result: {
        title: "一份能投的简历",
        sub: "每条改动可溯源 · 没出处的数字被拦下",
      },
    },
    handoff: { text: "JD gaps 暴露能力缺口 → STEP 05 缺什么补什么", targetStep: "05" },
    primaryCta: { label: "优化简历", href: "/m3" },
    secondaryCta: { label: "浏览 JD 案例", href: "/m3" },
  },
  {
    no: "05",
    act: "grow",
    title: "项目陪练",
    emoji: "💡",
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
    flow: {
      caption: "两步管道:gap 分析的地基先打牢,再谈补什么",
      stages: [
        {
          title: "深度 gap 分析",
          sub: "逐条引用简历原文,判已具备 / 部分 / 缺失,按对 offer 的影响排序",
          tags: ["真实市场 grounding:没 JD 就拉在招真岗当样本"],
        },
        {
          title: "基于缺口推荐",
          sub: "针对真实缺口出 2-4 周可 ship 的项目 brief + 每日 task",
        },
        {
          title: "Anti-fabrication 边界",
          sub: "完工前一律标 PROPOSED,不可写进简历",
        },
      ],
      result: {
        title: "把缺口变竞争力",
        sub: "钉在证据上的缺口 + 真能做完的项目",
      },
    },
    handoff: { text: "完工后 → STEP 04 写进简历", targetStep: "04" },
    loopNote: "完工的项目成果会进入经历素材池,回流到 STEP 04 简历优化",
    primaryCta: { label: "开始一段项目", href: "/m4" },
    secondaryCta: { label: "查看项目库", href: "/m4" },
  },
  {
    no: "06",
    act: "land",
    title: "模拟面试",
    emoji: "🎤",
    icon: "mic",
    slogan: "练一次,知道下一次改哪条",
    desc: "3 种面试官风格 × 3 类场景,4 维评分识别可回写简历的亮点,把答出来的价值反哺到简历;练好了就回到岗位匹配,把简历真的投出去。",
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
    flow: {
      caption: "一场面试的信息流:语音问答 → 动态追问 → 证据式复盘",
      stages: [
        {
          title: "实时语音面试",
          sub: "火山 TTS 念题 + ASR 转写,语音不可用自动降级文字",
          tags: ["3 类场景 × 3 种面试官风格"],
        },
        {
          title: "动态追问",
          sub: "像真考官顺着你的回答追,按题数配额 5→3 / 10→6 / 15→9",
        },
        {
          title: "证据式 4 维评分",
          sub: "逻辑 / 具体 / 清晰 / 口水话,每分挂「你哪句话」的证据 + 改进示范",
          tags: ["能力雷达独立加载,失败不影响主复盘"],
        },
      ],
      result: {
        title: "练完知道改哪条",
        sub: "亮点一键回流简历 · 形成闭环",
      },
    },
    handoff: {
      text: "↺ 亮点回写 STEP 04 简历,练好了回 STEP 02 投出去",
      targetStep: "02",
    },
    loopNote: "面试里答出的亮点一键采纳进素材池,回流到 STEP 04 简历优化",
    primaryCta: { label: "开始模拟面试", href: "/m5" },
    secondaryCta: { label: "查看复盘范例", href: "/m5" },
  },
];
