"use client";

import { Fragment, useState } from "react";
import {
  Application,
  DIRECTION_LABELS,
  FAIL_REASON_LABELS,
  OUTCOME_LABELS,
  ROUND_TYPE_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/tracker-types";

type Props = {
  applications: Application[];
  onEdit: (a: Application) => void;
  onDelete: (id: string) => void;
};

export function ApplicationTable({ applications, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  }

  if (applications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-warm-bg/40 px-6 py-10 text-center text-sm text-ink-muted">
        还没有投递记录，点右上角「新增投递」开始记录。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10 bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-warm-bg/60 text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium w-6" />
            <th className="px-3 py-2 text-left font-medium">公司 · 岗位</th>
            <th className="px-3 py-2 text-left font-medium">方向</th>
            <th className="px-3 py-2 text-left font-medium">投递日</th>
            <th className="px-3 py-2 text-left font-medium">状态</th>
            <th className="px-3 py-2 text-left font-medium">面试轮次</th>
            <th className="px-3 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((a) => {
            const rounds = a.rounds ?? [];
            const isExpanded = expanded.has(a.id);
            const hasRounds = rounds.length > 0;
            return (
              <Fragment key={a.id}>
                <tr className="hover:bg-warm-bg/40">
                  <td className="px-2 py-2 align-top">
                    {hasRounds ? (
                      <button
                        type="button"
                        onClick={() => toggle(a.id)}
                        className="text-ink-muted hover:text-esther-blue text-xs"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <div className="font-medium text-ink leading-tight">{a.company}</div>
                    <div className="text-xs text-ink-muted mt-0.5">{a.role}</div>
                  </td>
                  <td className="px-3 py-2 align-top text-ink-soft text-xs">
                    {DIRECTION_LABELS[a.direction]}
                  </td>
                  <td className="px-3 py-2 align-top text-ink-soft whitespace-nowrap text-xs">
                    {a.appliedAt}
                  </td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-flex items-center rounded-full text-xs px-2 py-0.5 ring-1 ${STATUS_COLORS[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 align-top text-xs">
                    {hasRounds ? (
                      <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                        {rounds.map((r) => (
                          <span
                            key={r.id}
                            title={`${ROUND_TYPE_LABELS[r.type]} · ${OUTCOME_LABELS[r.outcome]}`}
                            className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded ${
                              r.outcome === "passed"
                                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                : r.outcome === "failed"
                                  ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                                  : "bg-warm-bg ring-1 ring-border text-ink-muted"
                            }`}
                          >
                            {ROUND_TYPE_LABELS[r.type]}
                            {r.outcome === "passed" && " ✓"}
                            {r.outcome === "failed" && " ✗"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onEdit(a)}
                      className="text-esther-blue hover:text-esther-blue-dark text-xs mr-3"
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm("确认删除？")) onDelete(a.id); }}
                      className="text-rose-500 hover:text-rose-700 text-xs"
                    >
                      删除
                    </button>
                  </td>
                </tr>
                {hasRounds && isExpanded && (
                  <tr className="bg-warm-bg/40">
                    <td />
                    <td colSpan={6} className="px-3 py-3">
                      <p className="text-[11px] text-ink-muted mb-2">面试记录 · 共 {rounds.length} 轮</p>
                      <ol className="space-y-2">
                        {rounds.map((r, idx) => (
                          <li key={r.id} className="flex items-start gap-3 text-xs">
                            <span className="font-mono text-ink-muted w-4">{idx + 1}.</span>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-ink">{ROUND_TYPE_LABELS[r.type]}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.outcome === "passed" ? "bg-emerald-50 text-emerald-700" : r.outcome === "failed" ? "bg-rose-50 text-rose-700" : "bg-warm-bg text-ink-muted"}`}>
                                  {OUTCOME_LABELS[r.outcome]}
                                </span>
                                {r.date && <span className="text-ink-muted">· {r.date}</span>}
                              </div>
                              {r.outcome === "failed" && r.failReason && (
                                <p className="text-rose-700 mt-0.5">
                                  {FAIL_REASON_LABELS[r.failReason]}
                                  {r.note && <span className="text-ink-soft"> — {r.note}</span>}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                      {a.notes && (
                        <p className="text-[11px] text-ink-soft mt-3">📝 {a.notes}</p>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
