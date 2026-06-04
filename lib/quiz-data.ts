/**
 * 模块 1 测评 — 基于霍兰德 RIASEC 职业兴趣理论(18 题 RIASEC + 1 题兴趣 tag)
 *
 * 主理论:Holland, J. L. (1997). Making vocational choices: A theory of vocational
 *         personalities and work environments (3rd ed.). PAR.
 *
 * 题库参考:Martins et al. (2024) 心理测量学修订项(18REST-2),
 *           DOI: 10.1177/10690727241256289 — 用作 18 题简化测评的题面基础。
 *
 * 计分方式:
 *   - 5 点 Likert: 1 = 非常不喜欢 → 5 = 非常喜欢
 *   - 每维 3 题,简单加和(raw score),范围 3-15 分
 *   - 无反向计分题
 *
 * 高低分阈值(基于 Likert 中点 + 实战经验设定):
 *   - 高: ≥ 12 分(平均每题 ≥ 4 分 = 喜欢)
 *   - 中: 9-11 分(平均每题 3-4 分 = 中立到喜欢)
 *   - 低: ≤ 8 分(平均每题 ≤ 2.67 分 = 不喜欢)
 *
 * 适用人群:大学生。
 *
 * License 说明:题库参考的 18REST-2 由 SAGE 出版(2024),非 CC-BY。
 * 本项目作为比赛教育用途使用,并在 result 页底部小字引用文献。
 * 商用前需联系原作者(gustavoh.martins95@gmail.com)获明确授权。
 */

export type Dimension = "R" | "I" | "A" | "S" | "E" | "C";

export const DIMENSION_LABELS: Record<Dimension, { en: string; cn: string }> = {
  R: { en: "Realistic", cn: "实用型" },
  I: { en: "Investigative", cn: "研究型" },
  A: { en: "Artistic", cn: "艺术型" },
  S: { en: "Social", cn: "社交型" },
  E: { en: "Enterprising", cn: "企业型" },
  C: { en: "Conventional", cn: "常规型" },
};

/**
 * 6 维详细描述(基于 Holland 1997 经典理论 + 18REST-2 论文修订项验证)
 * 用于 result 页"自我探索"段展开 — 论文没给描述模板,我们自己写。
 */
export const DIMENSION_DESCRIPTIONS: Record<
  Dimension,
  { tagline: string; strengths: string[]; suited: string; caution: string }
> = {
  R: {
    tagline: "动手做事 · 偏好实物和具体操作",
    strengths: [
      "对机械、工具、电气、户外活动有天然兴趣",
      "擅长把抽象问题转化为可操作的具体步骤",
      "通过亲手做、看到实物变化获得成就感",
    ],
    suited: "工程、制造、机械、电子、户外作业、运动训练等强调实操的方向",
    caution: "可能不喜欢长时间纯文书 / 纯社交沟通的工作",
  },
  I: {
    tagline: "钻研思考 · 偏好原理和系统性分析",
    strengths: [
      "享受研究现象背后的原理,愿意挖深",
      "对科学论文、数据、复杂逻辑保持耐心",
      "通过解开复杂问题获得满足感",
    ],
    suited: "科研、数据分析、算法、医学研究、技术深度方向",
    caution: "可能不擅长(或不喜欢)纯推销、纯执行型的工作",
  },
  A: {
    tagline: "表达创造 · 偏好审美和自由发挥",
    strengths: [
      "对创意、美学、艺术形式敏感",
      "通过写作 / 设计 / 表演表达想法",
      "在自由度高的环境中产出最好",
    ],
    suited: "设计、内容创作、影视、文学、音乐、自媒体方向",
    caution: "可能讨厌死板流程 / 标准化重复 / 无创意空间的岗位",
  },
  S: {
    tagline: "助人共情 · 偏好人际互动和教导",
    strengths: [
      "对他人的情绪和需求敏感",
      "享受帮人解决问题、教别人成长",
      "在团队合作和共情沟通中感到满足",
    ],
    suited: "教育、心理咨询、社会工作、医护、人力资源、用户研究方向",
    caution: "可能不喜欢长期独处工作 / 高度竞争对立的环境",
  },
  E: {
    tagline: "影响推动 · 偏好说服和带头",
    strengths: [
      "享受说服别人、推动事情发生",
      "在销售、谈判、市场推广中能拿出成果",
      "敢于面对压力、主动争取资源",
    ],
    suited: "销售、市场、商务拓展、产品运营、创业、咨询方向",
    caution: "可能不喜欢纯执行 / 纯研究 / 长期看不到结果的工作",
  },
  C: {
    tagline: "结构整理 · 偏好规则和数据精确",
    strengths: [
      "对数据、文档、流程的整齐和准确性敏感",
      "擅长按规则把事情做对、做完整",
      "在结构化任务里感到稳定和高效",
    ],
    suited: "财务、行政、会计、数据录入、运营支持、合规方向",
    caution: "可能不喜欢高度模糊 / 频繁变化 / 需要原创发挥的工作",
  },
};

export type Confidence = "high" | "mid" | "low" | "none";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "匹配信号:高",
  mid: "匹配信号:中",
  low: "匹配信号:低 · 可再答几道",
  none: "答得太少,推荐不可靠",
};

/**
 * RIASEC 题
 *   - 每题 1 个 statement + 5 点 Likert(1-5)
 *   - dim 字段表示该题属于哪个 RIASEC 维度
 *   - 题目编号 + 维度对齐 18REST-2 论文 Table 2
 */
export type RIASECQuestion = {
  no: number;
  text: string;
  dim: Dimension;
  englishOriginal: string; // 论文原文,溯源
};

export const RIASEC_QUESTIONS: RIASECQuestion[] = [
  {
    no: 1,
    dim: "R",
    text: "操作机器加工零件",
    englishOriginal: "Operate machines for producing machine parts",
  },
  {
    no: 2,
    dim: "I",
    text: "做实验和数据分析",
    englishOriginal: "Perform analyses and lab experiments",
  },
  {
    no: 3,
    dim: "A",
    text: "在合唱团或乐队里参与演出",
    englishOriginal: "Sing in a choir",
  },
  {
    no: 4,
    dim: "S",
    text: "主动倾听并帮助身边需要的人",
    englishOriginal: "Be available to help people",
  },
  {
    no: 5,
    dim: "E",
    text: "与客户进行商务谈判",
    englishOriginal: "Negotiate with customers",
  },
  {
    no: 6,
    dim: "C",
    text: "归档整理重要文件、资料",
    englishOriginal: "Archive important documents and files",
  },
  {
    no: 7,
    dim: "R",
    text: "维护和保养机器、工具",
    englishOriginal: "Perform maintenance on machines and tools",
  },
  {
    no: 8,
    dim: "I",
    text: "解释自然现象背后的物理原理",
    englishOriginal: "Explain natural physical phenomena",
  },
  {
    no: 9,
    dim: "A",
    text: "在台上向观众表演(音乐 / 舞蹈 / 戏剧)",
    englishOriginal: "Perform an artistic presentation to an audience",
  },
  {
    no: 10,
    dim: "S",
    text: "给个人或群体提供健康、心理方面的指导",
    englishOriginal:
      "Provide guidance to individuals, groups or population about health and well-being",
  },
  {
    no: 11,
    dim: "E",
    text: "推广产品和服务",
    englishOriginal: "Market products and services",
  },
  {
    no: 12,
    dim: "C",
    text: "为公司做会计核算",
    englishOriginal: "Perform the accounting for a company",
  },
  {
    no: 13,
    dim: "R",
    text: "规划房屋的电气系统",
    englishOriginal: "Plan the electrical system of a house",
  },
  {
    no: 14,
    dim: "I",
    text: "阅读科学论文、专业书籍",
    englishOriginal: "Read scientific papers and books",
  },
  {
    no: 15,
    dim: "A",
    text: "参与戏剧、影视场景的设计",
    englishOriginal:
      "Participate in the designing of scenarios for theater pieces",
  },
  {
    no: 16,
    dim: "S",
    text: "在社区、校园做公益、志愿者活动",
    englishOriginal:
      "Provide social services in communities and neighborhoods",
  },
  {
    no: 17,
    dim: "E",
    text: "说服他人购买产品",
    englishOriginal: "Convince people to buy a product",
  },
  {
    no: 18,
    dim: "C",
    text: "把信息录入数据库",
    englishOriginal: "Insert information into a database",
  },
];

/**
 * Likert 5 点量表 — 用户答题选项
 */
export const LIKERT_OPTIONS = [
  { value: 1, label: "非常不喜欢", emoji: "😣" },
  { value: 2, label: "不喜欢", emoji: "😐" },
  { value: 3, label: "中立", emoji: "🙂" },
  { value: 4, label: "喜欢", emoji: "😊" },
  { value: 5, label: "非常喜欢", emoji: "🤩" },
] as const;

export type LikertValue = 1 | 2 | 3 | 4 | 5;

// 兴趣 tag 多选题(第 19 题)— v3 扩 7 → 16 + 加喜欢程度 1-5
export type InterestTag = {
  label: string;
  text: string;
  key: string;
};

/**
 * v3 兴趣 tag 库 — 16 个
 * 设计原则:覆盖 RIASEC 6 维均衡 + 贴近 Z 世代大学生场景 + 永不自填
 *
 * 6 维对应(粗略):
 *   R(实用)→ 运动 / 旅行 / 手工
 *   I(研究)→ 阅读 / 心理哲学 / 自然 / 数据&AI
 *   A(艺术)→ 音乐 / 摄影 / 内容 / 设计 / 影视 / 美食 / 游戏
 *   S(社交)→ 公益 / 心理哲学
 *   E(企业)→ 商业财经
 *   C(常规)→(无直接 — C 偏专业技能不偏兴趣)
 */
export const INTEREST_TAGS: InterestTag[] = [
  // 原 v2 7 个
  { label: "🎵", text: "音乐(听歌 / 弹琴 / 鉴赏)", key: "music" },
  { label: "📸", text: "摄影与影像(拍照 / 剪片)", key: "photo" },
  { label: "🎮", text: "游戏与二次元", key: "gaming" },
  { label: "✍️", text: "内容创作(写作 / 视频 / 播客)", key: "content" },
  { label: "🍳", text: "美食(烹饪 / 探店)", key: "food" },
  { label: "🎨", text: "设计(UI / 平面 / 产品)", key: "design" },
  { label: "📊", text: "数据 & AI", key: "data_ai" },
  // v3 新增 9 个
  { label: "📚", text: "阅读(小说 / 非虚构 / 专业书)", key: "reading" },
  { label: "🏃", text: "运动健身(球类 / 跑步 / 撸铁)", key: "sports" },
  { label: "✈️", text: "旅行户外(citywalk / 徒步 / 露营)", key: "travel" },
  { label: "🎬", text: "影视追剧(电影 / 美剧 / 综艺)", key: "film" },
  { label: "🌱", text: "自然环保(动植物 / 环境 / 可持续)", key: "nature" },
  { label: "💼", text: "商业财经(创业 / 股市 / 行业动态)", key: "business" },
  { label: "🧠", text: "心理哲学(人性 / 思辨 / 自我)", key: "psychology" },
  { label: "🤝", text: "公益志愿(支教 / 社区 / 弱势群体)", key: "volunteer" },
  { label: "🛠️", text: "手工 DIY(木工 / 电子 / 改装)", key: "diy" },
];

export const INTEREST_QUESTION = {
  no: 19,
  text: "你对哪些有强烈兴趣?(可多选,选完会让你打喜欢程度)",
  helper: "选越多越能精准推荐 · 仅可多选,不可自填(保持零打字)",
};

/**
 * v3 兴趣强度类型 — { key: strength 1-5 } map
 * 例:{ "music": 5, "data_ai": 4 } 表示"音乐非常喜欢,数据 AI 喜欢"
 */
export type InterestWithStrength = {
  key: string;
  strength: number; // 1-5
};

/**
 * 计算 RIASEC 6 维度分数 — 18REST-2 标准算法
 *
 * 算法(论文 Results §"Raw scores were computed for each RIASEC dimension"):
 *   - 答案是 Likert 1-5 分
 *   - 每维 3 题,简单加和
 *   - 范围 3-15 分(全跳过维度 = 0,论文未明示但工程上合理)
 *   - 跳过的题不计入(等价该题 0 分,但只对答了的题加和)
 *
 * 返回:[R, I, A, S, E, C] 数组,每维 0-15
 */
export function computeRIASEC(
  answers: Record<number, number | string[] | Record<string, number>>
): [number, number, number, number, number, number] {
  const sums: Record<Dimension, number> = {
    R: 0,
    I: 0,
    A: 0,
    S: 0,
    E: 0,
    C: 0,
  };

  for (const q of RIASEC_QUESTIONS) {
    const ans = answers[q.no];
    // 只处理 1-5 数字答案;跳过 / 多选(兴趣 tag)不算
    if (typeof ans === "number" && ans >= 1 && ans <= 5) {
      sums[q.dim] += ans;
    }
  }

  return [sums.R, sums.I, sums.A, sums.S, sums.E, sums.C];
}

/**
 * 生成 RIASEC 编码字符串(按分数从高到低)
 * 例:[10, 13, 8, 11, 14, 6] → "E14 I13 S11 R10 A8 C6"
 *
 * 并列时按 Holland 经典顺序 R→I→A→S→E→C 优先
 */
export function formatRIASECCode(
  scores: [number, number, number, number, number, number]
): string {
  const dims: Dimension[] = ["R", "I", "A", "S", "E", "C"];
  const paired = dims
    .map((d, i) => ({ dim: d, score: scores[i], order: i }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order; // 并列按经典顺序
    });
  return paired.map((p) => `${p.dim}${p.score}`).join(" ");
}

/**
 * 生成 3 字母 Holland 代码(Top 3 维度,如 "EIS")
 * 用于结果页主标题
 */
export function formatHollandCode(
  scores: [number, number, number, number, number, number]
): string {
  const dims: Dimension[] = ["R", "I", "A", "S", "E", "C"];
  const top3 = dims
    .map((d, i) => ({ dim: d, score: scores[i], order: i }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.order - b.order;
    })
    .slice(0, 3);
  return top3.map((p) => p.dim).join("");
}

/**
 * 按维度返回 高/中/低 等级
 * 阈值:论文没明示,我们基于 Likert 中点设定
 *   - 高: ≥ 12 分(平均 ≥ 4 分 = 喜欢)
 *   - 中: 9-11 分
 *   - 低: ≤ 8 分
 */
export type DimensionLevel = "high" | "mid" | "low";

export function getDimensionLevel(score: number): DimensionLevel {
  if (score >= 12) return "high";
  if (score >= 9) return "mid";
  return "low";
}

export const DIMENSION_LEVEL_LABELS: Record<DimensionLevel, string> = {
  high: "高",
  mid: "中",
  low: "低",
};

/**
 * 计算 confidence(信号强度)— 适配 5 点 Likert
 *   high — 已答 ≥ 15 题 且 Top1 ≥ 12(明显高分维度)
 *   mid  — 已答 ≥ 10 题 或 Top1 ≥ 9
 *   low  — 已答 ≥ 5 题
 *   none — 已答 < 5 题(不展示推荐)
 */
export function computeConfidence(
  answers: Record<number, number | string[] | Record<string, number>>,
  scores: [number, number, number, number, number, number]
): Confidence {
  const answered = RIASEC_QUESTIONS.filter(
    (q) => typeof answers[q.no] === "number"
  ).length;

  if (answered < 5) return "none";

  const top1 = Math.max(...scores);

  if (answered >= 15 && top1 >= 12) return "high";
  if (answered >= 10 || top1 >= 9) return "mid";
  return "low";
}

/**
 * 从 answers 中读兴趣 + 强度
 *
 * v3 schema 变化:
 *   - v2: answers[19] = ["🎵", "✍️"]  (label[] 数组)
 *   - v3: answers[19] = { "🎵": 5, "✍️": 3 }  (label → strength map)
 *
 * 向后兼容:仍支持 v2 数组格式(strength 默认 4)
 */
export function getSelectedInterests(
  answers: Record<number, number | string[] | Record<string, number>>
): InterestWithStrength[] {
  const ans = answers[INTEREST_QUESTION.no];
  if (!ans) return [];

  // v3 map 格式: { "🎵": 5, "✍️": 3 }
  if (typeof ans === "object" && !Array.isArray(ans)) {
    return Object.entries(ans)
      .map(([label, strength]) => {
        const tag = INTEREST_TAGS.find((t) => t.label === label);
        if (!tag) return null;
        const s = typeof strength === "number" ? strength : 4;
        return {
          key: tag.key,
          strength: Math.max(1, Math.min(5, s)),
        };
      })
      .filter((x): x is InterestWithStrength => x !== null);
  }

  // v2 数组格式(向后兼容):strength 默认 4
  if (Array.isArray(ans)) {
    return ans
      .map((label) => {
        const tag = INTEREST_TAGS.find((t) => t.label === label);
        return tag ? { key: tag.key, strength: 4 } : null;
      })
      .filter((x): x is InterestWithStrength => x !== null);
  }

  return [];
}

/**
 * 兴趣 keys 简化版(给候选池打分,不带强度)— v2 向后兼容
 */
export function getSelectedInterestKeys(
  answers: Record<number, number | string[] | Record<string, number>>
): string[] {
  return getSelectedInterests(answers).map((i) => i.key);
}

/**
 * 把任意外部 answers 输入归一化到当前 v3 schema,丢弃异常值。
 * 主要用途:
 *   - localStorage 老格式残留(v2 answers[19] = string[])→ 转 Record<label, 4>
 *   - quiz draft 自动恢复时,防御 JSON 反序列化后类型错乱
 *   - API 进入时再过一遍,避免坏数据进 LLM prompt
 */
export function migrateAnswersSchema(
  raw: unknown
): Record<number, number | Record<string, number>> {
  const safe: Record<number, number | Record<string, number>> = {};
  if (!raw || typeof raw !== "object") return safe;

  const validQuestionNos = new Set<number>([
    ...RIASEC_QUESTIONS.map((q) => q.no),
    INTEREST_QUESTION.no,
  ]);

  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const noNum = Number(rawKey);
    if (!Number.isFinite(noNum) || !validQuestionNos.has(noNum)) continue;

    if (noNum === INTEREST_QUESTION.no) {
      if (Array.isArray(value)) {
        const map: Record<string, number> = {};
        for (const lbl of value) {
          if (typeof lbl === "string") map[lbl] = 4;
        }
        if (Object.keys(map).length > 0) safe[noNum] = map;
      } else if (value && typeof value === "object") {
        const map: Record<string, number> = {};
        for (const [lbl, strRaw] of Object.entries(
          value as Record<string, unknown>
        )) {
          const s = typeof strRaw === "number" ? strRaw : Number(strRaw);
          if (Number.isFinite(s)) {
            map[lbl] = Math.max(1, Math.min(5, Math.round(s)));
          }
        }
        if (Object.keys(map).length > 0) safe[noNum] = map;
      }
      continue;
    }

    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 5) {
      safe[noNum] = Math.round(n) as 1 | 2 | 3 | 4 | 5;
    }
  }

  return safe;
}
