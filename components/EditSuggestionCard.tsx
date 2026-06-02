"use client";

import { Card } from "@/components/ui/card";

export type EditSuggestion = {
  id: string;
  target: string;
  original_text: string;
  suggested_text: string;
  evidence_source?: string;       // Anti-fabrication 透明化:LLM 必须声明素材来源
  fab_warning?: string | null;    // ⚠️ 未验证经历的标记
  reason: string;
  category: string;
  priority: "high" | "medium" | "low";
  // gap-alert 特有字段(2026-06-02 v2)
  jd_requirement_text?: string | null;
  fixable?: string | null;
};

// gap-alert 用户决策
export type GapAlertDecision =
  | { kind: "filled"; user_input: string }       // 用户补了一段
  | { kind: "acknowledged" }                      // 用户接受是个缺口
  | { kind: "redirect-project" }                  // 用户去做项目补
  | null;

export type Decision = "accept" | "reject" | null; // null = 待审

const CATEGORY_LABEL: Record<string, { label: string; color: string }> = {
  "narrative-tools": { label: "责任→成就", color: "bg-esther-blue/15 text-esther-blue" },
  "ats-keyword": { label: "ATS 关键词", color: "bg-esther-yellow text-ink" },
  "quantification": { label: "量化", color: "bg-esther-yellow text-ink" },
  "hidden-experience-add": { label: "加隐藏经验", color: "bg-esther-blue/15 text-esther-blue" },
  "career-translator": { label: "跨专业翻译", color: "bg-esther-blue/15 text-esther-blue" },
  "tech-deepening": { label: "技术深度", color: "bg-esther-blue/15 text-esther-blue" },
  "section-reorder": { label: "结构调整", color: "bg-warm-bg-deep text-ink-soft" },
  "section-add": { label: "加章节", color: "bg-warm-bg-deep text-ink-soft" },
  "gap-alert": { label: "📋 JD 缺口", color: "bg-esther-red/15 text-esther-red" },
};

const PRIORITY_STYLE: Record<string, string> = {
  high: "border-esther-red/40 bg-esther-red/5",
  medium: "border-esther-yellow/50 bg-esther-yellow/5",
  low: "border-border bg-card",
};

export function EditSuggestionCard({
  edit,
  decision,
  rewrittenText,
  onAccept,
  onReject,
  onRegen,
  regenBusy,
}: {
  edit: EditSuggestion;
  decision: Decision;
  rewrittenText?: string | null;
  onAccept: () => void;
  onReject: () => void;
  onRegen: () => void;
  regenBusy: boolean;
}) {
  const cat = CATEGORY_LABEL[edit.category] ?? { label: edit.category, color: "bg-warm-bg-deep text-ink-soft" };
  const priorityBorder = decision === "accept"
    ? "border-2 border-esther-blue bg-esther-blue/5"
    : decision === "reject"
    ? "border-2 border-border bg-warm-bg-deep/30 opacity-60"
    : `border-2 ${PRIORITY_STYLE[edit.priority] ?? PRIORITY_STYLE.medium}`;

  const finalSuggested = rewrittenText ?? edit.suggested_text;

  return (
    <Card className={`p-4 transition-all ${priorityBorder}`}>
      {/* 头部 chips */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
              edit.priority === "high"
                ? "bg-esther-red text-white"
                : edit.priority === "medium"
                ? "bg-esther-yellow text-ink"
                : "bg-warm-bg-deep text-ink-soft"
            }`}
          >
            {edit.priority.toUpperCase()}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color}`}>
            {cat.label}
          </span>
        </div>
        <span className="text-[10px] text-ink-muted font-mono">{edit.id}</span>
      </div>

      {/* 原文 → 改写 */}
      {edit.original_text && edit.original_text !== "(新增)" ? (
        <>
          <div className="bg-card border border-border rounded p-2.5 mb-2">
            <p className="text-[10px] text-ink-muted mb-1 font-display italic">原文</p>
            <p className="text-xs text-ink-soft leading-relaxed">{edit.original_text}</p>
          </div>
          <p className="text-center text-ink-muted my-1 text-xs">↓</p>
        </>
      ) : (
        <div className="bg-esther-yellow/15 border border-esther-yellow/40 rounded p-2 mb-2">
          <p className="text-[10px] text-ink mb-0">✨ 新增(从 Phase 3 挖到的隐藏经验)</p>
        </div>
      )}

      <div
        className={`border rounded p-2.5 mb-3 ${
          decision === "accept"
            ? "bg-esther-blue/10 border-esther-blue/40"
            : "bg-warm-bg-deep/40 border-border"
        }`}
      >
        <p className="text-[10px] text-esther-blue mb-1 font-display italic">改为</p>
        <p className="text-xs text-ink leading-relaxed font-medium">{finalSuggested}</p>
      </div>

      {/* reason */}
      <div className="mb-2 px-2 py-1.5 rounded bg-warm-bg-deep/30 border-l-2 border-esther-blue/40">
        <p className="text-[10px] text-ink-muted leading-relaxed">
          💬 {edit.reason}
        </p>
      </div>

      {/* evidence_source — Anti-fabrication 透明化 */}
      {edit.evidence_source && (
        <div className="mb-2 px-2 py-1 rounded bg-card border border-border">
          <p className="text-[10px] text-ink-muted leading-relaxed">
            📎 素材来源:
            <code className="ml-1 text-ink font-mono text-[10px]">
              {edit.evidence_source}
            </code>
          </p>
        </div>
      )}

      {/* fab_warning — 未验证经历显式标 */}
      {edit.fab_warning && (
        <div className="mb-3 px-2 py-1.5 rounded bg-esther-red/10 border-l-2 border-esther-red">
          <p className="text-[10px] text-esther-red leading-relaxed font-medium">
            {edit.fab_warning}
          </p>
        </div>
      )}

      {/* 3 按钮 */}
      <div className="flex items-center gap-2">
        {decision === "accept" && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-esther-blue text-white text-xs font-medium">
            ✓ 已采纳
          </span>
        )}
        {decision === "reject" && (
          <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-warm-bg-deep text-ink-soft text-xs">
            ✗ 维持原文
          </span>
        )}
        {decision === null && (
          <>
            <button
              onClick={onAccept}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors"
            >
              ✓ 采纳
            </button>
            <button
              onClick={onReject}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-xs hover:border-esther-red hover:text-esther-red transition-colors"
            >
              ✗ 维持原文
            </button>
          </>
        )}
        <button
          onClick={onRegen}
          disabled={regenBusy}
          className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-xs hover:border-esther-blue hover:text-esther-blue transition-colors disabled:opacity-40"
        >
          {regenBusy ? "..." : "🔁 换个拟法"}
        </button>
      </div>
    </Card>
  );
}
