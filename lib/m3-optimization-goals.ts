/**
 * M3 step 3 — 优化目标
 *
 * 两层(2026-06-07 用户 lock):
 *  - M3_OPTIMIZATION_GOALS:8 个可勾选优化目标(对标竞品 ResumeAI Pro 的 8 项规则,
 *    用户熟悉的标准简历优化)。勾选作为 LLM 生成建议的优先级提示。
 *  - M3_DIFFERENTIATORS:4 个常驻(不可勾)差异化能力,大白话写清楚,别家没有。
 */

export type M3OptimizationGoalKey =
  | "keyword-match"
  | "star-rebuild"
  | "quantify"
  | "verb-upgrade"
  | "competency"
  | "structure"
  | "ats-format"
  | "compliance";

export type M3OptimizationGoalMeta = {
  key: M3OptimizationGoalKey;
  emoji: string;
  title: string;
  desc: string;
};

export const M3_OPTIMIZATION_GOALS: M3OptimizationGoalMeta[] = [
  { key: "keyword-match", emoji: "🔑", title: "关键词匹配", desc: "提取 JD 核心关键词" },
  { key: "star-rebuild", emoji: "📐", title: "STAR 原则重构", desc: "情境–任务–行动–结果" },
  { key: "quantify", emoji: "📊", title: "量化数据强化", desc: "模糊描述 → 具体数据" },
  { key: "verb-upgrade", emoji: "💪", title: "动词升级", desc: "弱动词 → 强动词" },
  { key: "competency", emoji: "🌟", title: "胜任力呈现", desc: "突出核心胜任力" },
  { key: "structure", emoji: "🧱", title: "结构逻辑优化", desc: "优化信息呈现顺序" },
  { key: "ats-format", emoji: "📄", title: "ATS 友好格式", desc: "兼容招聘系统解析" },
  { key: "compliance", emoji: "✅", title: "表述合规优化", desc: "去除主观冗余信息" },
];

/** 常驻差异化能力(不可勾,大白话) — 别家没有,是产品底线/卖点 */
export const M3_DIFFERENTIATORS: { emoji: string; title: string; desc: string }[] = [
  {
    emoji: "🔍",
    title: "挖隐藏经验",
    desc: "把你做过、但忘了写进简历的经历问出来,帮你补上",
  },
  {
    emoji: "🎯",
    title: "诚实指差距",
    desc: "JD 要求、但你简历真没有的能力,直接告诉你 —— 不替你假装会",
  },
  {
    emoji: "🛡️",
    title: "绝不替你编造",
    desc: "AI 只用你简历里真有的内容来改,不会凭空给你加技能或数字",
  },
  {
    emoji: "⚡",
    title: "HR 追问预演",
    desc: "面试官可能追问的地方(这数字哪来的?你具体负责哪部分?),提前标出来,让你先想好怎么答",
  },
];

/** 默认全不选,用户自己勾(2026-06-06 用户 lock) */
export const M3_DEFAULT_GOALS: M3OptimizationGoalKey[] = [];

/** 给 LLM prompt 的中文段(从 keys 转描述) */
export function goalsToPromptHint(keys: M3OptimizationGoalKey[]): string {
  if (keys.length === 0 || keys.length === M3_OPTIMIZATION_GOALS.length) {
    return ""; // 全选 / 没选 = 默认全做,不加额外 prompt
  }
  const items = keys
    .map((k) => M3_OPTIMIZATION_GOALS.find((g) => g.key === k))
    .filter(Boolean)
    .map((g) => `- ${g!.title}:${g!.desc}`)
    .join("\n");
  return `\n\n【用户重点优化方向】用户在 step 3 勾选了以下重点方向,生成建议时优先围绕这些维度,未勾选的维度可降权或省略:\n${items}`;
}
