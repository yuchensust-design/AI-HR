/**
 * §8.28 M3 step 3 — 优化目标多选 chip
 *
 * 用户在 m3 主页 step 3 勾选要重点优化的方向(默认全选)。
 * 选中的 key 数组存 localStorage,prompt 时传给后端 suggest-edits 让 LLM 知道侧重点。
 *
 * 设计:6 个 key,其中 2 个标 ⭐ 是产品差异化(隐藏经验挖掘 + AI 推测处给你确认)。
 */

export type M3OptimizationGoalKey =
  | "jd-keywords"
  | "hidden-experience"
  | "quantify"
  | "jd-gap-analysis"
  | "anti-fab"
  | "ats-format";

export type M3OptimizationGoalMeta = {
  key: M3OptimizationGoalKey;
  emoji: string;
  title: string;
  desc: string;
  /** ⭐ 标产品差异化 */
  isDifferentiator?: boolean;
};

export const M3_OPTIMIZATION_GOALS: M3OptimizationGoalMeta[] = [
  {
    key: "jd-keywords",
    emoji: "🔍",
    title: "JD 关键词命中",
    desc: "提升初筛通过率",
  },
  {
    key: "hidden-experience",
    emoji: "⭐",
    title: "隐藏经验挖掘",
    desc: "把简历没写的素材问出来",
    isDifferentiator: true,
  },
  {
    key: "quantify",
    emoji: "📊",
    title: "量化数字补充",
    desc: "让 bullet 有数字",
  },
  {
    key: "jd-gap-analysis",
    emoji: "🎯",
    title: "JD 必备 / 差距分析",
    desc: "看你哪里弱要补",
  },
  {
    key: "anti-fab",
    emoji: "⭐",
    title: "AI 推测处给你确认",
    desc: "不替你编经历",
    isDifferentiator: true,
  },
  {
    key: "ats-format",
    emoji: "📄",
    title: "Word 排版优化",
    desc: "ATS 友好版式",
  },
];

/** 默认全不选,用户自己勾(2026-06-06 用户 lock) */
export const M3_DEFAULT_GOALS: M3OptimizationGoalKey[] = [];

/** 给 LLM prompt 的中文段(从 keys 转描述) */
export function goalsToPromptHint(keys: M3OptimizationGoalKey[]): string {
  if (keys.length === 0 || keys.length === M3_OPTIMIZATION_GOALS.length) {
    return ""; // 全选 = 默认全做,不加额外 prompt
  }
  const items = keys
    .map((k) => M3_OPTIMIZATION_GOALS.find((g) => g.key === k))
    .filter(Boolean)
    .map((g) => `- ${g!.title}:${g!.desc}`)
    .join("\n");
  return `\n\n【用户重点优化方向】用户在 step 3 勾选了以下重点优化方向,生成建议时优先围绕这些维度,未勾选的维度可降权或省略:\n${items}`;
}
