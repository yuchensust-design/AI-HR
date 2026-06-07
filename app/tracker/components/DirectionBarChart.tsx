"use client";

import { DirectionMetric } from "@/lib/tracker-types";

type Props = { rows: DirectionMetric[] };

export function DirectionBarChart({ rows }: Props) {
  if (!rows || rows.length === 0) {
    return (
      <p className="text-sm text-ink-muted py-2">投递两个以上方向后，这里会对比各方向的转化差异。</p>
    );
  }

  const maxCount = Math.max(...rows.map((r) => r.total), 1);

  return (
    <div className="space-y-4">
      {/* 图例 */}
      <div className="flex gap-4 text-xs text-ink-muted">
        {[
          { label: "投递", color: "bg-esther-blue/70" },
          { label: "回复", color: "bg-sky-400/70" },
          { label: "面试", color: "bg-amber-400/70" },
          { label: "offer", color: "bg-emerald-500/70" },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${s.color}`} />
            {s.label}
          </span>
        ))}
      </div>

      {rows.map((row) => {
        const cells = [
          { count: row.total, rate: 1, color: "bg-esther-blue/80" },
          { count: Math.round(row.responseRate * row.total), rate: row.responseRate, color: "bg-sky-400/80" },
          { count: Math.round(row.interviewRate * row.total), rate: row.interviewRate, color: "bg-amber-400/80" },
          { count: Math.round(row.offerRate * row.total), rate: row.offerRate, color: "bg-emerald-500/80" },
        ];

        return (
          <div key={row.direction}>
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium text-ink">{row.label}</span>
              <span className="text-xs text-ink-muted">{row.total} 份</span>
            </div>
            {/* mini 漏斗 bars */}
            <div className="flex items-end gap-1 h-8">
              {cells.map((c, i) => {
                const h = Math.max(4, Math.round((c.count / maxCount) * 32));
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-sm ${c.color} transition-all`}
                    style={{ height: `${h}px` }}
                    title={`${["投递", "回复", "面试", "offer"][i]}: ${c.count}`}
                  />
                );
              })}
            </div>
            <div className="flex gap-1 mt-1">
              {cells.map((c, i) => (
                <div key={i} className="flex-1 text-center text-[10px] text-ink-muted">
                  {c.count}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
