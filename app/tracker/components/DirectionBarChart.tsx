"use client";

import { DirectionMetric } from "@/lib/tracker-types";
import { formatPct } from "@/lib/tracker-metrics";

type Props = { rows: DirectionMetric[] };

const SERIES: { key: keyof DirectionMetric; label: string; color: string }[] = [
  { key: "responseRate", label: "回复率", color: "bg-sky-500" },
  { key: "interviewRate", label: "面试率", color: "bg-amber-500" },
  { key: "offerRate", label: "offer 率", color: "bg-emerald-500" },
];

export function DirectionBarChart({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return (
      <div className="text-sm text-ink-muted">暂无方向数据,加几条投递后看分布。</div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-ink-soft">
        {SERIES.map((s) => (
          <span key={s.key as string} className="flex items-center gap-1.5">
            <span className={`inline-block w-3 h-3 rounded-sm ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.direction}>
            <div className="flex justify-between text-sm">
              <span className="text-ink font-medium">{row.label}</span>
              <span className="text-ink-muted text-xs">共 {row.total} 份</span>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {SERIES.map((s) => {
                const rate = row[s.key] as number;
                const pct = Math.max(2, Math.round(rate * 100));
                return (
                  <div
                    key={s.key as string}
                    className="h-6 rounded-md bg-foreground/5 overflow-hidden relative"
                    title={`${s.label}: ${formatPct(rate)}`}
                  >
                    <div
                      className={`${s.color} h-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                    <div className="absolute inset-0 flex items-center justify-end px-1.5 text-[10px] text-ink-soft font-medium">
                      {formatPct(rate)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
