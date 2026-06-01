/**
 * 候选职业池 — 模块 1 推荐 Step 2(规则层候选筛选)
 *
 * 设计:
 *   - 涵盖 8 大行业方向(多元,不局限互联网+AI)
 *   - 每条 entry: industry + role_type + RIASEC 维度权重 + 兴趣 tag 信号
 *   - generateCandidates(scores, tags) 按用户测评 + 兴趣给每条打分,返回 top 30
 *
 * 重要约束(plan §B lock):
 *   - 永远不含公司名(只到"行业 + 职位类型")
 *   - 候选池只进 LLM prompt context,绝不出现在 UI
 */

import type { Dimension } from "./quiz-data";

export type CareerEntry = {
  industry: string;
  role_type: string;
  riasec_weights: Partial<Record<Dimension, number>>;
  tag_signals: Partial<Record<string, number>>;
};

export const CAREER_POOL: CareerEntry[] = [
  // === 互联网 / 科技 ===
  {
    industry: "互联网",
    role_type: "产品经理(用户向)",
    riasec_weights: { E: 3, I: 2, A: 1, S: 1 },
    tag_signals: { data_ai: 2, content: 1, design: 1 },
  },
  {
    industry: "互联网",
    role_type: "用户研究员",
    riasec_weights: { I: 3, S: 2, A: 1 },
    tag_signals: { content: 1, data_ai: 1 },
  },
  {
    industry: "互联网",
    role_type: "内容运营",
    riasec_weights: { A: 3, S: 2, E: 1 },
    tag_signals: { content: 3, music: 1, photo: 1, food: 1, gaming: 1 },
  },
  {
    industry: "互联网",
    role_type: "数据分析师",
    riasec_weights: { I: 3, C: 2, R: 1 },
    tag_signals: { data_ai: 3 },
  },
  {
    industry: "互联网",
    role_type: "UI / 交互设计师",
    riasec_weights: { A: 3, I: 1, R: 1 },
    tag_signals: { design: 3, photo: 1 },
  },
  {
    industry: "互联网",
    role_type: "推荐 / 算法工程师",
    riasec_weights: { I: 3, R: 2, C: 1 },
    tag_signals: { data_ai: 3 },
  },
  {
    industry: "互联网",
    role_type: "用户增长 / 投放",
    riasec_weights: { E: 3, I: 2, A: 1 },
    tag_signals: { data_ai: 2, content: 1 },
  },
  {
    industry: "互联网",
    role_type: "前后端开发工程师",
    riasec_weights: { I: 2, R: 3, C: 1 },
    tag_signals: { data_ai: 1 },
  },

  // === 金融 ===
  {
    industry: "金融",
    role_type: "量化研究员",
    riasec_weights: { I: 3, C: 2, R: 1 },
    tag_signals: { data_ai: 3 },
  },
  {
    industry: "金融",
    role_type: "投行 / 行业分析师",
    riasec_weights: { E: 3, C: 2, I: 1 },
    tag_signals: { data_ai: 1 },
  },
  {
    industry: "金融",
    role_type: "商业银行客户经理",
    riasec_weights: { E: 3, S: 2, C: 1 },
    tag_signals: {},
  },
  {
    industry: "金融",
    role_type: "风险控制 / 风控",
    riasec_weights: { C: 3, I: 2 },
    tag_signals: { data_ai: 1 },
  },
  {
    industry: "金融",
    role_type: "财富管理顾问",
    riasec_weights: { E: 2, S: 3, C: 1 },
    tag_signals: {},
  },

  // === 制造 / 工业 ===
  {
    industry: "制造业",
    role_type: "工业设计师",
    riasec_weights: { A: 3, R: 2, I: 1 },
    tag_signals: { design: 3 },
  },
  {
    industry: "制造业",
    role_type: "质量管理 / 品控",
    riasec_weights: { C: 3, R: 2, I: 1 },
    tag_signals: {},
  },
  {
    industry: "制造业",
    role_type: "供应链 / 物流管理",
    riasec_weights: { E: 2, C: 3, I: 1 },
    tag_signals: {},
  },
  {
    industry: "制造业",
    role_type: "工艺 / 生产工程师",
    riasec_weights: { R: 3, I: 2, C: 1 },
    tag_signals: {},
  },

  // === 文创 / 媒体 ===
  {
    industry: "文创媒体",
    role_type: "平面设计 / 插画",
    riasec_weights: { A: 3, I: 1 },
    tag_signals: { design: 3, photo: 1 },
  },
  {
    industry: "文创媒体",
    role_type: "影视后期 / 剪辑",
    riasec_weights: { A: 3, R: 1, I: 1 },
    tag_signals: { content: 2, photo: 2 },
  },
  {
    industry: "文创媒体",
    role_type: "内容编辑 / 文案",
    riasec_weights: { A: 3, S: 1, I: 1 },
    tag_signals: { content: 3 },
  },
  {
    industry: "文创媒体",
    role_type: "摄影师 / 影像创作",
    riasec_weights: { A: 3, R: 1 },
    tag_signals: { photo: 3, content: 1 },
  },
  {
    industry: "文创媒体",
    role_type: "视频博主 / 内容创作者",
    riasec_weights: { A: 3, E: 2, S: 1 },
    tag_signals: { content: 3, music: 1, food: 1, gaming: 1 },
  },
  {
    industry: "文创媒体",
    role_type: "游戏策划 / 关卡设计",
    riasec_weights: { A: 3, E: 1, I: 1 },
    tag_signals: { gaming: 3, content: 1 },
  },
  {
    industry: "文创媒体",
    role_type: "音乐 / 音频制作",
    riasec_weights: { A: 3, R: 1, I: 1 },
    tag_signals: { music: 3 },
  },

  // === 教育 ===
  {
    industry: "教育",
    role_type: "K12 / 学科教师",
    riasec_weights: { S: 3, A: 1, I: 1 },
    tag_signals: {},
  },
  {
    industry: "教育",
    role_type: "课程研发 / 教研",
    riasec_weights: { I: 3, A: 2, S: 1 },
    tag_signals: { content: 1 },
  },
  {
    industry: "教育",
    role_type: "心理咨询师",
    riasec_weights: { S: 3, I: 2 },
    tag_signals: {},
  },
  {
    industry: "教育",
    role_type: "留学 / 升学顾问",
    riasec_weights: { S: 3, E: 1, A: 1 },
    tag_signals: {},
  },

  // === 公共 / 社会服务 ===
  {
    industry: "公共服务",
    role_type: "公务员 / 事业单位",
    riasec_weights: { S: 2, C: 3 },
    tag_signals: {},
  },
  {
    industry: "公共服务",
    role_type: "NGO / 公益项目",
    riasec_weights: { S: 3, E: 1, A: 1 },
    tag_signals: { content: 1 },
  },
  {
    industry: "公共服务",
    role_type: "城市 / 公共政策研究",
    riasec_weights: { I: 2, C: 2, S: 1 },
    tag_signals: { data_ai: 1 },
  },
  {
    industry: "公共服务",
    role_type: "法律顾问 / 律师",
    riasec_weights: { C: 2, I: 3, E: 1 },
    tag_signals: {},
  },

  // === 学术 / 研究 ===
  {
    industry: "学术研究",
    role_type: "基础学科研究(博士路径)",
    riasec_weights: { I: 3, C: 1 },
    tag_signals: { data_ai: 1 },
  },
  {
    industry: "学术研究",
    role_type: "应用研究 / 实验室科研",
    riasec_weights: { I: 3, R: 2, C: 1 },
    tag_signals: { data_ai: 1 },
  },
  {
    industry: "学术研究",
    role_type: "实验室技术员 / 仪器操作",
    riasec_weights: { R: 3, I: 1, C: 1 },
    tag_signals: {},
  },

  // === 创业 / 自由职业 ===
  {
    industry: "创业 / 自由职业",
    role_type: "独立内容创作者(自媒体)",
    riasec_weights: { A: 3, E: 2 },
    tag_signals: { content: 3, music: 2, photo: 2, design: 2, food: 2, gaming: 2 },
  },
  {
    industry: "创业 / 自由职业",
    role_type: "0-1 产品创始人 / 联创",
    riasec_weights: { E: 3, I: 2, A: 1 },
    tag_signals: { data_ai: 1, design: 1 },
  },
  {
    industry: "创业 / 自由职业",
    role_type: "自由设计师 / 插画师",
    riasec_weights: { A: 3, R: 1 },
    tag_signals: { design: 3 },
  },
  {
    industry: "创业 / 自由职业",
    role_type: "自由咨询顾问",
    riasec_weights: { E: 3, I: 2, S: 1 },
    tag_signals: {},
  },

  // === 销售 / 商业(让"消耗"反向推荐有候选) ===
  {
    industry: "销售商务",
    role_type: "电话销售 / 地推",
    riasec_weights: { E: 2, S: 1 },
    tag_signals: {},
  },
  {
    industry: "传统行政",
    role_type: "档案管理 / 资料录入",
    riasec_weights: { C: 3 },
    tag_signals: {},
  },
  {
    industry: "传统行政",
    role_type: "纯内勤支持岗",
    riasec_weights: { C: 2, S: 1 },
    tag_signals: {},
  },
];

/**
 * 候选池打分 + 取 top N
 *
 * score = Σ(riasec_weights[d] × scores[d] / 10) + Σ(tag_signals[t] × 0.5)
 *
 * 返回:按 score 排序的 top N(默认 30),供 LLM Step 3 综合
 */
export function generateCandidates(
  scores: [number, number, number, number, number, number],
  selectedTagKeys: string[],
  topN = 30
): CareerEntry[] {
  const dimOrder: Dimension[] = ["R", "I", "A", "S", "E", "C"];

  const ranked = CAREER_POOL.map((entry) => {
    let score = 0;

    // RIASEC 维度匹配分
    for (const [dim, weight] of Object.entries(entry.riasec_weights)) {
      const dimIdx = dimOrder.indexOf(dim as Dimension);
      if (dimIdx >= 0) {
        score += (weight || 0) * (scores[dimIdx] / 10);
      }
    }

    // 兴趣 tag boost
    for (const tag of selectedTagKeys) {
      score += (entry.tag_signals[tag] || 0) * 0.5;
    }

    return { entry, score };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.entry);

  return ranked;
}
