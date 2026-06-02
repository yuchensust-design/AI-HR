/**
 * 候选职业池 — v4 基于 O*NET 30.3 官方数据(923 职业 + RIASEC 6 维数值)
 *
 * 数据来源:O*NET 30.3 Database, U.S. Department of Labor / Employment and
 *           Training Administration (DOL/ETA). Licensed under CC BY 4.0.
 *           https://www.onetcenter.org/database.html
 *           https://creativecommons.org/licenses/by/4.0/
 *
 * 数据加工:
 *   1. 从 Career Interest Types.xlsx 提取 923 职业的 RIASEC 6 维数值(1.0-7.0)
 *   2. 从 Occupation Data.xlsx 加 title + description
 *   3. 从 Job Zones.xlsx 加 job zone(1-5,教育/经验要求)
 *   4. SOC code 前 2 位 → 22 个中文行业大类(我们做的映射)
 *   5. DeepSeek 翻译 923 职业标题为简洁中文
 *
 * 改动:O*NET 商标声明 + 翻译标注
 * O*NET® is a trademark of USDOL/ETA. We translated the occupation titles to
 * Simplified Chinese and grouped by SOC 22-major categories for our project.
 */

import type { Dimension, InterestWithStrength } from "./quiz-data";
import careersData from "./data/onet-careers.json";

export type CareerEntry = {
  /** O*NET-SOC code(eg "15-1211.00") */
  code: string;
  /** 英文标题(原 O*NET) */
  title_en: string;
  /** 中文标题(我们翻译) */
  title_cn: string;
  /** 英文描述(O*NET 简介,前 200 字) */
  desc_en: string;
  /** SOC 大类 code 前 2 位 */
  soc_major: string;
  /** SOC 大类中文名(我们映射) */
  industry_cn: string;
  /** RIASEC 6 维数值(O*NET 真实值,范围 1.0-7.0) */
  riasec: Record<Dimension, number>;
  /** Job Zone 1-5,教育/经验要求等级 */
  job_zone: number;
};

export const CAREER_POOL: CareerEntry[] = careersData as CareerEntry[];

/**
 * SOC 22 大类(英文 → 中文)
 * 用于结果页按行业分组展示
 */
export const SOC_MAJOR_LABELS: Record<string, string> = {
  "11": "管理岗位",
  "13": "商业与金融",
  "15": "计算机与数学",
  "17": "建筑与工程",
  "19": "生命/物理/社会科学",
  "21": "社区与社会服务",
  "23": "法律",
  "25": "教育与图书",
  "27": "艺术/设计/娱乐/体育/媒体",
  "29": "医疗专业",
  "31": "医疗支持",
  "33": "保护服务",
  "35": "餐饮服务",
  "37": "建筑保洁与维护",
  "39": "个人护理与服务",
  "41": "销售",
  "43": "办公与行政支持",
  "45": "农林渔",
  "47": "建造与开采",
  "49": "安装、维护与维修",
  "51": "生产制造",
  "53": "运输与物流",
  "55": "军事专业",
};

/**
 * 候选池打分 + 取 top N
 *
 * v4 公式(基于 O*NET 真实数值):
 *   score = Σ(career.riasec[d] × user_scores[d] / 15)
 *         + Σ(interest tag boost,cap ≤ 2)
 *
 * 数值范围:
 *   - career.riasec[d]:1.0-7.0(O*NET 真实评分)
 *   - user_scores[d] / 15:0-1(用户 18REST-2 归一化)
 *   - 单维 max ≈ 7,6 维总 max ≈ 25-30
 *
 * 兴趣 tag boost:目前无 mapping(O*NET 没有这个维度),保留 cap 2 的算术
 *                让 LLM Step 3 综合考虑兴趣
 *
 * 返回:按 score 排序的 top N(默认 30),供 LLM Step 3 综合
 */
export function generateCandidates(
  scores: [number, number, number, number, number, number],
  interests: InterestWithStrength[] | string[],
  topN = 30
): CareerEntry[] {
  const dimOrder: Dimension[] = ["R", "I", "A", "S", "E", "C"];

  // v3 兼容:string[] → 默认 strength 4
  const interestList: InterestWithStrength[] =
    interests.length === 0
      ? []
      : typeof interests[0] === "string"
      ? (interests as string[]).map((key) => ({ key, strength: 4 }))
      : (interests as InterestWithStrength[]);

  const ranked = CAREER_POOL.map((entry) => {
    let riasecScore = 0;

    // RIASEC 维度匹配 — O*NET 1-7 × 用户 / 15
    for (const dim of dimOrder) {
      const dimIdx = dimOrder.indexOf(dim);
      const careerVal = entry.riasec[dim] || 0;
      const userScore = scores[dimIdx] || 0;
      riasecScore += careerVal * (userScore / 15);
    }

    // 兴趣 tag boost — v4 暂无 O*NET mapping,留 cap 2 的算术给后续扩展
    // (现在所有职业 tag_signals 为空,tagScore 始终 0)
    let tagScore = 0;
    // 未来:可以基于 industry_cn / desc_en 关键词匹配 interest tag
    // 例:industry_cn 含"艺术" → boost music/photo/design 兴趣用户
    for (const { key, strength } of interestList) {
      // 启发式 industry 关键词 boost(轻微)
      const industryMatch =
        (key === "design" && entry.industry_cn.includes("艺术")) ||
        (key === "data_ai" && entry.industry_cn.includes("计算机")) ||
        (key === "business" && entry.industry_cn.includes("商业")) ||
        (key === "psychology" && entry.industry_cn.includes("社会服务")) ||
        (key === "volunteer" && entry.industry_cn.includes("社会服务")) ||
        (key === "content" && entry.industry_cn.includes("艺术")) ||
        (key === "music" && entry.industry_cn.includes("艺术")) ||
        (key === "photo" && entry.industry_cn.includes("艺术")) ||
        (key === "film" && entry.industry_cn.includes("艺术")) ||
        (key === "reading" && entry.industry_cn.includes("教育")) ||
        (key === "diy" && entry.industry_cn.includes("生产")) ||
        (key === "sports" && entry.industry_cn.includes("个人护理")) ||
        (key === "nature" && entry.industry_cn.includes("农林"));
      if (industryMatch) {
        tagScore += (strength / 5) * 1.5;
      }
    }
    tagScore = Math.min(tagScore, 2);

    return { entry, score: riasecScore + tagScore };
  })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map((x) => x.entry);

  return ranked;
}

/**
 * 按行业大类分组(用于 result 页层级展示)
 * 输入 top N 推荐(已排序)→ 按 industry_cn 分组,保留原顺序
 */
export function groupCareersByIndustry(
  careers: CareerEntry[]
): Array<{ industry: string; careers: CareerEntry[] }> {
  const groups: Record<string, CareerEntry[]> = {};
  for (const c of careers) {
    if (!groups[c.industry_cn]) groups[c.industry_cn] = [];
    groups[c.industry_cn].push(c);
  }
  return Object.entries(groups).map(([industry, careers]) => ({
    industry,
    careers,
  }));
}
