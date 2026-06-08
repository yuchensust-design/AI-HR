"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  // Skeptical Recruiter 时机 3(anti-fab oc-m3-antifab)
  sr_question?: SRQuestion | null;
};

export type SRQuestion = {
  type: "数字怎来" | "角色是什么" | "结果是否归你";
  question: string;
  options: string[];
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

/** 匹配内联占位符「【请补充X】」(非全局,只用于 .test;捕获组取提示文案) */
const FILL_TEST = /【请补充[^】]*?】/;
const FILL_RE_G = /【(请补充[^】]*?)】/g;

/**
 * 把"改为"文本里的【请补充 X】渲染成【常驻内联输入框】(卡片内直接填,无需点开、无需逐个确认)。
 * 多个占位符可顺手 Tab/点着挨个填,边填边把整句写进草稿(onFill),用户填完一起点下面「采纳」。
 *
 * 关键:用 useRef 捕获首次的 canonical 文本(带全部占位符)只解析一次 — 这样自己填字触发的
 * 回写(rewritten 变)不会重渲染换掉占位符位置 → 输入框不丢焦点。换写法(suggested_text 变)
 * 时由父层 key 重挂载,重新捕获。
 */
function FillableSuggestion({
  text,
  onFill,
}: {
  text: string;
  onFill?: (newText: string) => void;
}) {
  // 只在挂载时捕获一次(后续 text 变化忽略,避免丢焦点;换写法靠父层 key 重挂载)
  const canonical = useRef(text).current;
  const [vals, setVals] = useState<Record<number, string>>({});

  const parts = useMemo(() => {
    const out: Array<{ kind: "text" | "blank"; value: string; idx?: number }> = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let bi = 0;
    const re = new RegExp(FILL_RE_G);
    while ((m = re.exec(canonical)) !== null) {
      if (m.index > last) out.push({ kind: "text", value: canonical.slice(last, m.index) });
      out.push({ kind: "blank", value: m[1], idx: bi++ });
      last = m.index + m[0].length;
    }
    if (last < canonical.length) out.push({ kind: "text", value: canonical.slice(last) });
    return out;
  }, [canonical]);

  function setVal(idx: number, v: string) {
    const next = { ...vals, [idx]: v };
    setVals(next);
    // 组装:每个占位符填了就替换,没填就保留【请补充X】(用户可稍后补 / 预览里仍能填)
    let i = 0;
    const assembled = canonical.replace(FILL_RE_G, (full) => {
      const filled = next[i]?.trim();
      i++;
      return filled ? filled : full;
    });
    onFill?.(assembled);
  }

  return (
    <p className="text-sm text-ink leading-relaxed font-medium">
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.value}</span>;
        const idx = p.idx!;
        const cur = vals[idx] ?? "";
        const ch = Math.max(p.value.length * 1.1, cur.length + 1, 6);
        return (
          <input
            key={i}
            type="text"
            value={cur}
            onChange={(e) => setVal(idx, e.target.value)}
            placeholder={p.value}
            style={{ width: `${ch}ch` }}
            disabled={!onFill}
            className="inline-block mx-0.5 align-baseline px-1.5 py-0.5 rounded border border-esther-yellow bg-esther-yellow/20 text-[13px] text-ink text-center placeholder:text-ink-muted placeholder:text-[12px] focus:outline-none focus:ring-1 focus:ring-esther-blue focus:bg-white focus:border-esther-blue transition-colors disabled:opacity-60"
          />
        );
      })}
    </p>
  );
}

export function EditSuggestionCard({
  edit,
  decision,
  rewrittenText,
  onAccept,
  onReject,
  onRegen,
  onCustomEdit,
  onFillPlaceholder,
  onRevert,
  onTalkToAI,
  talkActive,
  srAnswer,
  onSrAnswer,
  regenBusy,
  onKeywordClick,
}: {
  edit: EditSuggestion;
  decision: Decision;
  rewrittenText?: string | null;
  onAccept: () => void;
  onReject: (reason: RejectReason) => void;
  onRegen: () => void;
  /** §8.28 Wave 4: 用户自己改文案后保存,以 acceptWith custom text 落地 */
  onCustomEdit?: (text: string) => void;
  /** 用户在卡片里点击内联占位符【请补充X】填入数字 → 回填整句(回写 rewritten + 自动采纳) */
  onFillPlaceholder?: (filledText: string) => void;
  /** 已决策后直接切换回另一态(改回原文 / 改用建议),不弹 popover */
  onRevert?: (to: Decision) => void;
  /** 点击"针对这条跟 AI 说" — 把 chat 聚焦到这条 edit */
  onTalkToAI?: () => void;
  /** 当前 chat 是否正聚焦在这条 */
  talkActive?: boolean;
  /** ⚡ HR 追问预演:用户对 sr_question 的回答(已答则不为空) */
  srAnswer?: string;
  onSrAnswer?: (option: string) => void;
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
  // 还有没填的【请补充X】占位符 → 不允许采纳(必须先填完数字)
  const hasUnfilledBlank = FILL_TEST.test(finalSuggested);
  // claimType:旧数据无字段时按 needs_confirmation 兜底,避免老数据被当成"有据可写"自动采纳
  const claimType: ClaimType = edit.claim_type ?? "needs_confirmation";
  const claimMeta = CLAIM_TYPE_META[claimType];

  const [showRejectPopover, setShowRejectPopover] = useState(false);
  /** §8.28 Wave 4: inline 编辑模式 — 用户自己改文案 */
  const [editing, setEditing] = useState(false);
  const [draftText, setDraftText] = useState(finalSuggested);

  // 中文优先级 label
  const priorityCnLabel =
    edit.priority === "high" ? "重要" : edit.priority === "medium" ? "中" : "次要";

  function handleRejectClick() {
    setShowRejectPopover(true);
  }

  function handleRejectConfirm(reason: RejectReason) {
    setShowRejectPopover(false);
    onReject(reason);
  }

  return (
    <Card className={`p-3.5 transition-all ${priorityBorder}`}>
      {/* 头部 chips */}
      <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${
              edit.priority === "high"
                ? "bg-esther-red text-white"
                : edit.priority === "medium"
                ? "bg-esther-yellow text-ink"
                : "bg-warm-bg-deep text-ink-soft"
            }`}
          >
            {priorityCnLabel}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${cat.color}`}>
            {cat.label}
          </span>
          {/* claim_type 只在"需留意"时显示(推断/需确认/已拦截);安全的"有据可写"不占位 */}
          {claimType !== "explicit" && (
            <span
              title={claimMeta.hint}
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${claimMeta.color}`}
            >
              {claimMeta.label}
            </span>
          )}
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
          <div className="bg-card border border-border rounded-lg px-3 py-2 mb-1.5">
            <p className="text-[11px] text-ink-muted mb-0.5 font-display italic">原文</p>
            <p className="text-sm text-ink-soft leading-relaxed">{edit.original_text}</p>
          </div>
        </>
      ) : (
        <div className="bg-esther-yellow/15 border border-esther-yellow/40 rounded p-2 mb-2">
          <p className="text-[10px] text-ink mb-0">✨ 新增(从 Phase 3 挖到的隐藏经验)</p>
        </div>
      )}

      <div
        className={`border rounded-lg px-3 py-2 mb-2 ${
          decision === "accept"
            ? "bg-esther-blue/10 border-esther-blue/40"
            : "bg-warm-bg-deep/40 border-border"
        }`}
      >
        <p className="text-[11px] text-esther-blue mb-0.5 font-display italic">改为</p>
        {editing ? (
          <>
            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              rows={3}
              className="w-full text-sm text-ink leading-relaxed bg-card border border-esther-blue/40 rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
              autoFocus
            />
            <div className="flex items-center justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setDraftText(finalSuggested);
                  setEditing(false);
                }}
                className="text-[11px] text-ink-muted hover:text-ink"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = draftText.trim();
                  if (!t) return;
                  onCustomEdit?.(t);
                  setEditing(false);
                }}
                disabled={!draftText.trim() || draftText.trim() === finalSuggested.trim()}
                className="inline-flex items-center rounded-full bg-esther-blue text-white px-3 py-1 text-[11px] font-medium hover:bg-esther-blue-dark disabled:opacity-40"
              >
                ✓ 保存改写
              </button>
            </div>
          </>
        ) : decision !== "accept" && FILL_TEST.test(edit.suggested_text) && onFillPlaceholder ? (
          // 用【原始 suggested_text】判断 + 当 canonical:它永远带占位符,所以填完后输入框依旧在、可继续改;
          // 直到用户点「采纳」(decision=accept)才切成纯文字定稿。
          <FillableSuggestion
            key={edit.suggested_text}
            text={edit.suggested_text}
            onFill={onFillPlaceholder}
          />
        ) : (
          <p className="text-sm text-ink leading-relaxed font-medium">{finalSuggested}</p>
        )}
      </div>

      {/* reason */}
      <div className="mb-2 px-2 py-1.5 rounded bg-warm-bg-deep/30 border-l-2 border-esther-blue/40">
        <p className="text-sm text-ink-muted leading-relaxed">
          💬 {edit.reason}
        </p>
      </div>

      {/* ⚡ HR 追问预演 — Skeptical Recruiter(差异化卖点,直接在卡片上露出)*/}
      {edit.sr_question && (
        srAnswer ? (
          <div className="mb-2 px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200">
            <p className="text-xs text-amber-700 leading-relaxed">
              ⚡ HR 追问已确认 · <span className="font-medium">{srAnswer}</span>
            </p>
          </div>
        ) : (
          <div className="mb-2 px-2.5 py-2 rounded bg-amber-50 border border-amber-200">
            <p className="text-xs font-medium text-amber-700 mb-1.5">
              ⚡ HR 可能追问 · {edit.sr_question.type}
            </p>
            <p className="text-sm text-ink mb-2 leading-relaxed">{edit.sr_question.question}</p>
            <div className="flex flex-col gap-1">
              {edit.sr_question.options.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onSrAnswer?.(opt)}
                  className="text-left text-sm px-2.5 py-1.5 rounded bg-white hover:bg-amber-100 border border-amber-200 text-ink transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )
      )}

      {/* fab_warning — 未验证经历显式标 */}
      {edit.fab_warning && (
        <div className="mb-2 px-2 py-1.5 rounded bg-esther-red/10 border-l-2 border-esther-red">
          <p className="text-[10px] text-esther-red leading-relaxed font-medium">
            {edit.fab_warning}
          </p>
        </div>
      )}

      {/* 操作按钮 — 采纳/不采纳 可随时来回切换 */}
      <div className="flex items-center gap-2 mt-3 relative flex-wrap">
        {decision === "accept" && (
          <>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-esther-blue text-white text-sm font-medium">
              ✓ 已采纳
            </span>
            <button
              onClick={() => onRevert?.("reject")}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-sm hover:border-esther-red hover:text-esther-red transition-colors"
            >
              ↩ 改回原文
            </button>
          </>
        )}
        {decision === "reject" && (
          <>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-warm-bg-deep text-ink-soft text-sm">
              ✗ 维持原文
            </span>
            <button
              onClick={() => onRevert?.("accept")}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              ✓ 改用建议
            </button>
          </>
        )}
        {decision === null && (
          <>
            <button
              onClick={onAccept}
              disabled={hasUnfilledBlank}
              title={hasUnfilledBlank ? "请先把黄色框里的【请补充…】填完再采纳" : undefined}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-esther-blue"
            >
              {hasUnfilledBlank ? "✓ 采纳(先填数字)" : "✓ 采纳"}
            </button>
            <button
              onClick={handleRejectClick}
              className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-sm hover:border-esther-red hover:text-esther-red transition-colors"
            >
              ✗ 维持原文
            </button>
            {showRejectPopover && (
              <RejectPopover
                onConfirm={handleRejectConfirm}
                onCancel={() => setShowRejectPopover(false)}
              />
            )}
            {!editing && onCustomEdit && (
              <button
                onClick={() => {
                  setDraftText(finalSuggested);
                  setEditing(true);
                }}
                className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-sm hover:border-esther-blue hover:text-esther-blue transition-colors"
              >
                ✎ 我自己改
              </button>
            )}
          </>
        )}
        <button
          onClick={onRegen}
          disabled={regenBusy}
          className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-sm hover:border-esther-blue hover:text-esther-blue transition-colors disabled:opacity-40"
        >
          {regenBusy ? "..." : "🔁 换个拟法"}
        </button>
        {onTalkToAI && (
          <button
            onClick={onTalkToAI}
            className={`inline-flex items-center justify-center rounded-full px-3 py-1.5 text-sm transition-colors ${
              talkActive
                ? "bg-esther-yellow text-ink font-medium"
                : "border border-border bg-card text-ink-soft hover:border-esther-blue hover:text-esther-blue"
            }`}
          >
            💬 {talkActive ? "正在改这条" : "改这条"}
          </button>
        )}
      </div>
    </Card>
  );
}
