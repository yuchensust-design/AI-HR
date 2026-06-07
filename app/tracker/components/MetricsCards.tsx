"use client";

import { Metrics } from "@/lib/tracker-types";
import { formatPct } from "@/lib/tracker-metrics";

type Props = { metrics: Metrics; sampleMode?: boolean };

export function MetricsCards({ metrics, sampleMode }: Props) {
  const empty = !sampleMode && metrics.reliability === "empty";
  const weak = !sampleMode && metrics.reliability === "weak";

  const steps = [
    { label: "投递", count: metrics.applied, rate: 1 },
    { label: "回复", count: metrics.responded, rate: metrics.responseRate },
    { label: "面试", count: metrics.interviewed, rate: metrics.interviewRate },
    { label: "Offer", count: metrics.offered, rate: metrics.offerRate },
  ];

  const funnelColors = [
    "bg-esther-blue",
    "bg-sky-400",
    "bg-amber-400",
    "bg-emerald-500",
  ];

  return (
    <div className="bg-card border border-border rounded-2xl p-5 space-y-5">
      {(empty || weak) && (
        <p className="text-xs text-ink-muted bg-warm-bg rounded-lg px-3 py-2">
          {empty
            ? "🌱 还没有投递数据 — 新增第一条后这里会显示转化漏斗"
            : `⚠️ 真实样本仅 ${metrics.realCount} 条，转化率仅供参考，累计更多后更可信`}
        </p>
      )}

      {/* 漏斗 */}
      <div className="flex items-stretch gap-1">
        {steps.map((s, i) => {
          const widthPct = Math.max(8, Math.round(s.rate * 100));
          return (
            <div key={s.label} className="flex items-center gap-1 flex-1 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 mb-1">
                  <span className="text-2xl font-bold text-ink font-display">
                    {empty ? "—" : s.count}
                  </span>
                  {i > 0 && !empty && !weak && (
                    <span className="text-xs text-ink-muted">
                      {formatPct(s.rate)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-muted mb-1.5">{s.label}</div>
                <div className="h-1.5 rounded-full bg-warm-bg-deep overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${funnelColors[i]}`}
                    style={{ width: empty ? "0%" : `${widthPct}%` }}
                  />
                </div>
              </div>
              {i < steps.length - 1 && (
                <span className="text-ink-muted/40 text-xs flex-shrink-0 pb-4">→</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 待投递小提示 */}
      {metrics.total - metrics.applied > 0 && (
        <p className="text-xs text-ink-muted">
          另有 {metrics.total - metrics.applied} 条待投递
        </p>
      )}
    </div>
  );
}
