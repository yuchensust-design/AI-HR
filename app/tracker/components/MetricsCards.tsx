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
  // plan offer-1-sparkling-hippo P1:样本不足时模糊化转化率
  const weak = metrics.reliability === "weak";
  const empty = metrics.reliability === "empty";
  const fuzzyPct = (rate: number, kind: Parameters<typeof rateTone>[1]): { value: string; tone: CardSpec["tone"] } => {
    if (empty) return { value: "—", tone: "neutral" };
    if (weak) return { value: "样本不足", tone: "neutral" };
    return { value: formatPct(rate), tone: rateTone(rate, kind) };
  };

  const responseRate = fuzzyPct(metrics.responseRate, "response");
  const interviewRate = fuzzyPct(metrics.interviewRate, "interview");
  const offerRate = fuzzyPct(metrics.offerRate, "offer");
  const ghostedRate = fuzzyPct(metrics.ghostedRate, "ghosted");

  const cards: CardSpec[] = [
    {
      label: "总投递",
      value: String(metrics.total),
      hint: `已投递 ${metrics.applied} · 待投 ${metrics.total - metrics.applied}`,
      tone: "neutral",
    },
    {
      label: "回复率",
      value: responseRate.value,
      hint: `${metrics.responded} / ${metrics.applied} 份已投递`,
      tone: responseRate.tone,
    },
    {
      label: "面试转化",
      value: interviewRate.value,
      hint: `${metrics.interviewed} 份进面 / ${metrics.applied}`,
      tone: interviewRate.tone,
    },
    {
      label: "offer 率",
      value: offerRate.value,
      hint: `${metrics.offered} offer / ${metrics.applied}`,
      tone: offerRate.tone,
    },
    {
      label: "已挂占比",
      value: ghostedRate.value,
      hint: `${metrics.ghosted} 已挂 / ${metrics.applied}`,
      tone: ghostedRate.tone,
    },
    {
      label: "平均等待",
      value: empty ? "—" : formatDays(metrics.avgWaitDays),
      hint: "投递到状态更新的平均天数",
      tone: "neutral",
    },
  ];

  return (
    <div className="space-y-3">
      {(weak || empty) && (
        <div className="rounded-xl ring-1 ring-amber-300 bg-amber-50/60 px-4 py-3">
          <p className="text-xs text-ink leading-relaxed">
            <span className="font-semibold">
              {empty ? "🌱 还没有真实投递数据" : "⚠️ 样本不足,转化率不可信"}
            </span>{" "}
            <span className="text-ink-soft">
              {empty
                ? "录入几条真实投递后,这里会出现回复率 / 面试转化 / offer 率 等指标。"
                : `真实样本只有 ${metrics.realCount} 条(建议累计 ${metrics.reliableSampleThreshold} 条以上再看转化率)。小样本下任何百分比都容易被一两条结果左右,先关注绝对数字的演变。`}
            </span>
          </p>
        </div>
      )}
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
    </div>
  );
}
