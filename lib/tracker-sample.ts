import { Application, Diagnosis } from "./tracker-types";

// ── helpers ──────────────────────────────────────────────────────────
function app(
  id: string,
  company: string,
  role: string,
  direction: Application["direction"],
  appliedAt: string,
  status: Application["status"],
  statusUpdatedAt: string,
  notes?: string,
  rounds?: Application["rounds"],
  finalFailReason?: Application["finalFailReason"],
): Application {
  return {
    id,
    company,
    role,
    industry: "",
    direction,
    appliedAt,
    resumeVersion: "",
    status,
    statusUpdatedAt,
    notes: notes ?? "",
    isSample: true,
    rounds,
    finalFailReason,
  };
}

// ── AI 产品 / 互联网 PM（21 条） ─────────────────────────────────────
const AI_PM: Application[] = [
  {
    ...app("s-pm-01", "某 AI 独角兽", "AI 产品经理(实习)", "ai_pm", "2026-04-10", "offer", "2026-05-28",
      "已拿到 offer！四轮全过，主考官认可 LLM 产品思路，薪资符合预期，考虑接受。"),
    rounds: [
      { id: "r-pm01-1", type: "written_test", outcome: "passed", date: "2026-04-18" },
      { id: "r-pm01-2", type: "first_round", outcome: "passed", date: "2026-04-28" },
      { id: "r-pm01-3", type: "second_round", outcome: "passed", date: "2026-05-12" },
      { id: "r-pm01-4", type: "hr_round", outcome: "passed", date: "2026-05-28" },
    ],
  },
  {
    ...app("s-pm-02", "某头部短视频平台", "内容产品经理(实习)", "ai_pm", "2026-04-12", "rejected", "2026-05-03",
      "一面被问 DAU 增长策略，数据感不够被淘汰。"),
    rounds: [{ id: "r-pm02-1", type: "first_round", outcome: "failed", failReason: "tech_depth", note: "产品增长数据感薄弱，DAU 拆解卡住", date: "2026-05-03" }],
    finalFailReason: "tech_depth",
  },
  app("s-pm-03", "某企业 SaaS 独角兽", "B2B 产品经理(实习)", "ai_pm", "2026-04-25", "written_test", "2026-05-08", "笔试产品设计题，等结果。"),
  app("s-pm-04", "某 AI 教育科技公司", "AI 学习产品经理(实习)", "ai_pm", "2026-05-10", "ghosted", "2026-06-01", "JD 要求 LLM 应用经验，简历项目偏前端，初筛可能未过。"),
  {
    ...app("s-pm-05", "某金融科技平台", "智能风控产品(实习)", "ai_pm", "2026-05-05", "interview", "2026-05-28",
      "二面聊 AI 风控落地，下周约终面。"),
    rounds: [
      { id: "r-pm05-1", type: "first_round", outcome: "passed", date: "2026-05-18" },
      { id: "r-pm05-2", type: "second_round", outcome: "pending", date: "2026-05-28" },
    ],
  },
  app("s-pm-06", "某本地生活平台", "搜索推荐产品经理(实习)", "ai_pm", "2026-05-20", "applied", "2026-05-20", "刚投，等待初筛。"),
  app("s-pm-07", "某出行平台", "智慧出行产品(实习)", "ai_pm", "2026-04-08", "ghosted", "2026-05-10", "投递后无回复，HR 未读。"),
  app("s-pm-08", "某电商平台", "C 端产品经理(实习)", "ai_pm", "2026-04-15", "ghosted", "2026-05-15", "JD 匹配度一般，无回复。"),
  {
    ...app("s-pm-09", "某大厂游戏部门", "游戏 PM(实习)", "ai_pm", "2026-04-18", "rejected", "2026-05-08", "笔试产品方案过了，一面被问游戏数据指标不熟。"),
    rounds: [
      { id: "r-pm09-1", type: "written_test", outcome: "passed", date: "2026-04-25" },
      { id: "r-pm09-2", type: "first_round", outcome: "failed", failReason: "tech_depth", note: "游戏留存率、ARPU 等指标不熟练", date: "2026-05-08" },
    ],
    finalFailReason: "tech_depth",
  },
  app("s-pm-10", "某健康险科技公司", "数字健康产品(实习)", "ai_pm", "2026-04-22", "ghosted", "2026-05-22"),
  app("s-pm-11", "某云计算大厂", "云产品经理(实习)", "ai_pm", "2026-05-01", "written_test", "2026-05-20", "笔试以竞品分析为主，等结果。"),
  {
    ...app("s-pm-12", "某 AI 写作工具公司", "内容 AI 产品(实习)", "ai_pm", "2026-05-03", "interview", "2026-05-25", "一面聊 LLM 产品落地，反馈正向。"),
    rounds: [{ id: "r-pm12-1", type: "first_round", outcome: "passed", date: "2026-05-25" }],
  },
  app("s-pm-13", "某即时零售平台", "供应链产品(实习)", "ai_pm", "2026-05-08", "ghosted", "2026-06-01"),
  app("s-pm-14", "某社交媒体平台", "社区产品经理(实习)", "ai_pm", "2026-05-12", "applied", "2026-05-12"),
  app("s-pm-15", "某 B2B 工具公司", "SaaS 产品经理(实习)", "ai_pm", "2026-05-15", "ghosted", "2026-06-05"),
  {
    ...app("s-pm-16", "某电商物流平台", "履约产品(实习)", "ai_pm", "2026-04-05", "rejected", "2026-04-25", "简历被初筛，但一面聊履约业务时明显没有相关经验。"),
    rounds: [{ id: "r-pm16-1", type: "first_round", outcome: "failed", failReason: "experience", note: "履约/供应链业务背景薄弱", date: "2026-04-25" }],
    finalFailReason: "experience",
  },
  app("s-pm-17", "某头部资讯 App", "信息流产品(实习)", "ai_pm", "2026-04-28", "ghosted", "2026-05-28"),
  app("s-pm-18", "某在线音乐平台", "音乐产品经理(实习)", "ai_pm", "2026-05-02", "applied", "2026-05-02"),
  app("s-pm-19", "某智能硬件公司", "IoT 产品经理(实习)", "ai_pm", "2026-05-06", "ghosted", "2026-06-01"),
  app("s-pm-20", "某大厂广告部门", "广告产品(实习)", "ai_pm", "2026-05-10", "ghosted", "2026-06-05"),
  app("s-pm-21", "某机器人创业公司", "机器人 AI 产品(实习)", "ai_pm", "2026-05-18", "applied", "2026-05-18", "初创公司 JD 很有意思，等回音。"),
];

// ── 数据分析 / 增长（22 条）──────────────────────────────────────────
const DATA: Application[] = [
  {
    ...app("s-da-01", "某头部电商平台", "用户增长数据分析(实习)", "data_analysis", "2026-04-14", "rejected", "2026-05-02",
      "笔试 SQL 过了，一面被追问 A/B test 卡住。"),
    rounds: [
      { id: "r-da01-1", type: "written_test", outcome: "passed", date: "2026-04-18" },
      { id: "r-da01-2", type: "first_round", outcome: "failed", failReason: "tech_depth", note: "A/B test 实验设计统计显著性被追问卡住", date: "2026-05-02" },
    ],
    finalFailReason: "tech_depth",
  },
  app("s-da-02", "某内容社区平台", "数据分析师(实习)", "data_analysis", "2026-04-20", "ghosted", "2026-05-25", "投完一直没反馈，推测初筛挂。"),
  app("s-da-03", "某 SaaS 创业公司", "增长策略分析(实习)", "data_analysis", "2026-04-22", "applied", "2026-04-22"),
  app("s-da-04", "某零售集团", "商品数据分析(实习)", "data_analysis", "2026-04-15", "ghosted", "2026-05-10"),
  app("s-da-05", "某新能源车企", "用户运营数据(实习)", "data_analysis", "2026-04-20", "ghosted", "2026-05-18"),
  {
    ...app("s-da-06", "某消费品牌集团", "市场数据分析(实习)", "data_analysis", "2026-04-28", "interview", "2026-05-25", "一面聊用户分层逻辑，二面待约。"),
    rounds: [
      { id: "r-da06-1", type: "first_round", outcome: "passed", date: "2026-05-15" },
      { id: "r-da06-2", type: "second_round", outcome: "pending", date: "2026-05-25" },
    ],
  },
  app("s-da-07", "某移动互联网公司", "商业分析(实习)", "data_analysis", "2026-05-25", "applied", "2026-05-25"),
  {
    ...app("s-da-08", "某招聘平台", "数据产品分析(实习)", "data_analysis", "2026-05-01", "rejected", "2026-05-12", "笔试 SQL 窗口函数挂。"),
    rounds: [{ id: "r-da08-1", type: "written_test", outcome: "failed", failReason: "tech_depth", note: "SQL Rank/Lead/Lag 不熟", date: "2026-05-12" }],
    finalFailReason: "tech_depth",
  },
  app("s-da-09", "某头部快递公司", "物流数据分析(实习)", "data_analysis", "2026-04-10", "ghosted", "2026-05-10"),
  app("s-da-10", "某保险科技公司", "精算数据(实习)", "data_analysis", "2026-04-16", "ghosted", "2026-05-16"),
  {
    ...app("s-da-11", "某视频平台", "内容数据分析(实习)", "data_analysis", "2026-04-20", "written_test", "2026-05-05", "笔试以 Python 数据清洗为主，等结果。"),
    rounds: [{ id: "r-da11-1", type: "written_test", outcome: "pending", date: "2026-05-05" }],
  },
  app("s-da-12", "某互联网金融公司", "风控数据(实习)", "data_analysis", "2026-04-24", "ghosted", "2026-05-24"),
  {
    ...app("s-da-13", "某大厂广告业务", "广告效果分析(实习)", "data_analysis", "2026-04-28", "rejected", "2026-05-18", "一面通过，二面被问归因模型卡住。"),
    rounds: [
      { id: "r-da13-1", type: "first_round", outcome: "passed", date: "2026-05-06" },
      { id: "r-da13-2", type: "second_round", outcome: "failed", failReason: "tech_depth", note: "多触点归因模型（Shapley/Markov）不熟", date: "2026-05-18" },
    ],
    finalFailReason: "tech_depth",
  },
  app("s-da-14", "某创业电商平台", "运营数据(实习)", "data_analysis", "2026-05-02", "ghosted", "2026-06-02"),
  app("s-da-15", "某医疗健康平台", "健康数据分析(实习)", "data_analysis", "2026-05-05", "applied", "2026-05-05"),
  {
    ...app("s-da-16", "某银行数字化部门", "数字化运营分析(实习)", "data_analysis", "2026-05-08", "interview", "2026-05-30", "结构化面试，面试官评价逻辑清晰，等 HR 面。"),
    rounds: [
      { id: "r-da16-1", type: "written_test", outcome: "passed", date: "2026-05-18" },
      { id: "r-da16-2", type: "first_round", outcome: "passed", date: "2026-05-30" },
    ],
  },
  app("s-da-17", "某出行平台", "出行数据分析(实习)", "data_analysis", "2026-05-10", "ghosted", "2026-06-05"),
  app("s-da-18", "某基金公司", "量化数据(实习)", "data_analysis", "2026-05-12", "ghosted", "2026-06-05", "JD 要求 R/Python 量化经验，门槛偏高。"),
  app("s-da-19", "某连锁餐饮集团", "门店运营分析(实习)", "data_analysis", "2026-05-15", "applied", "2026-05-15"),
  app("s-da-20", "某科技创业公司", "用户行为分析(实习)", "data_analysis", "2026-05-18", "ghosted", "2026-06-05"),
  {
    ...app("s-da-21", "某外资咨询公司", "数据分析师(实习)", "data_analysis", "2026-04-05", "rejected", "2026-04-30", "笔试 case 过了，英文一面表达欠流畅被淘汰。"),
    rounds: [
      { id: "r-da21-1", type: "written_test", outcome: "passed", date: "2026-04-15" },
      { id: "r-da21-2", type: "first_round", outcome: "failed", failReason: "expression", note: "英文面试表达不够流畅，逻辑对但语言卡", date: "2026-04-30" },
    ],
    finalFailReason: "expression",
  },
  app("s-da-22", "某大宗商品平台", "供应链数据(实习)", "data_analysis", "2026-05-22", "applied", "2026-05-22"),
];

// ── 心理咨询 / EAP（10 条）──────────────────────────────────────────
const PSYCH: Application[] = [
  {
    ...app("s-py-01", "某 EAP 心理健康平台", "心理咨询师助理", "psych_counseling", "2026-05-02", "interview", "2026-05-28",
      "二面关注共情表达和访谈记录，反馈正向，等终面。"),
    rounds: [
      { id: "r-py01-1", type: "first_round", outcome: "passed", date: "2026-05-15" },
      { id: "r-py01-2", type: "second_round", outcome: "pending", date: "2026-05-28" },
    ],
  },
  {
    ...app("s-py-02", "某青少年心理教育机构", "心理评估实习生", "psych_counseling", "2026-05-08", "written_test", "2026-05-26", "笔试以案例为主，涉及 SCL-90 解读。"),
    rounds: [{ id: "r-py02-1", type: "written_test", outcome: "pending", date: "2026-05-26" }],
  },
  {
    ...app("s-py-03", "某综合医院心理科", "临床心理实习生", "psych_counseling", "2026-04-15", "offer", "2026-05-20",
      "已收到 offer，薪资略低考虑中。导师推荐信加分明显。"),
    rounds: [
      { id: "r-py03-1", type: "first_round", outcome: "passed", date: "2026-04-28" },
      { id: "r-py03-2", type: "second_round", outcome: "passed", date: "2026-05-12" },
      { id: "r-py03-3", type: "hr_round", outcome: "passed", date: "2026-05-20" },
    ],
  },
  {
    ...app("s-py-04", "某职场心理健康 App", "UX 心理研究实习生", "psych_counseling", "2026-05-01", "interview", "2026-05-22",
      "一面聊用户访谈设计，正向反馈，二面待约。"),
    rounds: [{ id: "r-py04-1", type: "first_round", outcome: "passed", date: "2026-05-22" }],
  },
  app("s-py-05", "某企业 EAP 服务商", "员工关怀项目助理", "psych_counseling", "2026-04-20", "ghosted", "2026-05-20"),
  {
    ...app("s-py-06", "某大型高校心理中心", "心理咨询志愿辅导员", "psych_counseling", "2026-04-25", "interview", "2026-05-20", "面试聊危机干预案例，顺利进入下轮。"),
    rounds: [{ id: "r-py06-1", type: "first_round", outcome: "passed", date: "2026-05-20" }],
  },
  {
    ...app("s-py-07", "某精神专科医院", "临床心理评估(实习)", "psych_counseling", "2026-05-03", "written_test", "2026-05-20", "笔试考 MMPI-2 解读和 CBT 基础理论。"),
    rounds: [{ id: "r-py07-1", type: "written_test", outcome: "passed", date: "2026-05-20" }],
  },
  app("s-py-08", "某互联网健康平台", "在线咨询运营(实习)", "psych_counseling", "2026-05-10", "applied", "2026-05-10"),
  {
    ...app("s-py-09", "某跨国 EAP 机构", "中文咨询顾问(实习)", "psych_counseling", "2026-04-12", "rejected", "2026-05-02",
      "英文笔试过了，但面试中文 case 表达时结构感不够。"),
    rounds: [
      { id: "r-py09-1", type: "written_test", outcome: "passed", date: "2026-04-20" },
      { id: "r-py09-2", type: "first_round", outcome: "failed", failReason: "expression", note: "案例分析表达结构感欠缺，情绪反映技术生硬", date: "2026-05-02" },
    ],
    finalFailReason: "expression",
  },
  app("s-py-10", "某儿童发展中心", "儿童心理评估(实习)", "psych_counseling", "2026-05-15", "applied", "2026-05-15"),
];

// ── 用户研究 / UX 研究（10 条）──────────────────────────────────────
const UX: Application[] = [
  app("s-ux-01", "某消费品品牌", "用户研究助理(实习)", "user_research", "2026-05-15", "applied", "2026-05-15"),
  {
    ...app("s-ux-02", "某互联网大厂用研团队", "用户研究实习生", "user_research", "2026-04-20", "rejected", "2026-05-05",
      "被问可用性测试方案设计，量化研究经验薄弱被淘汰。"),
    rounds: [{ id: "r-ux02-1", type: "first_round", outcome: "failed", failReason: "tech_depth", note: "可用性测试量化方案设计缺经验", date: "2026-05-05" }],
    finalFailReason: "tech_depth",
  },
  app("s-ux-03", "某游戏公司", "玩家体验研究(实习)", "user_research", "2026-05-01", "ghosted", "2026-05-28"),
  {
    ...app("s-ux-04", "某手机厂商 UX 团队", "UX 研究实习生", "user_research", "2026-04-10", "offer", "2026-05-25",
      "三轮全过，已收到 offer，研究课题方向和预期一致，薪资中等偏上。"),
    rounds: [
      { id: "r-ux04-1", type: "first_round", outcome: "passed", date: "2026-04-28" },
      { id: "r-ux04-2", type: "second_round", outcome: "passed", date: "2026-05-10" },
      { id: "r-ux04-3", type: "hr_round", outcome: "passed", date: "2026-05-25" },
    ],
  },
  app("s-ux-05", "某汽车品牌 UX 部门", "车机交互研究(实习)", "user_research", "2026-04-18", "ghosted", "2026-05-18"),
  {
    ...app("s-ux-06", "某电商平台用研中心", "定量研究(实习)", "user_research", "2026-04-25", "written_test", "2026-05-10", "笔试以问卷设计和数据解读为主。"),
    rounds: [{ id: "r-ux06-1", type: "written_test", outcome: "pending", date: "2026-05-10" }],
  },
  app("s-ux-07", "某金融 App", "用户体验研究(实习)", "user_research", "2026-05-05", "ghosted", "2026-06-01"),
  app("s-ux-08", "某在线教育平台", "学习体验研究(实习)", "user_research", "2026-05-08", "applied", "2026-05-08"),
  {
    ...app("s-ux-09", "某社交 App", "用户行为研究(实习)", "user_research", "2026-04-15", "rejected", "2026-05-08",
      "笔试通过，面试被问定性转定量研究方法不熟。"),
    rounds: [
      { id: "r-ux09-1", type: "written_test", outcome: "passed", date: "2026-04-22" },
      { id: "r-ux09-2", type: "first_round", outcome: "failed", failReason: "tech_depth", note: "定性转定量研究方法（卡方检验、因子分析）不熟", date: "2026-05-08" },
    ],
    finalFailReason: "tech_depth",
  },
  app("s-ux-10", "某咨询公司用研部门", "UX 策略研究(实习)", "user_research", "2026-05-12", "applied", "2026-05-12"),
];

export const SAMPLE_APPLICATIONS: Application[] = [
  ...AI_PM,
  ...DATA,
  ...PSYCH,
  ...UX,
];

export const SAMPLE_DIAGNOSIS: Diagnosis = {
  likelyBottleneck: "direction_mismatch",
  confidence: 0.78,
  source: "ai",
  containsSample: true,
  summary:
    "整体拿到 3 个 offer（4.8%），但方向差距悬殊。最大瓶颈不是简历质量，而是数据分析方向的 SQL 和实验设计短板——22 投 0 offer，6 次技术轮全军覆没。当前优先跟进在途 offer 谈判，数据分析方向暂停投递、先补短板。",
  evidence: [
    "心理咨询 / EAP：10 投 8 回（80%）→ 5 面试 → 1 offer（10%）",
    "用户研究：10 投 4 回（40%）→ 2 面试 → 1 offer（10%）",
    "AI PM：21 投 7 回（33%）→ 1 offer（4.8%），另有 3 条在途",
    "数据分析：22 投 6 回（27%）→ 0 offer；4 次技术轮均挂在 SQL 窗口函数 / A/B test",
    "最大差距：心理咨询 vs 数据分析回复率相差 53pp，根因是简历与 JD 关键词匹配度，而非简历整体质量",
  ],
  recommendedActions: [
    {
      title: "先把 3 个 offer 谈清楚再做选择",
      detail:
        "AI PM（某AI独角兽）、心理咨询（某综合医院）、用户研究（某手机厂商）各有一个 offer 在手。建议并行推进谈判，对比薪资/成长空间/方向匹配度后再做取舍，不要在 offer 比较阶段仍然分心大量新投递。",
      link: null,
      basedOn: "metrics",
    },
    {
      title: "数据分析方向：先补 SQL + A/B test，再重启投递",
      detail:
        "4 次技术轮失败原因集中在同两个短板。建议：① 刷 10 道 LeetCode SQL Hard（重点：Rank、Row_Number、Lead/Lag、滑动窗口）；② 读完《数据驱动》第 5 章实验设计，手推一次显著性检验。补完再投，避免把好机会浪费在还没准备好的状态。",
      link: "m3",
      basedOn: "metrics",
    },
    {
      title: "AI PM 方向：继续跟进在途面试，同时打磨数据感叙事",
      detail:
        "AI PM 方向还有 3 条面试进行中，跟进这批的同时用 M1 梳理你项目里最有数据支撑的 2-3 个决策故事，打磨成 STAR 格式主动带入面试，不要等面试官追问才开始组织语言。",
      link: "m1",
      basedOn: "metrics",
    },
  ],
  caution:
    "以上分析基于 63 条示例投递记录，结论仅反映示例数据规律，不代表你的真实情况。录入你自己的投递数据后重新运行诊断，结论会基于你的真实转化数据给出。",
};
