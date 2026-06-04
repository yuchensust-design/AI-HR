"use client";

import {
  Application,
  DIRECTION_LABELS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/lib/tracker-types";

type Props = {
  applications: Application[];
  onEdit: (a: Application) => void;
  onDelete: (id: string) => void;
};

export function ApplicationTable({ applications, onEdit, onDelete }: Props) {
  if (applications.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-warm-bg/40 px-6 py-10 text-center text-sm text-ink-muted">
        还没有投递记录,点右上角"新增投递"开始记录。
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-foreground/10 bg-card">
      <table className="min-w-full text-sm">
        <thead className="bg-warm-bg/60 text-xs uppercase tracking-wide text-ink-muted">
          <tr>
            <th className="px-3 py-2 text-left font-medium">行业 · 岗位</th>
            <th className="px-3 py-2 text-left font-medium">方向</th>
            <th className="px-3 py-2 text-left font-medium">投递</th>
            <th className="px-3 py-2 text-left font-medium">状态</th>
            <th className="px-3 py-2 text-left font-medium">简历版本</th>
            <th className="px-3 py-2 text-left font-medium">备注</th>
            <th className="px-3 py-2 text-right font-medium">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {applications.map((a) => (
            <tr key={a.id} className="hover:bg-warm-bg/40">
              <td className="px-3 py-2 align-top">
                <div className="font-medium text-ink leading-tight">{a.role}</div>
                <div className="text-xs text-ink-muted">{a.industry}</div>
                {a.isSample && (
                  <span className="inline-block mt-1 text-[10px] text-ink-muted bg-esther-yellow/30 px-1.5 py-0.5 rounded">
                    示例
                  </span>
                )}
              </td>
              <td className="px-3 py-2 align-top text-ink-soft">
                {DIRECTION_LABELS[a.direction]}
              </td>
              <td className="px-3 py-2 align-top text-ink-soft whitespace-nowrap text-xs">
                {a.appliedAt}
              </td>
              <td className="px-3 py-2 align-top">
                <span
                  className={`inline-flex items-center rounded-full text-xs px-2 py-0.5 ring-1 ${STATUS_COLORS[a.status]}`}
                >
                  {STATUS_LABELS[a.status]}
                </span>
                <div className="text-[10px] text-ink-muted mt-1">
                  更新 {a.statusUpdatedAt}
                </div>
              </td>
              <td className="px-3 py-2 align-top text-ink-soft text-xs">
                {a.resumeVersion || "—"}
              </td>
              <td className="px-3 py-2 align-top text-ink-soft text-xs max-w-[18rem]">
                <span className="line-clamp-2">{a.notes || "—"}</span>
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
                  onClick={() => {
                    if (confirm("确认删除这条投递记录?")) onDelete(a.id);
                  }}
                  className="text-rose-500 hover:text-rose-700 text-xs"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
