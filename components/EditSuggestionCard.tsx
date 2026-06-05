"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

export type EditSource = "jd" | "resume" | "experience" | "interview";

/**
 * claimType — 反编造风险分级(offer-1-sparkling-hippo 新增)
 *
 * - explicit:        原文已经写明 / 数字已经给到 → 可直接采纳进简历
 * - inferred:        基于现有素材合理推断(如改"参与"为"主导"但用户没显式说) → 默认待确认
 * - needs_confirmation: 需要用户回答 "实际是这样吗?" 才能写入 (eg 转化率、量化效果)
 * - forbidden:       LLM 试图编造的内容,normalize 层已删除/降级 → 不允许进 Live Preview
 *
 * 自动 accept 仅放行 claimType === "explicit" && priority === "high"。
 * 其他 claimType 一律 status="待确认",等用户手动决策。
 */
export type ClaimType = "explicit" | "inferred" | "needs_confirmation" | "forbidden";

export type EditSuggestion = {
  id: string;
  target: string;
  /**
   * 稳定 bullet ID(offer-1-sparkling-hippo P0-B) — server 端通过 target 反查 parsedResume
   * 中对应 bullet 的稳定 id 后注入。Live Preview lookup 优先 by bullet_id,
   * 简历重新解析章节顺序变化后仍能写回正确 bullet。
   *
   * 老数据可能没有,Live Preview fallback 走 target 字符串 + original_text 模糊匹配。
   */
  bullet_id?: string;
  original_text: string;
  suggested_text: string;
  /** 反编造风险分级(offer-1-sparkling-hippo) — 旧数据可能没有,UI 按 "needs_confirmation" 兜底 */
  claim_type?: ClaimType;
  /**
   * 反编造审计:LLM 必须列出该建议的具体证据片段
   * 旧数据可能用 evidence_source 字符串字段表达,新数据用结构化数组
   */
  evidence_audit?: Array<{
    source: EditSource;
    excerpt: string; // 原文片段(不超过 120 字)
  }>;
  evidence_source?: string;       // Anti-fabrication 透明化:LLM 必须声明素材来源(向后兼容)
  source?: EditSource;            // PM 06 §3.4 #2 — 4 选 1 枚举
  confidence?: number;            // PM 06 §3.4 #2 — 0-1 置信度
  linked_jd_keyword?: string | null; // PM 06 §3.4 #3 — 对应 JD 关键词
  fab_warning?: string | null;    // ⚠️ 未验证经历的标记
  reason: string;
  category: string;
  priority: "high" | "medium" | "low";
  // gap-alert 特有字段(2026-06-02 v2)
  jd_requirement_text?: string | null;
  fixable?: string | null;
};

/** claimType → UI badge meta */
export const CLAIM_TYPE_META: Record<
  ClaimType,
  { label: string; color: string; hint: string }
> = {
  explicit: {
    label: "✓ 有据可写",
    color: "bg-esther-blue/15 text-esther-blue",
    hint: "原文 / 简历已直接给出该信息,可直接进 Live Preview",
  },
  inferred: {
    label: "≈ 合理推断",
    color: "bg-esther-yellow/40 text-ink",
    hint: "基于现有素材推断,默认待确认 — 你点采纳后才进 Live Preview",
  },
  needs_confirmation: {
    label: "? 需你确认",
    color: "bg-esther-yellow text-ink",
    hint: "建议里有数字 / 成果需要你确认实际情况,占位符待你补",
  },
  forbidden: {
    label: "⚠ 已拦截",
    color: "bg-esther-red/20 text-esther-red",
    hint: "LLM 试图编造未提供的数字 / 成果,normalize 层已替换为占位符",
  },
};

// 拒绝理由(PM 06 §3.4 #4)
export type RejectReasonKind = "not-fact" | "no-emphasis" | "no-evidence" | "other";

export type RejectReason = {
  kind: RejectReasonKind;
  note?: string;
  ts: number;
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

const SOURCE_META: Record<EditSource, { label: string; color: string; hint: string }> = {
  jd: {
    label: "来自 JD",
    color: "bg-esther-blue text-white",
    hint: "证据来自 JD 解析(must_have / gaps)",
  },
  resume: {
    label: "来自简历",
    color: "bg-warm-bg-deep text-ink",
    hint: "证据来自你简历原文",
  },
  experience: {
    label: "来自经历挖掘",
    color: "bg-esther-yellow text-ink",
    hint: "证据来自 Phase 3 隐藏经验挖掘",
  },
  interview: {
    label: "来自面试回写",
    color: "bg-purple-500 text-white",
    hint: "证据来自模块 5 面试复盘高价值答案",
  },
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const tone =
    value >= 0.85 ? "bg-esther-blue" : value >= 0.7 ? "bg-esther-yellow" : "bg-esther-red";
  const label =
    value >= 0.85
      ? "高 · 简历明确证据"
      : value >= 0.7
      ? "中 · 经验可推但需确认"
      : "低 · 仅追问,不直接写";

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[10px] text-ink-muted mb-0.5">
        <span>置信度</span>
        <span className="font-mono tabular-nums">{pct}% · {label}</span>
      </div>
      <div className="h-1 w-full rounded bg-warm-bg-deep/60 overflow-hidden">
        <div
          className={`h-full ${tone} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

const REJECT_OPTIONS: { kind: RejectReasonKind; label: string; hint: string }[] = [
  { kind: "not-fact", label: "不是事实", hint: "重要 · 帮 Anti-fab 收集模型偏差" },
  { kind: "no-emphasis", label: "不想强调", hint: "事实 OK,只是不在重点" },
  { kind: "no-evidence", label: "暂无证据", hint: "可以补一下经历再说" },
  { kind: "other", label: "其他", hint: "可加 1 句备注" },
];

function RejectPopover({
  onConfirm,
  onCancel,
}: {
  onConfirm: (reason: RejectReason) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<RejectReasonKind | null>(null);
  const [note, setNote] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancel();
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onCancel]);

  function confirm() {
    if (!selected) return;
    onConfirm({
      kind: selected,
      note: note.trim() || undefined,
      ts: Date.now(),
    });
  }

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full mt-2 z-40 w-72 p-3 rounded-lg border-2 border-esther-red/40 bg-card shadow-lg"
    >
      <p className="text-[11px] text-ink mb-2 font-medium">
        为什么维持原文?<span className="text-ink-muted font-normal"> · 理由会帮 Offer 捕手未来不重复推这条</span>
      </p>
      <div className="space-y-1 mb-2">
        {REJECT_OPTIONS.map((opt) => (
          <button
            key={opt.kind}
            type="button"
            onClick={() => setSelected(opt.kind)}
            className={[
              "w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors",
              selected === opt.kind
                ? "bg-esther-red/15 border border-esther-red/40 text-ink"
                : "bg-warm-bg-deep/30 border border-transparent text-ink-soft hover:bg-warm-bg-deep/60",
            ].join(" ")}
          >
            <span className="font-medium">{opt.label}</span>
            <span className="text-[10px] text-ink-muted ml-1.5">· {opt.hint}</span>
          </button>
        ))}
      </div>
      {selected === "other" && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="备注一句(可选)"
          rows={2}
          className="w-full text-[11px] p-1.5 rounded border border-border bg-card text-ink resize-none mb-2"
        />
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-[11px] text-ink-muted hover:text-ink"
        >
          取消
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={!selected}
          className="inline-flex items-center justify-center rounded-full bg-esther-red text-white px-3 py-1 text-[11px] font-medium hover:bg-esther-red/80 transition-colors disabled:opacity-40"
        >
          确认维持
        </button>
      </div>
    </div>
  );
}

export function EditSuggestionCard({
  edit,
  decision,
  rewrittenText,
  onAccept,
  onReject,
  onRegen,
  regenBusy,
  onKeywordClick,
}: {
  edit: EditSuggestion;
  decision: Decision;
  rewrittenText?: string | null;
  onAccept: () => void;
  onReject: (reason: RejectReason) => void;
  onRegen: () => void;
  regenBusy: boolean;
  onKeywordClick?: (keyword: string) => void;
}) {
  const cat = CATEGORY_LABEL[edit.category] ?? { label: edit.category, color: "bg-warm-bg-deep text-ink-soft" };
  const priorityBorder = decision === "accept"
    ? "border-2 border-esther-blue bg-esther-blue/5"
    : decision === "reject"
    ? "border-2 border-border bg-warm-bg-deep/30 opacity-60"
    : `border-2 ${PRIORITY_STYLE[edit.priority] ?? PRIORITY_STYLE.medium}`;

  const finalSuggested = rewrittenText ?? edit.suggested_text;
  const sourceMeta = edit.source ? SOURCE_META[edit.source] : null;
  const hasConfidence = typeof edit.confidence === "number";
  // claimType:旧数据无字段时按 needs_confirmation 兜底,避免老数据被当成"有据可写"自动采纳
  const claimType: ClaimType = edit.claim_type ?? "needs_confirmation";
  const claimMeta = CLAIM_TYPE_META[claimType];

  const [showRejectPopover, setShowRejectPopover] = useState(false);
  const [showEvidenceAudit, setShowEvidenceAudit] = useState(false);

  function handleRejectClick() {
    setShowRejectPopover(true);
  }

  function handleRejectConfirm(reason: RejectReason) {
    setShowRejectPopover(false);
    onReject(reason);
  }

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
          {sourceMeta && (
            <span
              title={sourceMeta.hint}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${sourceMeta.color}`}
            >
              {sourceMeta.label}
            </span>
          )}
          <span
            title={claimMeta.hint}
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${claimMeta.color}`}
          >
            {claimMeta.label}
          </span>
          {edit.linked_jd_keyword && (
            <button
              type="button"
              onClick={() => onKeywordClick?.(edit.linked_jd_keyword!)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-esther-yellow/40 text-ink hover:bg-esther-yellow transition-colors"
              title="点击在 JD 关键词条里高亮这个词"
            >
              🔗 {edit.linked_jd_keyword}
            </button>
          )}
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

      {/* evidence_source — Anti-fabrication 透明化(向后兼容字符串字段) */}
      {edit.evidence_source && !edit.evidence_audit?.length && (
        <div className="mb-2 px-2 py-1 rounded bg-card border border-border">
          <p className="text-[10px] text-ink-muted leading-relaxed">
            📎 素材来源:
            <code className="ml-1 text-ink font-mono text-[10px]">
              {edit.evidence_source}
            </code>
          </p>
        </div>
      )}

      {/* evidence_audit — 反编造工程化(offer-1-sparkling-hippo):可展开查看原始证据 */}
      {edit.evidence_audit && edit.evidence_audit.length > 0 && (
        <div className="mb-2 rounded border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={() => setShowEvidenceAudit((v) => !v)}
            className="w-full px-2 py-1.5 flex items-center justify-between text-left hover:bg-warm-bg-deep/30 transition-colors"
          >
            <p className="text-[10px] text-ink-muted">
              📎 证据审计 · {edit.evidence_audit.length} 处来源(点击{showEvidenceAudit ? "收起" : "展开"})
            </p>
            <span className="text-[10px] text-ink-muted">{showEvidenceAudit ? "▴" : "▾"}</span>
          </button>
          {showEvidenceAudit && (
            <div className="border-t border-border divide-y divide-border">
              {edit.evidence_audit.map((ev, i) => {
                const meta = SOURCE_META[ev.source];
                return (
                  <div key={i} className="px-2 py-1.5">
                    <p className="text-[9px] text-ink-muted mb-0.5">
                      <span className={`inline-block px-1 py-0 rounded text-[9px] font-medium ${meta.color} mr-1`}>
                        {meta.label}
                      </span>
                    </p>
                    <p className="text-[10px] text-ink leading-relaxed italic">
                      &ldquo;{ev.excerpt}&rdquo;
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* fab_warning — 未验证经历显式标 */}
      {edit.fab_warning && (
        <div className="mb-2 px-2 py-1.5 rounded bg-esther-red/10 border-l-2 border-esther-red">
          <p className="text-[10px] text-esther-red leading-relaxed font-medium">
            {edit.fab_warning}
          </p>
        </div>
      )}

      {/* confidence — PM §3.4 #2 */}
      {hasConfidence && <ConfidenceBar value={edit.confidence ?? 0} />}

      {/* 3 按钮 */}
      <div className="flex items-center gap-2 mt-3 relative">
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
              onClick={handleRejectClick}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-xs hover:border-esther-red hover:text-esther-red transition-colors"
            >
              ✗ 维持原文
            </button>
            {showRejectPopover && (
              <RejectPopover
                onConfirm={handleRejectConfirm}
                onCancel={() => setShowRejectPopover(false)}
              />
            )}
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
