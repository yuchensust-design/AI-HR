"use client";

import { Metrics } from "@/lib/tracker-types";
import { formatDays, formatPct } from "@/lib/tracker-metrics";

type Props = { metrics: Metrics };

type CardSpec = {
  label: string;
  value: string;
  hint: string;
  tone: "neutral" | "good" | "warn" | "bad";
};

function toneRing(tone: CardSpec["tone"]) {
  switch (tone) {
    case "good":
      return "ring-emerald-300 bg-emerald-50/60";
    case "warn":
      return "ring-amber-300 bg-amber-50/60";
    case "bad":
      return "ring-rose-300 bg-rose-50/60";
    default:
      return "ring-foreground/10 bg-card";
  }
}

function rateTone(rate: number, kind: "response" | "interview" | "offer" | "ghosted"): CardSpec["tone"] {
  if (kind === "ghosted") {
    if (rate >= 0.4) return "bad";
    if (rate >= 0.2) return "warn";
    return "neutral";
  }
  if (kind === "response") {
    if (rate >= 0.4) return "good";
    if (rate >= 0.2) return "neutral";
    return "warn";
  }
  if (kind === "interview") {
    if (rate >= 0.3) return "good";
    if (rate >= 0.15) return "neutral";
    return "warn";
  }
  // offer
  if (rate >= 0.1) return "good";
  if (rate >= 0.03) return "neutral";
  return "warn";
}

export function MetricsCards({ metrics }: Props) {
  const cards: CardSpec[] = [
    {
      label: "总投递",
      value: String(metrics.total),
      hint: `已投递 ${metrics.applied} · 待投 ${metrics.total - metrics.applied}`,
      tone: "neutral",
    },
    {
      label: "回复率",
      value: formatPct(metrics.responseRate),
      hint: `${metrics.responded} / ${metrics.applied} 份已投递`,
      tone: rateTone(metrics.responseRate, "response"),
    },
    {
      label: "面试转化",
      value: formatPct(metrics.interviewRate),
      hint: `${metrics.interviewed} 份进面 / ${metrics.applied}`,
      tone: rateTone(metrics.interviewRate, "interview"),
    },
    {
      label: "offer 率",
      value: formatPct(metrics.offerRate),
      hint: `${metrics.offered} offer / ${metrics.applied}`,
      tone: rateTone(metrics.offerRate, "offer"),
    },
    {
      label: "已挂占比",
      value: formatPct(metrics.ghostedRate),
      hint: `${metrics.ghosted} 已挂 / ${metrics.applied}`,
      tone: rateTone(metrics.ghostedRate, "ghosted"),
    },
    {
      label: "平均等待",
      value: formatDays(metrics.avgWaitDays),
      hint: "投递到状态更新的平均天数",
      tone: "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className={`rounded-xl ring-1 px-4 py-3 ${toneRing(c.tone)}`}
        >
          <div className="text-xs text-ink-muted">{c.label}</div>
          <div className="font-heading text-2xl font-semibold text-ink mt-1">
            {c.value}
          </div>
          <div className="text-xs text-ink-soft mt-1 leading-snug">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
