/**
 * M3 step 3 — 八大核心优化规则
 *
 * 两层(2026-06-07 用户 lock):
 *  - M3_OPTIMIZATION_GOALS:每次简历优化默认全部执行的 8 条核心规则
 *  - M3_DIFFERENTIATORS:4 个常驻差异化能力,用于补强利他价值表达
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
  icon: string;
  title: string;
  desc: string;
};

export const M3_OPTIMIZATION_GOALS: M3OptimizationGoalMeta[] = [
  { key: "keyword-match", icon: "KeyRound", title: "关键词匹配", desc: "提取 JD 核心关键词" },
  { key: "star-rebuild", icon: "SquareDashedKanban", title: "STAR 原则重构", desc: "情境–任务–行动–结果" },
  { key: "quantify", icon: "ChartColumnIncreasing", title: "量化数据强化", desc: "模糊描述 → 具体数据" },
  { key: "verb-upgrade", icon: "Rocket", title: "动词升级", desc: "弱动词 → 强动词" },
  { key: "competency", icon: "Sparkles", title: "胜任力呈现", desc: "突出核心胜任力" },
  { key: "structure", icon: "Blocks", title: "结构逻辑优化", desc: "优化信息呈现顺序" },
  { key: "ats-format", icon: "FileText", title: "ATS 友好格式", desc: "兼容招聘系统解析" },
  { key: "compliance", icon: "BadgeCheck", title: "表述合规优化", desc: "去除主观冗余信息" },
];

/** 常驻差异化能力(不可勾,大白话) — 别家没有,是产品底线/卖点 */
export const M3_DIFFERENTIATORS: { icon: string; title: string; desc: string }[] = [
  {
    icon: "SearchCheck",
    title: "把 JD 里你有的经历挖出来",
    desc: "挖出岗位需要、但你还没写进简历的对应经历",
  },
  {
    icon: "ShieldCheck",
    title: "让简历紧扣你真实做过的事",
    desc: "只写你真实做过的内容，贴岗位，也更有说服力",
  },
  {
    icon: "Target",
    title: "先分析差距，再规划怎么补",
    desc: "分析你和目标岗位的差距，再规划补什么项目更有价值",
  },
  {
    icon: "MessageSquareMore",
    title: "把高频面试追问提前整理出来",
    desc: "把容易被追问的点标出来，让你改简历时就为面试做准备",
  },
];

/** 给 LLM prompt 的中文段(八大规则默认全执行) */
export function goalsToPromptHint(keys: M3OptimizationGoalKey[]): string {
  const items = keys
    .map((k) => M3_OPTIMIZATION_GOALS.find((g) => g.key === k))
    .filter(Boolean)
    .map((g) => `- ${g!.title}:${g!.desc}`)
    .join("\n");
  return `\n\n【八大核心优化规则】以下 8 条规则在本次简历优化中默认全部执行,生成建议时必须完整覆盖这些维度,不要遗漏:\n${items}`;
}
