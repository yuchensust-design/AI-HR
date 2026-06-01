/**
 * 模块 1 测评 — 18 道 RIASEC + 1 道兴趣 tag 多选题
 *
 * 设计:
 *   - 每题 4 选项,每选项关联 1 个 RIASEC 维度(R/I/A/S/E/C)
 *   - 用户可跳过(不计入)
 *   - 18 题答完,统计每维度被选次数,cap 10 → 编码
 *
 * 6 维选项分布(72 个选项总,目标均衡 12 ± 2):
 *   R = 11 / I = 13 / A = 13 / S = 13 / E = 10 / C = 11
 *   (2026-06-01 调整后,从 R7 I12 A18 S13 E9 C11 优化到接近均衡)
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

export type RIASECQuestion = {
  no: number;
  text: string;
  options: Array<{
    label: string;
    text: string;
    dim: Dimension;
  }>;
};

export const RIASEC_QUESTIONS: RIASECQuestion[] = [
  {
    no: 1,
    text: "周末有空,你更想做什么?",
    options: [
      { label: "A", text: "修家里坏掉的东西 / DIY 做点小物件", dim: "R" },
      { label: "B", text: "户外运动(跑步 / 爬山 / 打球)", dim: "R" },
      { label: "C", text: "把家里收拾归位,东西分类", dim: "C" },
      { label: "D", text: "帮朋友搬家或修个东西", dim: "S" },
    ],
  },
  {
    no: 2,
    text: "看到一个有意思的现象,你的第一反应?",
    options: [
      { label: "A", text: "找资料 / 查论文 弄清楚原理", dim: "I" },
      { label: "B", text: "自己想几个假设,慢慢验证", dim: "I" },
      { label: "C", text: "跟懂行的人聊,听他们怎么看", dim: "S" },
      { label: "D", text: "把它记下来,以后再观察", dim: "C" },
    ],
  },
  {
    no: 3,
    text: "有 2 小时空闲,你会选?",
    options: [
      { label: "A", text: "看电影 / 读小说", dim: "A" },
      { label: "B", text: "听音乐 / 弹琴 / 唱歌", dim: "A" },
      { label: "C", text: "学个新工具 / 看技术教程", dim: "I" },
      { label: "D", text: "组个小局,找朋友一起做点事", dim: "E" },
    ],
  },
  {
    no: 4,
    text: "朋友遇到困难,你通常?",
    options: [
      { label: "A", text: "主动找 ta 聊聊,听 ta 说", dim: "S" },
      { label: "B", text: "给 ta 出主意,帮 ta 想办法", dim: "I" },
      { label: "C", text: "拉 ta 一起做点事,转移注意力", dim: "E" },
      { label: "D", text: "默默关心,需要时再出现", dim: "S" },
    ],
  },
  {
    no: 5,
    text: "团队做项目时,你最常的角色?",
    options: [
      { label: "A", text: "主动提议方向,带大家走", dim: "E" },
      { label: "B", text: "协调资源,确保推进", dim: "C" },
      { label: "C", text: "跟外部沟通争取支持", dim: "S" },
      { label: "D", text: "找最高效的方法做事", dim: "I" },
    ],
  },
  {
    no: 6,
    text: "做一件事时,你更倾向?",
    options: [
      { label: "A", text: "列详细计划,按步骤来", dim: "C" },
      { label: "B", text: "找模板 / 流程套用", dim: "C" },
      { label: "C", text: "边做边调整,看情况", dim: "A" },
      { label: "D", text: "先想清楚目标,再决定怎么做", dim: "E" },
    ],
  },
  {
    no: 7,
    text: "学校里你最感兴趣的科目类型?",
    options: [
      { label: "A", text: "数学 / 物理(原理推导)", dim: "I" },
      { label: "B", text: "历史 / 哲学(思考与理解)", dim: "A" },
      { label: "C", text: "美术 / 音乐(创造表达)", dim: "A" },
      { label: "D", text: "经济 / 法律(规则与影响)", dim: "E" },
    ],
  },
  {
    no: 8,
    text: "下面工作场景,你最不抗拒哪个?",
    options: [
      { label: "A", text: "实验室里调仪器、做实验", dim: "R" },
      { label: "B", text: "电脑前写代码、debug", dim: "I" },
      { label: "C", text: "桌前画原型 / 设计 UI", dim: "A" },
      { label: "D", text: "户外跟人采访 / 拍摄", dim: "S" },
    ],
  },
  {
    no: 9,
    text: "什么场景让你觉得最 satisfying?",
    options: [
      { label: "A", text: "帮一个困难学生提高成绩", dim: "S" },
      { label: "B", text: "解决一个困扰别人很久的技术难题", dim: "I" },
      { label: "C", text: "设计一个让人惊艳的产品", dim: "A" },
      { label: "D", text: "推动一个项目从 0 到上线", dim: "E" },
    ],
  },
  {
    no: 10,
    text: "刷到下面内容,你最容易停下来看?",
    options: [
      { label: "A", text: "风景 / 摄影 / 设计美图", dim: "A" },
      { label: "B", text: "长文 / 深度思考", dim: "I" },
      { label: "C", text: "运动 / 户外 / 健身", dim: "R" },
      { label: "D", text: "工作技巧 / 学习方法", dim: "C" },
    ],
  },
  {
    no: 11,
    text: "整理书桌时,你倾向?",
    options: [
      { label: "A", text: "动手 DIY,加抽屉 / 隔板", dim: "R" },
      { label: "B", text: "按常用度归类,大件优先", dim: "C" },
      { label: "C", text: "怎么舒服怎么放,看心情", dim: "A" },
      { label: "D", text: "需要时再找,平时不整理", dim: "R" },
    ],
  },
  {
    no: 12,
    text: "你最爱聊的话题?",
    options: [
      { label: "A", text: "创业 / 商业新事物", dim: "E" },
      { label: "B", text: "科技 / 前沿研究", dim: "I" },
      { label: "C", text: "艺术 / 流行文化", dim: "A" },
      { label: "D", text: "社会议题 / 公共政策", dim: "S" },
    ],
  },
  {
    no: 13,
    text: "长假最想做的?",
    options: [
      { label: "A", text: "健身 / 运动 / 练身体", dim: "R" },
      { label: "B", text: "长途旅行 / 户外探索", dim: "R" },
      { label: "C", text: "在家看剧 / 读书 / 听 podcast", dim: "I" },
      { label: "D", text: "学一门新技能(语言 / 工具)", dim: "I" },
    ],
  },
  {
    no: 14,
    text: "遇到一个新工具,你?",
    options: [
      { label: "A", text: "先看文档,搞懂原理再用", dim: "I" },
      { label: "B", text: "直接上手试,边用边学", dim: "R" },
      { label: "C", text: "看几个教学视频", dim: "C" },
      { label: "D", text: "问已经会用的朋友", dim: "S" },
    ],
  },
  {
    no: 15,
    text: "你觉得自己有哪种 talent?",
    options: [
      { label: "A", text: "动手做出实物 / 修复物件", dim: "R" },
      { label: "B", text: "想出新点子 / 创意", dim: "A" },
      { label: "C", text: "把复杂的事讲清楚", dim: "S" },
      { label: "D", text: "把零散的事整成系统", dim: "C" },
    ],
  },
  {
    no: 16,
    text: "在小组讨论里,你最常做的?",
    options: [
      { label: "A", text: "倾听别人,缓和气氛", dim: "S" },
      { label: "B", text: "抛出新的 idea", dim: "A" },
      { label: "C", text: "推动进度,提醒大家做决定", dim: "E" },
      { label: "D", text: "记录大家说的,整理 action items", dim: "C" },
    ],
  },
  {
    no: 17,
    text: "看一个产品发布会,你更关心?",
    options: [
      { label: "A", text: "商业模式 / 怎么赚钱", dim: "E" },
      { label: "B", text: "技术实现 / 底层原理", dim: "I" },
      { label: "C", text: "UI / 创意 / 设计感", dim: "A" },
      { label: "D", text: "用户体验 / 解决谁的问题", dim: "S" },
    ],
  },
  {
    no: 18,
    text: "你最舒服的工作节奏?",
    options: [
      { label: "A", text: "有明确日程 / 任务清单", dim: "C" },
      { label: "B", text: "上手就干,边做边修", dim: "R" },
      { label: "C", text: "跟团队一起推动,有节奏感", dim: "S" },
      { label: "D", text: "自己定目标,推自己前进", dim: "E" },
    ],
  },
];

// 兴趣 tag 多选题(第 19 题)
export type InterestTag = {
  label: string;
  text: string;
  key: string;
};

export const INTEREST_TAGS: InterestTag[] = [
  { label: "🎵", text: "音乐(听歌 / 弹琴 / 鉴赏)", key: "music" },
  { label: "📸", text: "摄影与影像(拍照 / 剪片)", key: "photo" },
  { label: "🎮", text: "游戏与二次元", key: "gaming" },
  { label: "✍️", text: "内容创作(写作 / 视频 / 播客)", key: "content" },
  { label: "🍳", text: "美食(烹饪 / 探店)", key: "food" },
  { label: "🎨", text: "设计(UI / 平面 / 产品)", key: "design" },
  { label: "📊", text: "数据 & AI", key: "data_ai" },
];

export const INTEREST_QUESTION = {
  no: 19,
  text: "你对哪些有强烈兴趣?(可多选,沾边都算)",
  helper: "选越多越能精准推荐 · 仅可多选,不可自填(保持零打字)",
};

/**
 * 计算 RIASEC 6 维度分数(每维 0-10)
 *
 * 算法:
 *   - 18 题中,用户每选 1 个选项 = 给对应维度 +1 vote
 *   - 跳过的题不计入
 *   - 归一化:vote 数直接 cap 10(实证 18 题里某维度被选 0-10 次属于合理范围)
 *
 * 结果:[R, I, A, S, E, C] 数组,每维 0-10
 */
export function computeRIASEC(
  answers: Record<number, string | string[]>
): [number, number, number, number, number, number] {
  const counts: Record<Dimension, number> = {
    R: 0,
    I: 0,
    A: 0,
    S: 0,
    E: 0,
    C: 0,
  };

  for (const q of RIASEC_QUESTIONS) {
    const ans = answers[q.no];
    if (typeof ans !== "string") continue; // 跳过未答 / 多选(只 RIASEC 单选题)
    const opt = q.options.find((o) => o.label === ans);
    if (opt) {
      counts[opt.dim] += 1;
    }
  }

  return [counts.R, counts.I, counts.A, counts.S, counts.E, counts.C].map(
    (n) => Math.min(n, 10)
  ) as [number, number, number, number, number, number];
}

/**
 * 生成 RIASEC 编码字符串(按分数从高到低)
 * 例:[5,8,4,6,9,5] → "E9 I8 S6 R5 C5 A4"
 */
export function formatRIASECCode(
  scores: [number, number, number, number, number, number]
): string {
  const dims: Dimension[] = ["R", "I", "A", "S", "E", "C"];
  const paired = dims
    .map((d, i) => ({ dim: d, score: scores[i] }))
    .sort((a, b) => b.score - a.score);
  return paired.map((p) => `${p.dim}${p.score}`).join(" ");
}

/**
 * Confidence 4 级 — 测评结果信号强度,影响推荐展示
 */
export type Confidence = "high" | "mid" | "low" | "none";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "匹配信号:高",
  mid: "匹配信号:中",
  low: "匹配信号:低",
  none: "答得太少,推荐不可靠",
};

/**
 * 计算 confidence:
 *   high — 已答 ≥ 15 题 且 Top1 ≥ 6
 *   mid  — 已答 ≥ 10 题 或 Top1 ≥ 4
 *   low  — 已答 ≥ 5 题
 *   none — 已答 < 5 题(不展示推荐)
 */
export function computeConfidence(
  answers: Record<number, string | string[]>,
  scores: [number, number, number, number, number, number]
): Confidence {
  const answered = RIASEC_QUESTIONS.filter(
    (q) => typeof answers[q.no] === "string"
  ).length;

  if (answered < 5) return "none";

  const top1 = Math.max(...scores);

  if (answered >= 15 && top1 >= 6) return "high";
  if (answered >= 10 || top1 >= 4) return "mid";
  return "low";
}

/**
 * 从 localStorage answers 中读 InterestTag keys 选中列表
 */
export function getSelectedInterests(
  answers: Record<number, string | string[]>
): string[] {
  const ans = answers[INTEREST_QUESTION.no];
  if (!Array.isArray(ans)) return [];
  // ans 是 label 数组(eg ['🎵', '✍️']),映射到 key
  return ans
    .map((label) => INTEREST_TAGS.find((t) => t.label === label)?.key)
    .filter((k): k is string => !!k);
}
