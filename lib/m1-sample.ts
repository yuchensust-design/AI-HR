import type { Confidence } from "@/lib/quiz-data";

export type SamplePositive = {
  industry: string;
  role_type: string;
  why_fit: string;
  match: string;
  match_percentage?: number;
};

export type SampleNegative = {
  industry: string;
  role_type: string;
  why_consuming: string;
};

export type SampleRationale = {
  interestEvidence: string;
  experienceEvidence: string | null;
  preferenceSignals: string;
  confidence: Confidence;
  confidenceWhy: string;
  cautions: string[];
  nextStep: string;
  whyNotOther: string;
};

export type SampleMeta = {
  background: string;
  emoji: string;
  tags: string[];
  experiences: string[];
};

export type M1SampleResult = {
  isSample: true;
  sampleMeta: SampleMeta;
  scores: [number, number, number, number, number, number];
  code: string;
  confidence: Confidence;
  positive: SamplePositive[];
  negative: SampleNegative[];
  refine_chips: string[];
  disclaimer: string;
  completedAt: string;
  refineCount: number;
  rationale: SampleRationale;
};

export const M1_SAMPLE: M1SampleResult = {
  isSample: true,
  sampleMeta: {
    background: "CS 大四 · 1 段字节实习 · 做过 AI 学习助手项目",
    emoji: "💻",
    tags: ["数据 & AI", "内容创作"],
    experiences: [
      "字节用户增长实习",
      "AI 学习助手(B 端用户 30+)",
      "Python 数据分析",
    ],
  },
  scores: [5, 13, 8, 10, 14, 6],
  code: "E14 I13 S10 A8 C6 R5",
  confidence: "high",
  positive: [
    {
      industry: "互联网",
      role_type: "AI / 增长产品经理",
      why_fit:
        "E 14 + I 13 → 你既爱推动事情发生,又重逻辑分析,跟 PM 高度契合",
      match: "高",
      match_percentage: 92,
    },
    {
      industry: "创业 / 自由职业",
      role_type: "0-1 产品创始人 / 联创",
      why_fit:
        "E 14(企业型最高)+ 已经做过 AI 学习助手 → 你不只是想'打工',更想'主导一件事'",
      match: "高",
      match_percentage: 89,
    },
    {
      industry: "互联网",
      role_type: "数据分析师 / 增长分析",
      why_fit: "I 13 + C 6 → 你重数据推理,愿意系统化拆解,适合用数字说话的角色",
      match: "高",
      match_percentage: 86,
    },
    {
      industry: "互联网",
      role_type: "用户研究员",
      why_fit: "I 13 + S 10 → 你愿意挖背后原理,又能跟人聊,适合做用户洞察",
      match: "中",
      match_percentage: 78,
    },
    {
      industry: "互联网",
      role_type: "内容运营",
      why_fit:
        "选了内容创作兴趣 + S 10 → 你能持续表达 + 跟用户互动,适合做内容驱动的运营",
      match: "中",
      match_percentage: 71,
    },
  ],
  negative: [
    {
      industry: "传统行政",
      role_type: "档案管理 / 资料录入",
      why_consuming:
        "这类岗位 80% 时间在重复处理标准化流程,你的 E + I 表达欲会被压抑",
    },
    {
      industry: "销售商务",
      role_type: "电话销售 / 地推",
      why_consuming:
        "你的 I 13 偏好深度思考,纯转化型销售对'快节奏 + 浅交互'的要求会让你疲倦",
    },
    {
      industry: "制造业",
      role_type: "质量管理 / 品控",
      why_consuming:
        "C 6 + R 5 都不算高,这类岗位长期靠流程 + 标准化,你的创造性会找不到出口",
    },
  ],
  refine_chips: ["去掉销售类岗位", "想要更稳定的方向", "加技术深度", "偏内容创作"],
  disclaimer:
    "本次推荐基于测评 + 兴趣 — 没看你的真实经历。投递前请先用『简历整理』模块结合 JD 确认能力对齐。",
  completedAt: new Date(0).toISOString(),
  refineCount: 0,
  rationale: {
    interestEvidence:
      "你选了「数据 & AI」「内容创作」两个 tag(强度都偏高),跟推荐的 AI PM / 数据分析 / 内容运营都有直接连线。",
    experienceEvidence:
      "字节用户增长实习 + AI 学习助手 30+ 用户 → 已经在做 0→1 + 数据推动,这类经历跟 AI PM / 增长方向最匹配。",
    preferenceSignals:
      "E 14(企业型最高)说明你更愿意主导、推动,而不是被动执行;I 13(研究型高)说明你愿意深挖原理。",
    confidence: "high",
    confidenceWhy:
      "答了 18 道题,Top1 = E 14 / Top2 = I 13 都属于「高」区间,6 维分布有明显倾向,推荐稳定。",
    cautions: [
      "match% 是相对契合度,不是「一定能上岸」",
      "投递前请用『简历整理』结合具体 JD 再核对",
    ],
    nextStep: "可以先去『简历整理』,把字节实习 + AI 项目针对 AI PM 重点 JD 调一版。",
    whyNotOther:
      "档案/电销/品控这类没推,是因为你的 R(实用)5 + C(常规)6 都偏低,长期机械流程容易让你的 E + I 找不到出口。",
  },
};
