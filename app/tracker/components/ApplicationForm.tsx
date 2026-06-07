"use client";

import { useEffect, useState } from "react";
import {
  Application,
  ApplicationStatus,
  DIRECTION_LABELS,
  FAIL_REASON_LABELS,
  FailReason,
  InterviewRound,
  InterviewRoundType,
  OUTCOME_LABELS,
  RoleDirection,
  ROUND_TYPE_LABELS,
  RoundOutcome,
  STATUS_LABELS,
  genRoundId,
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
const ROUND_TYPE_KEYS = Object.keys(ROUND_TYPE_LABELS) as InterviewRoundType[];
const OUTCOME_KEYS = Object.keys(OUTCOME_LABELS) as RoundOutcome[];
const FAIL_REASON_KEYS = Object.keys(FAIL_REASON_LABELS) as FailReason[];

export function ApplicationForm({ initial, onCancel, onSubmit }: Props) {
  const [form, setForm] = useState<Application>(
    initial ?? {
      id: genId(),
      company: "",
      role: "",
      industry: "",
      direction: "ai_pm",
      appliedAt: todayISO(),
      resumeVersion: "",
      status: "to_apply",
      statusUpdatedAt: todayISO(),
      notes: "",
      isSample: false,
    },
  );

  const [statusTouched, setStatusTouched] = useState(false);
  useEffect(() => {
    if (statusTouched) {
      setForm((f) => ({ ...f, statusUpdatedAt: todayISO() }));
    }
  }, [form.status, statusTouched]);

  const isEdit = !!initial;
  const canSubmit = form.company.trim() && form.role.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
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
          <h3 className="font-bold text-lg text-ink">
            {isEdit ? "编辑投递记录" : "新增投递记录"}
          </h3>
          <button type="button" onClick={onCancel} className="text-ink-muted hover:text-ink text-sm">
            取消
          </button>
        </div>

        {/* 公司 + 岗位 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-ink-soft">
            公司名称 <span className="text-rose-400">*</span>
            <input
              type="text"
              required
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              placeholder="字节跳动 / 腾讯 / 小米…"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
            />
          </label>
          <label className="text-sm text-ink-soft">
            投递岗位 <span className="text-rose-400">*</span>
            <input
              type="text"
              required
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              placeholder="AI 产品经理实习 / 数据分析师…"
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
            />
          </label>
        </div>

        {/* 方向 + 投递日期 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-ink-soft">
            方向分类
            <select
              value={form.direction}
              onChange={(e) => setForm({ ...form, direction: e.target.value as RoleDirection })}
              className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
            >
              {DIRECTION_KEYS.map((d) => (
                <option key={d} value={d}>{DIRECTION_LABELS[d]}</option>
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

        {/* 状态 */}
        <label className="text-sm text-ink-soft block">
          当前状态
          <select
            value={form.status}
            onChange={(e) => {
              setStatusTouched(true);
              setForm({ ...form, status: e.target.value as ApplicationStatus });
            }}
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          >
            {STATUS_KEYS.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>

        {/* 备注 */}
        <label className="text-sm text-ink-soft block">
          备注(可选)
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="面试反馈、JD 关键要求、卡点等…"
            className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-ink"
          />
        </label>

        {/* 面试记录 */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-medium text-ink">真实面试记录(可选)</p>
            <button
              type="button"
              onClick={() => {
                const newRound: InterviewRound = { id: genRoundId(), type: "first_round", outcome: "pending" };
                setForm({ ...form, rounds: [...(form.rounds ?? []), newRound] });
              }}
              className="text-xs text-esther-blue hover:text-esther-blue-dark"
            >
              + 添加一轮
            </button>
          </div>
          <p className="text-[11px] text-ink-muted mb-3">
            记录真实面试发生了什么 — 哪轮过了、哪轮挂了、挂在哪里
          </p>

          {!form.rounds?.length ? (
            <p className="text-xs text-ink-muted italic px-3 py-2 rounded bg-warm-bg/40">
              还没有面试轮次
            </p>
          ) : (
            <ul className="space-y-3">
              {form.rounds.map((r, idx) => (
                <li key={r.id} className="rounded-lg border border-border bg-warm-bg/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-ink-muted">第 {idx + 1} 轮</span>
                    <select
                      value={r.type}
                      onChange={(e) => {
                        const next = [...(form.rounds ?? [])];
                        next[idx] = { ...r, type: e.target.value as InterviewRoundType };
                        setForm({ ...form, rounds: next });
                      }}
                      className="rounded border border-border bg-card px-2 py-1 text-xs"
                    >
                      {ROUND_TYPE_KEYS.map((t) => (
                        <option key={t} value={t}>{ROUND_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                    <select
                      value={r.outcome}
                      onChange={(e) => {
                        const next = [...(form.rounds ?? [])];
                        next[idx] = { ...r, outcome: e.target.value as RoundOutcome, failReason: e.target.value === "failed" ? r.failReason : undefined };
                        setForm({ ...form, rounds: next });
                      }}
                      className={`rounded border px-2 py-1 text-xs ${r.outcome === "passed" ? "border-emerald-300 bg-emerald-50 text-emerald-800" : r.outcome === "failed" ? "border-rose-300 bg-rose-50 text-rose-800" : "border-border bg-card"}`}
                    >
                      {OUTCOME_KEYS.map((o) => (
                        <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={r.date ?? ""}
                      onChange={(e) => {
                        const next = [...(form.rounds ?? [])];
                        next[idx] = { ...r, date: e.target.value };
                        setForm({ ...form, rounds: next });
                      }}
                      className="rounded border border-border bg-card px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, rounds: (form.rounds ?? []).filter((_, i) => i !== idx) })}
                      className="ml-auto text-xs text-rose-500 hover:text-rose-700"
                    >
                      ✕
                    </button>
                  </div>
                  {r.outcome === "failed" && (
                    <div className="space-y-2 pl-2 border-l-2 border-rose-200">
                      <select
                        value={r.failReason ?? ""}
                        onChange={(e) => {
                          const next = [...(form.rounds ?? [])];
                          next[idx] = { ...r, failReason: (e.target.value || undefined) as FailReason | undefined };
                          setForm({ ...form, rounds: next });
                        }}
                        className="rounded border border-border bg-card px-2 py-1 text-xs w-full"
                      >
                        <option value="">挂的原因…</option>
                        {FAIL_REASON_KEYS.map((k) => (
                          <option key={k} value={k}>{FAIL_REASON_LABELS[k]}</option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={r.note ?? ""}
                        onChange={(e) => {
                          const next = [...(form.rounds ?? [])];
                          next[idx] = { ...r, note: e.target.value };
                          setForm({ ...form, rounds: next });
                        }}
                        placeholder="比如：Transformer 原理答不上 / 被追问 SQL 窗口函数"
                        className="w-full rounded border border-border bg-card px-2 py-1 text-xs"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-sm text-ink-soft hover:text-ink">
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
