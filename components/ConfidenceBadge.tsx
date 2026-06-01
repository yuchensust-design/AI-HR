import type { Confidence } from "@/lib/quiz-data";

/**
 * 信心 badge — 显示测评结果信号强度
 * (来自 quiz-data.ts computeConfidence)
 */

const STYLE: Record<Confidence, { label: string; cls: string }> = {
  high: {
    label: "匹配信号:高",
    cls: "bg-esther-blue/10 text-esther-blue border-esther-blue/30",
  },
  mid: {
    label: "匹配信号:中",
    cls: "bg-esther-yellow/30 text-ink border-esther-yellow/60",
  },
  low: {
    label: "匹配信号:低 · 可再答几道",
    cls: "bg-warm-bg-deep text-ink-soft border-border",
  },
  none: {
    label: "答得太少,推荐不可靠",
    cls: "bg-esther-red/10 text-esther-red border-esther-red/30",
  },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const s = STYLE[confidence];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${s.cls}`}
    >
      {s.label}
    </span>
  );
}
