"use client";

import { useEffect, useState } from "react";
import {
  Application,
  ApplicationStatus,
  DIRECTION_LABELS,
  RoleDirection,
  STATUS_LABELS,
} from "@/lib/tracker-types";

type Props = {
  initial?: Application | null;
  onCancel: () => void;
  onSubmit: (a: Application) => void;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function genId(): string {
  return `app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const STATUS_KEYS = Object.keys(STATUS_LABELS) as ApplicationStatus[];
const DIRECTION_KEYS = Object.keys(DIRECTION_LABELS) as RoleDirection[];

export function ApplicationForm({ initial, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState<Application>(
    initial ?? {
      id: genId(),
      industry: "",
      role: "",
      direction: "ai_pm",
      appliedAt: todayISO(),
      resumeVersion: "",
      status: "to_apply",
      statusUpdatedAt: todayISO(),
      notes: "",
      isSample: false,
    },
  );

  // 状态变化时自动更新 statusUpdatedAt(只在用户改 status 时)
  const [statusTouched, setStatusTouched] = useState(false);
  useEffect(() => {
    if (statusTouched) {
      setForm((f) => ({ ...f, statusUpdatedAt: todayISO() }));
    }
  }, [form.status, statusTouched]);

  const isEdit = !!initial;
  const canSubmit = form.industry.trim() && form.role.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // 新建/编辑后的记录始终标 isSample = false(真实数据)
    onSubmit({ ...form, isSample: false });
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-ink/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-card w-full max-w-xl rounded-2xl p-6 ring-1 ring-foreground/10 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-xl text-ink">
            {isEdit ? "编辑投递记录" : "新增投递记录"}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-ink-muted hover:text-ink text-sm"
          >
            取消
          </button>
        </div>

        <div className="rounded-lg bg-warm-bg/60 px-3 py-2 text-xs text-ink-soft">
          只填行业 + 职位类型,不需要写公司名 — Offer 捕手不收集公司信息。
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-ink-soft">
            行业
            <input
              type="text"
              required
              value={form.industry}
              onChange={(e) => setForm({ ...form, industry: e.target.value })}
              placeholder="互联网 / AI 工具"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
            />
          </label>
          <label className="text-sm text-ink-soft">
            职位类型
            <input
              type="text"
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="AI 产品经理(实习)"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-ink-soft">
            方向
            <select
              value={form.direction}
              onChange={(e) =>
                setForm({ ...form, direction: e.target.value as RoleDirection })
              }
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
            >
              {DIRECTION_KEYS.map((d) => (
                <option key={d} value={d}>
                  {DIRECTION_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-soft">
            投递日期
            <input
              type="date"
              value={form.appliedAt}
              onChange={(e) => setForm({ ...form, appliedAt: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-ink-soft">
            状态
            <select
              value={form.status}
              onChange={(e) => {
                setStatusTouched(true);
                setForm({
                  ...form,
                  status: e.target.value as ApplicationStatus,
                });
              }}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
            >
              {STATUS_KEYS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-ink-soft">
            状态更新日期
            <input
              type="date"
              value={form.statusUpdatedAt}
              onChange={(e) =>
                setForm({ ...form, statusUpdatedAt: e.target.value })
              }
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>

        <label className="text-sm text-ink-soft block">
          简历版本(可选)
          <input
            type="text"
            value={form.resumeVersion}
            onChange={(e) =>
              setForm({ ...form, resumeVersion: e.target.value })
            }
            placeholder="v3 · AI PM 主投版"
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          />
        </label>

        <label className="text-sm text-ink-soft block">
          备注(可选)
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={3}
            placeholder="JD 强调的关键词、面试反馈、卡点等"
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          />
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark disabled:opacity-40"
          >
            {isEdit ? "保存修改" : "添加记录"}
          </button>
        </div>
      </form>
    </div>
  );
}
