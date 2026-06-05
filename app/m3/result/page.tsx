"use client";

import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useM3DBSync } from "@/lib/sync/useM3DBSync";
import {
  EditSuggestionCard,
  type EditSuggestion,
  type Decision,
  type GapAlertDecision,
  type RejectReason,
} from "@/components/EditSuggestionCard";
import { GapAlertCard } from "@/components/GapAlertCard";
import { DiffMetricsTable, type LlmMetrics } from "@/components/DiffMetricsTable";
import { M3DataDashboard } from "@/components/M3DataDashboard";
import { JDKeywordsBar } from "@/components/JDKeywordsBar";
import {
  computeRuleMetrics,
  extractV1Bullets,
  extractV2Bullets,
  type RuleMetrics,
} from "@/lib/diff-metrics";
import { ensureResumeIds } from "@/lib/m3-id-helpers";

/**
 * 模块 3 / Phase 5 Interactive Review-Confirm(2026-06-02 redesigned per user feedback)
 *
 * 左:实时简历预览(应用 accept 后改动)
 * 右:N 条改动建议卡片,逐条 accept/reject/regen
 * 顶部固定:「我看完了 → 下载 Word」
 */

type Status = "loading" | "ready" | "error";

type SuggestEditsResult = {
  edits: EditSuggestion[];
  default_accept_count: number;
  optimization_summary: string;
  used_supplements: string[];
  inferred_persona: string;
};

type DecisionsMap = Record<string, Decision>;
type RewrittenMap = Record<string, string>;
type GapDecisionsMap = Record<string, GapAlertDecision>;

type AnyBullet = { text?: string; narrative_tag?: string } | string;
type ParsedResume = {
  basic?: { name?: string | null; major?: string | null; year_level?: string | null };
  experience?: { org?: string; role?: string; period?: string; bullets?: AnyBullet[] }[];
  projects?: { name?: string; period?: string; bullets?: AnyBullet[] }[];
  activities?: { org?: string; role?: string; period?: string; bullets?: AnyBullet[] }[];
  skills?: Record<string, string[]>;
  meta?: { narrative_tag_distribution?: Record<string, number> };
} | null;
type JdCtx = {
  jd_summary?: string;
  must_have?: string[];
  gaps?: { fixable?: string }[];
  /** plan offer-1-sparkling-hippo P1:M6 跳过来但没拿到 JD 全文 → true,UI 展示低置信提示 */
  placeholder_mode?: boolean;
  role_name?: string;
  company?: string;
} | null;
type HiddenList = unknown[];
type RejectionMap = Record<string, RejectReason>;
type FromDebriefHighlight = { evidence: string; source_question?: string } | null;

export default function ResultPage() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="min-h-screen bg-warm-bg">
            <div className="h-20" />
            <div className="text-center text-ink-muted py-20">加载中…</div>
          </main>
        </>
      }
    >
      <ResultContent />
    </Suspense>
  );
}

function ResultContent() {
  const router = useRouter();
  const { isLoggedInWithConv, dbData, convQs, saveField } = useM3DBSync();

  const [localParsedResume, setLocalParsedResume] = useLocalState<ParsedResume>(STORAGE_KEYS.PARSED_RESUME, null);
  const [localJdContext] = useLocalState<JdCtx>(STORAGE_KEYS.JD_CONTEXT, null);
  const [localHidden, setLocalHidden] = useLocalState<HiddenList>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);
  const [, setRejectionReasons] = useLocalState<RejectionMap>(
    STORAGE_KEYS.M3_REJECTION_REASONS,
    {},
  );

  const parsedResume = (isLoggedInWithConv ? dbData?.parsed_resume_json ?? null : localParsedResume) as ParsedResume;
  const jdContext = (isLoggedInWithConv ? dbData?.jd_context_json ?? null : localJdContext) as JdCtx;
  const hiddenExperiences = (isLoggedInWithConv
    ? (Array.isArray(dbData?.hidden_experience_json) ? dbData!.hidden_experience_json : [])
    : localHidden) as HiddenList;

  const setHiddenExperiences = useCallback(
    async (next: HiddenList | ((prev: HiddenList) => HiddenList)) => {
      const resolved = typeof next === "function" ? (next as (p: HiddenList) => HiddenList)(hiddenExperiences) : next;
      setLocalHidden(resolved);
      if (isLoggedInWithConv) await saveField("hidden_experience_json", resolved);
    },
    [hiddenExperiences, isLoggedInWithConv, saveField, setLocalHidden],
  );

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<SuggestEditsResult | null>(null);
  const [decisions, setDecisions] = useState<DecisionsMap>({});
  const [rewritten, setRewritten] = useState<RewrittenMap>({});
  const [gapDecisions, setGapDecisions] = useState<GapDecisionsMap>({});
  const [gapFillBusyId, setGapFillBusyId] = useState<string | null>(null);
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [fromDebriefHighlight, setFromDebriefHighlight] = useState<FromDebriefHighlight>(null);
  const [highlightedKeyword, setHighlightedKeyword] = useState<string | null>(null);

  // Live Diff 6 维表 state(2026-06-04)
  const [llmMetrics, setLlmMetrics] = useState<LlmMetrics | null>(null);
  const [llmJdKeywords, setLlmJdKeywords] = useState<string[]>([]);
  const [llmMatchedKeywords, setLlmMatchedKeywords] = useState<string[]>([]);
  const [llmGapBreakdown, setLlmGapBreakdown] = useState<{ easy: number; mid: number; hard: number }>({
    easy: 0,
    mid: 0,
    hard: 0,
  });
  const [llmMetricsRefreshing, setLlmMetricsRefreshing] = useState(false);

  // 读模块 5 复盘 highlight(不持久化在 STORAGE_KEYS 里,直接读 raw key,fail-safe)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("from_debrief_highlight");
      if (raw) setFromDebriefHighlight(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // P0-B(offer-1-sparkling-hippo):为 parsedResume 注入稳定 bullet/item ID,
  // Live Preview 写回时优先按 ID 找,避免章节重排后 target 字符串失配。
  // 幂等:hasAllResumeIds 检测,已齐全则不触发 setter。
  useEffect(() => {
    if (!parsedResume) return;
    const withIds = ensureResumeIds(parsedResume);
    if (withIds === parsedResume) return; // 已经齐全,不重写
    if (isLoggedInWithConv) {
      saveField("parsed_resume_json", withIds);
    } else {
      setLocalParsedResume(withIds);
    }
  }, [parsedResume, isLoggedInWithConv, saveField, setLocalParsedResume]);

  const loadSuggestions = useCallback(async () => {
    if (!parsedResume) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/m3/suggest-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          fromDebriefHighlight: fromDebriefHighlight ?? null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as SuggestEditsResult;
      setData(parsed);

      // Auto-accept 风险分级(offer-1-sparkling-hippo):
      // 仅放行 claim_type === "explicit" && priority === "high" 的 edit。
      // inferred / needs_confirmation / forbidden 一律保持待确认,由用户手动决策。
      // 老数据没 claim_type 时按 needs_confirmation 兜底,因此老 demo 也会变成"保守模式"。
      const initialDecisions: DecisionsMap = {};
      const safeAutoAcceptable = parsed.edits.filter(
        (e) => e.priority === "high" && e.claim_type === "explicit",
      );
      const autoAcceptCount = Math.min(
        parsed.default_accept_count ?? 3,
        safeAutoAcceptable.length,
      );
      for (let i = 0; i < autoAcceptCount; i++) {
        initialDecisions[safeAutoAcceptable[i].id] = "accept";
      }
      setDecisions(initialDecisions);
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      setErrorMsg(message);
      setStatus("error");
    }
  }, [parsedResume, jdContext, hiddenExperiences, fromDebriefHighlight]);

  useEffect(() => {
    if (parsedResume && !data && status === "loading") {
      loadSuggestions();
    }
  }, [parsedResume, data, status, loadSuggestions]);

  function handleAccept(id: string) {
    setDecisions((d) => ({ ...d, [id]: "accept" }));
  }
  function handleReject(id: string, reason: RejectReason) {
    setDecisions((d) => ({ ...d, [id]: "reject" }));
    setRejectionReasons((m) => ({ ...m, [id]: reason }));
  }
  function handleKeywordClick(keyword: string) {
    setHighlightedKeyword((cur) => (cur === keyword ? null : keyword));
    // 滚到 JDKeywordsBar
    if (typeof document !== "undefined") {
      const el = document.querySelector<HTMLSpanElement>(`[data-keyword="${keyword}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }
  // === Live Diff 6 维表 computation(纯前端 4 维规则实时)===

  // 收集所有 accepted edits(含 rewritten 文本)
  const acceptedEditsForDiff = useMemo(() => {
    if (!data) return [];
    return data.edits
      .filter((e) => decisions[e.id] === "accept" && e.category !== "gap-alert")
      .map((e) => ({
        target: e.target,
        original_text: e.original_text,
        suggested_text: rewritten[e.id] ?? e.suggested_text,
      }));
  }, [data, decisions, rewritten]);

  const v1Bullets = useMemo(() => extractV1Bullets(parsedResume), [parsedResume]);
  const v2Bullets = useMemo(
    () => extractV2Bullets(parsedResume, acceptedEditsForDiff),
    [parsedResume, acceptedEditsForDiff]
  );

  const ruleV1: RuleMetrics = useMemo(
    () => computeRuleMetrics(v1Bullets, llmJdKeywords),
    [v1Bullets, llmJdKeywords]
  );
  const ruleV2: RuleMetrics = useMemo(
    () => computeRuleMetrics(v2Bullets, llmJdKeywords),
    [v2Bullets, llmJdKeywords]
  );

  // 调 diff-metrics API(LLM 评估 STAR + 硬门槛 + jd_keywords 扩展)
  const loadLlmMetrics = useCallback(async () => {
    if (v1Bullets.length === 0 && v2Bullets.length === 0) return;
    setLlmMetricsRefreshing(true);
    try {
      const res = await fetch("/api/m3/diff-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          v1Bullets,
          v2Bullets,
          jdContext: jdContext ?? null,
          parsedResumeBasic: parsedResume?.basic ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = (await res.json()) as LlmMetrics & {
        jd_keywords?: string[];
        matched_keywords?: string[];
        gap_breakdown?: { easy: number; mid: number; hard: number };
      };
      setLlmMetrics({
        star_complete_v1: parsed.star_complete_v1,
        star_complete_v2: parsed.star_complete_v2,
        hard_req_total: parsed.hard_req_total,
        hard_req_v1_aligned: parsed.hard_req_v1_aligned,
        hard_req_v2_aligned: parsed.hard_req_v2_aligned,
        hard_req_items: parsed.hard_req_items ?? [],
        llm_explain: parsed.llm_explain ?? "",
      });
      if (parsed.jd_keywords && parsed.jd_keywords.length > 0) {
        setLlmJdKeywords(parsed.jd_keywords);
      }
      if (parsed.matched_keywords) {
        setLlmMatchedKeywords(parsed.matched_keywords);
      }
      if (parsed.gap_breakdown) {
        setLlmGapBreakdown(parsed.gap_breakdown);
      }
    } catch (err) {
      console.error("[loadLlmMetrics] failed:", err);
    } finally {
      setLlmMetricsRefreshing(false);
    }
  }, [v1Bullets, v2Bullets, jdContext, parsedResume]);

  // 进 ready 状态后自动跑 1 次 LLM diff-metrics
  useEffect(() => {
    if (status === "ready" && data && !llmMetrics && !llmMetricsRefreshing) {
      loadLlmMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);

  // === gap-alert handlers (2026-06-02 v2) ===
  async function handleGapFill(edit: EditSuggestion, userInput: string) {
    setGapFillBusyId(edit.id);
    try {
      // 1. 把用户的简短经历转成 STAR(调 excavate API 的 answer action,简化版)
      const dummyQ = {
        id: `gap-fill-${edit.id}`,
        topic_name: edit.jd_requirement_text ?? "JD 缺口",
        context_intro: edit.suggested_text,
        options: [],
        fill_prompt: "",
        none_label: "",
      };
      const dummyAnswer = {
        option_letters: [],
        fill_text: userInput,
      };
      const res = await fetch("/api/m3/excavate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          question: dummyQ,
          userAnswer: dummyAnswer,
          parsedResume,
          jdContext: jdContext ?? null,
        }),
      });
      const parsed = await res.json();

      // 2. append 到 hidden_experiences
      if (!parsed.skipped && parsed.candidate_bullets && parsed.candidate_bullets.length > 0) {
        const newHidden = {
          question_id: dummyQ.id,
          topic_name: edit.jd_requirement_text ?? "JD 缺口补充",
          raw_user_material: parsed.raw_user_material ?? userInput,
          star_breakdown: parsed.star_breakdown ?? null,
          candidate_bullets: parsed.candidate_bullets,
        };
        setHiddenExperiences((arr) => [...(arr ?? []), newHidden]);
      }

      // 3. 标记 gap decision
      setGapDecisions((d) => ({ ...d, [edit.id]: { kind: "filled", user_input: userInput } }));

      // 4. 重跑 suggest-edits(因为 hidden_experiences 变了)
      // 注意:setHiddenExperiences 是异步的,这里手动构造新数组传过去
      setTimeout(() => {
        loadSuggestions();
      }, 300);
    } catch (err) {
      console.error("gap fill failed:", err);
    } finally {
      setGapFillBusyId(null);
    }
  }

  function handleGapAcknowledge(editId: string) {
    setGapDecisions((d) => ({ ...d, [editId]: { kind: "acknowledged" } }));
  }

  function handleGapRedirectProject(editId: string) {
    setGapDecisions((d) => ({ ...d, [editId]: { kind: "redirect-project" } }));
    setTimeout(() => router.push("/m4"), 800); // m4 是另一模块,不带 m3 convId
  }

  async function handleRegen(edit: EditSuggestion) {
    setRegenBusyId(edit.id);
    try {
      const res = await fetch("/api/m3/rewrite-bullet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          edit,
          parsedResume,
          jdContext: jdContext ?? null,
        }),
      });
      const parsed = await res.json();
      if (parsed.suggested_text) {
        setRewritten((r) => ({ ...r, [edit.id]: parsed.suggested_text }));
      }
    } catch (err) {
      console.error("regen failed:", err);
    } finally {
      setRegenBusyId(null);
    }
  }

  async function handleDownload() {
    if (!data) return;
    setDownloading(true);
    try {
      // 收集 accept 的 edits(含 rewritten)
      const acceptedEdits = data.edits
        .filter((e) => decisions[e.id] === "accept")
        .map((e) => ({ ...e, suggested_text: rewritten[e.id] ?? e.suggested_text }));

      const res = await fetch("/api/m3/finalize-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          acceptedEdits,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const finalized = await res.json();

      // 用 finalized.markdown 走 export-docx
      const docxRes = await fetch("/api/m3/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: finalized.markdown,
          basic: parsedResume?.basic,
          targetRole: jdContext?.jd_summary ?? "通用版",
        }),
      });
      if (!docxRes.ok) throw new Error(`docx HTTP ${docxRes.status}`);
      const blob = await docxRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      a.download = `resume_${parsedResume?.basic?.name ?? "user"}_${datePart}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "下载失败";
      setErrorMsg(message);
    } finally {
      setDownloading(false);
    }
  }

  // 统计
  const acceptedCount = Object.values(decisions).filter((d) => d === "accept").length;
  const rejectedCount = Object.values(decisions).filter((d) => d === "reject").length;
  const pendingCount = (data?.edits.length ?? 0) - acceptedCount - rejectedCount;

  // gap_breakdown 兜底:LLM 没返回时根据 jdContext.gaps 现算(纯规则)
  const gapBreakdownFallback = useMemo(() => {
    const gaps = jdContext?.gaps ?? [];
    const b = { easy: 0, mid: 0, hard: 0 };
    for (const g of gaps) {
      const f = String(g?.fixable ?? "");
      if (f.includes("易补")) b.easy++;
      else if (f.includes("中等")) b.mid++;
      else if (f.includes("难补")) b.hard++;
    }
    return b;
  }, [jdContext]);

  const effectiveGapBreakdown =
    llmGapBreakdown.easy + llmGapBreakdown.mid + llmGapBreakdown.hard > 0
      ? llmGapBreakdown
      : gapBreakdownFallback;

  if (!parsedResume) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center p-6">
          <Card className="p-6 max-w-md">
            <p className="text-sm text-ink mb-3">⚠️ 还没读到你的简历</p>
            <Link
              href="/m3/upload"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              先去上传 →
            </Link>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg">
        <div className="h-20" />

        {/* 顶部 sticky 提交栏 */}
        {data && (
          <section className="sticky top-20 z-30 bg-warm-bg/95 backdrop-blur-sm border-b border-border shadow-sm">
            <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap text-xs">
                <Badge className="bg-esther-yellow text-ink px-2 py-1">Phase 5 / 5</Badge>
                <span className="text-ink-soft">
                  共 <strong className="text-ink">{data.edits.length}</strong> 处建议 ·
                  <span className="ml-2 text-esther-blue font-medium">已采纳 {acceptedCount}</span>
                  <span className="ml-2 text-ink-muted">维持 {rejectedCount}</span>
                  <span className="ml-2 text-esther-red">待审 {pendingCount}</span>
                </span>
                {data.inferred_persona && data.inferred_persona !== "未判定" && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-blue/10 text-esther-blue text-[10px] font-medium">
                    persona: {data.inferred_persona}
                  </span>
                )}
              </div>
              <button
                onClick={handleDownload}
                disabled={downloading || acceptedCount === 0}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {downloading ? "生成中..." : "✓ 我看完了 → 下载 Word"}
              </button>
            </div>
          </section>
        )}

        {/* Header */}
        <section className="border-b border-border">
          <div className="max-w-[1400px] mx-auto px-6 py-6">
            <Link
              href="/m3/excavate"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-3"
            >
              ← 回 Phase 3
            </Link>
            <h1 className="text-2xl md:text-3xl font-bold text-ink mb-1 leading-tight">
              逐条确认改动 → 下载 Word
            </h1>
            <p className="text-ink-soft text-sm">
              AI 给了几条建议,你逐条决定要不要改 · 任何时候可以下载
            </p>
            <p className="text-xs text-ink-muted mt-3 leading-relaxed bg-warm-bg-deep/40 border border-border rounded-md px-3 py-2">
              ℹ️ Offer 捕手只重组你提供过的素材,不会替你发明经历。每条建议都标注来源(JD / 简历 / 经历挖掘 / 面试),你可以逐条拒绝、修改或覆盖。
            </p>
            {/* placeholder_mode 提示(plan offer-1-sparkling-hippo P1):M6 跳过来但没拿到 JD 全文 */}
            {jdContext?.placeholder_mode && (
              <div className="mt-3 leading-relaxed bg-esther-yellow/15 border border-esther-yellow/50 rounded-md px-3 py-2">
                <p className="text-xs text-ink">
                  ⚠️ <strong>岗位摘要模式</strong>:当前 JD 全文未能从 M6 抓到(可能是平台反爬或岗位下架),仅基于
                  <span className="font-medium"> {jdContext.role_name ?? "(岗位名)"}{jdContext.company ? ` @ ${jdContext.company}` : ""} </span>
                  做岗位推断。
                </p>
                <p className="text-[11px] text-ink-soft mt-1">
                  本次所有改写建议的 claim_type 已自动降级为 <code className="font-mono text-ink">inferred</code>(置信度 medium),
                  建议你回 M6 点开原始岗位页面手动复制 JD 后回来重做一次。
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 加载中 */}
        {status === "loading" && (
          <div className="max-w-[1400px] mx-auto px-6 py-20">
            <Card className="p-8 border-2 border-border bg-warm-bg-deep/30 text-center">
              <p className="text-base text-ink-soft">🤖 AI 在分析你的简历 + JD,产出改动建议(~10-20 秒)...</p>
              <p className="text-xs text-ink-muted mt-2">
                动态路由 prompt 长度 ~3000 字(比 7 段全塞省 22% token)
              </p>
            </Card>
          </div>
        )}

        {/* 错误 */}
        {status === "error" && (
          <div className="max-w-[1400px] mx-auto px-6 py-20">
            <Card className="p-6 border-2 border-esther-red/30 bg-esther-red/5">
              <p className="text-sm text-esther-red mb-3">⚠️ {errorMsg}</p>
              <button
                onClick={loadSuggestions}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                重试 →
              </button>
            </Card>
          </div>
        )}

        {/* Ready */}
        {status === "ready" && data && (
          <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-4">
            {/* PM 06 §3.4 #1 + #5 — 顶部数据看板 + 反编造文案 */}
            <M3DataDashboard
              data={{
                jdKeywordsCount: llmJdKeywords.length,
                matchedKeywordsCount: llmMatchedKeywords.length,
                gapBreakdown: effectiveGapBreakdown,
                acceptedCount,
                totalEditsCount: data.edits.length,
              }}
            />
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-warm-bg-deep/30">
              <span className="text-base">🛡️</span>
              <p className="text-[11px] text-ink-soft leading-snug">
                <span className="text-ink font-medium">Offer 捕手</span>
                只会重组和追问你提供过的信息,不会替你发明经历。
                每条建议都标了 <span className="font-medium text-esther-blue">来源 · 置信度 · 对应 JD 关键词</span>,可逐条 audit。
              </p>
            </div>

            {/* JD 关键词条 — 让 "对应关键词" 可视化 */}
            <JDKeywordsBar
              keywords={llmJdKeywords}
              matched={llmMatchedKeywords}
              highlighted={highlightedKeyword}
            />

            {fromDebriefHighlight && (
              <Card className="p-3 border-2 border-purple-500/30 bg-purple-500/5">
                <p className="text-[11px] text-purple-700 leading-relaxed">
                  💡 已读到模块 5 面试复盘高价值答案,AI 会优先把它整理成一条
                  <span className="font-medium ml-1">来自面试回写</span>的建议。
                </p>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
            {/* 左:简历预览(简化版 — 列原始 bullet + 标 accepted/rejected) */}
            <div className="lg:sticky lg:top-44 lg:self-start lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto">
              <Card className="p-5 border-2 border-border bg-card">
                <p className="font-display italic text-xs text-esther-blue mb-2">Live Preview</p>
                <h3 className="text-sm font-semibold text-ink mb-3">
                  📄 简历当前状态({acceptedCount} 处已改)
                </h3>
                <ResumePreview
                  parsedResume={parsedResume}
                  edits={data.edits}
                  decisions={decisions}
                  rewritten={rewritten}
                />
              </Card>
            </div>

            {/* 右:Live Diff 6 维表 + 改动建议卡片列表 */}
            <div className="space-y-4">
              <Card className="p-4 border-2 border-esther-blue/30 bg-esther-blue/5">
                <p className="text-sm text-ink-soft leading-relaxed">
                  💡 {data.optimization_summary}
                </p>
                <p className="text-[11px] text-ink-muted mt-1">
                  used skills: <span className="font-mono">{data.used_supplements.join(", ")}</span>
                </p>
              </Card>

              {/* 6 维客观差异表(2026-06-04 用户需求)*/}
              <DiffMetricsTable
                ruleV1={ruleV1}
                ruleV2={ruleV2}
                llm={llmMetrics}
                onRefreshLlm={loadLlmMetrics}
                refreshing={llmMetricsRefreshing}
              />


              {(() => {
                const gapAlerts = data.edits.filter((e) => e.category === "gap-alert");
                const regularEdits = data.edits.filter((e) => e.category !== "gap-alert");
                return (
                  <>
                    {/* 顶部 Gap-Alert section(2026-06-02 v2)*/}
                    {gapAlerts.length > 0 && (
                      <Card className="p-4 border-2 border-esther-red/40 bg-esther-red/5">
                        <p className="font-display italic text-xs text-esther-red mb-2">
                          JD Gaps
                        </p>
                        <h3 className="text-base font-semibold text-ink mb-1">
                          📋 JD 还要求这些,你简历没体现({gapAlerts.length})
                        </h3>
                        <p className="text-xs text-ink-soft leading-relaxed">
                          每条决定 3 选 1:你有相关经验?确实没有?打算做项目补?
                          只列「易补」+「中等」的(难补 ≥3 月 已过滤,应去模块 E.2 项目设计)。
                        </p>
                      </Card>
                    )}

                    {gapAlerts.map((edit) => (
                      <GapAlertCard
                        key={edit.id}
                        edit={edit}
                        decision={gapDecisions[edit.id] ?? null}
                        onFill={(input) => handleGapFill(edit, input)}
                        onAcknowledge={() => handleGapAcknowledge(edit.id)}
                        onRedirectProject={() => handleGapRedirectProject(edit.id)}
                        fillBusy={gapFillBusyId === edit.id}
                      />
                    ))}

                    {/* 分隔:改写建议 */}
                    {gapAlerts.length > 0 && regularEdits.length > 0 && (
                      <div className="pt-3 border-t border-border">
                        <p className="font-display italic text-xs text-esther-blue mb-1">
                          Edit Suggestions
                        </p>
                        <h3 className="text-base font-semibold text-ink">
                          ✏️ 改写建议({regularEdits.length})
                        </h3>
                      </div>
                    )}

                    {regularEdits.map((edit) => (
                      <EditSuggestionCard
                        key={edit.id}
                        edit={edit}
                        decision={decisions[edit.id] ?? null}
                        rewrittenText={rewritten[edit.id] ?? null}
                        onAccept={() => handleAccept(edit.id)}
                        onReject={(reason) => handleReject(edit.id, reason)}
                        onRegen={() => handleRegen(edit)}
                        regenBusy={regenBusyId === edit.id}
                        onKeywordClick={handleKeywordClick}
                      />
                    ))}
                  </>
                );
              })()}
            </div>
            </div>
            {/* Tracker 前置入口(plan offer-1-sparkling-hippo P2):简历版本 → Tracker 闭环 */}
            <div className="max-w-[1400px] mx-auto px-6 pb-12">
              <Card className="p-5 border-2 border-esther-blue/30 bg-esther-blue/5">
                <div className="flex items-start gap-4 flex-wrap">
                  <div className="flex-1 min-w-[280px]">
                    <p className="font-display italic text-xs text-esther-blue mb-1">
                      Next loop · Tracker
                    </p>
                    <h3 className="text-base font-semibold text-ink mb-1">
                      📊 改完简历就开始投递 — 投了什么、回了什么,一起跟踪
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      把这一版简历加进「投递追踪」,后续回复率 / 面试转化率自动算出来。10 条以上才出转化结论,样本不足时不乱给百分比。
                    </p>
                  </div>
                  <Link
                    href="/tracker"
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
                  >
                    去投递追踪 →
                  </Link>
                </div>
              </Card>
            </div>
          </div>
        )}

        <BuerFloatingButton />
      </main>
    </>
  );
}

// ============ Resume Preview 简化组件(inline) ============

function ResumePreview({
  parsedResume,
  edits,
  decisions,
  rewritten,
}: {
  parsedResume: ParsedResume;
  edits: EditSuggestion[];
  decisions: DecisionsMap;
  rewritten: RewrittenMap;
}) {
  function getBulletText(section: "experience" | "projects" | "activities", sectionIdx: number, bulletIdx: number, originalText: string): { text: string; status: "original" | "accepted" | "rejected" } {
    const target = `${section}[${sectionIdx}].bullets[${bulletIdx}]`;
    // 双轨 lookup(offer-1-sparkling-hippo P0-B):
    //   1. 先按 target 字符串匹配(最快,绝大多数 case 走这里)
    //   2. 再按 edit.bullet_id 匹配:lookup 当前 parsedResume 中相同 bullet_id 的 bullet 位置
    //   3. 再按 edit.original_text 模糊匹配:LLM 偶尔写错 target 时的兜底
    let matched = edits.find((e) => e.target === target);
    if (!matched) {
      // 解析当前位置的 bullet_id,再到 edits 里找 bullet_id 一致的
      const currentBulletId = (() => {
        const items = (parsedResume as Record<string, unknown>)?.[section];
        if (!Array.isArray(items)) return null;
        const it = items[sectionIdx] as { bullets?: Array<{ id?: string } | string> } | undefined;
        const b = it?.bullets?.[bulletIdx];
        if (!b || typeof b === "string") return null;
        return b.id ?? null;
      })();
      if (currentBulletId) {
        matched = edits.find((e) => e.bullet_id === currentBulletId);
      }
    }
    if (!matched) {
      // original_text 模糊匹配(70% 字符重叠)
      matched = edits.find((e) => {
        if (!e.original_text || e.original_text === "(新增)" || e.original_text === "(JD 缺口)") return false;
        if (e.original_text.length < 10 || originalText.length < 10) return false;
        const a = new Set(e.original_text.replace(/\s/g, ""));
        const b = new Set(originalText.replace(/\s/g, ""));
        const inter = [...a].filter((c) => b.has(c)).length;
        const union = new Set([...a, ...b]).size;
        return union > 0 && inter / union >= 0.7;
      });
    }
    if (!matched) return { text: originalText, status: "original" };
    const d = decisions[matched.id];
    if (d === "accept") return { text: rewritten[matched.id] ?? matched.suggested_text, status: "accepted" };
    return { text: originalText, status: d === "reject" ? "rejected" : "original" };
  }

  function renderBulletList(section: "experience" | "projects" | "activities", items: { bullets?: AnyBullet[] }[]) {
    return items.map((it, sIdx) => (it.bullets ?? []).map((b, bIdx) => {
      const orig = typeof b === "string" ? b : b.text ?? "";
      const { text, status } = getBulletText(section, sIdx, bIdx, orig);
      return (
        <li
          key={`${section}-${sIdx}-${bIdx}`}
          className={`text-[11px] leading-relaxed flex items-start gap-1.5 mb-1 ${
            status === "accepted" ? "bg-esther-blue/10 px-1 rounded" : ""
          }`}
        >
          <span className="text-esther-blue mt-1 flex-shrink-0">·</span>
          <span className={status === "accepted" ? "text-ink font-medium" : "text-ink-soft"}>
            {text}
            {status === "accepted" && <span className="text-esther-blue ml-1 text-[9px]">✓ 已改</span>}
          </span>
        </li>
      );
    }));
  }

  if (!parsedResume) return null;

  return (
    <div className="text-xs space-y-3 font-body-zh">
      {parsedResume.basic && (
        <div className="text-center pb-2 border-b border-border">
          <h2 className="text-lg font-bold text-ink">{parsedResume.basic.name ?? "—"}</h2>
          <p className="text-[10px] text-ink-soft mt-0.5">
            {parsedResume.basic.major}{parsedResume.basic.year_level ? ` · ${parsedResume.basic.year_level}` : ""}
          </p>
        </div>
      )}

      {(parsedResume.experience ?? []).length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-esther-blue border-b border-esther-blue/30 pb-0.5 mb-2">
            实习经历
          </h3>
          {(parsedResume.experience ?? []).map((e, sIdx) => (
            <div key={sIdx} className="mb-2">
              <p className="text-[11px] font-semibold text-ink">
                {e.org} · {e.role}
                {e.period && <span className="text-ink-muted font-normal ml-2">{e.period}</span>}
              </p>
              <ul>{renderBulletList("experience", [e])[0]}</ul>
            </div>
          ))}
        </div>
      )}

      {(parsedResume.projects ?? []).length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-esther-blue border-b border-esther-blue/30 pb-0.5 mb-2">
            项目经验
          </h3>
          {(parsedResume.projects ?? []).map((p, sIdx) => (
            <div key={sIdx} className="mb-2">
              <p className="text-[11px] font-semibold text-ink">
                {p.name}
                {p.period && <span className="text-ink-muted font-normal ml-2">{p.period}</span>}
              </p>
              <ul>{renderBulletList("projects", [p])[0]}</ul>
            </div>
          ))}
        </div>
      )}

      {(parsedResume.activities ?? []).length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-esther-blue border-b border-esther-blue/30 pb-0.5 mb-2">
            社团活动
          </h3>
          {(parsedResume.activities ?? []).map((a, sIdx) => (
            <div key={sIdx} className="mb-2">
              <p className="text-[11px] font-semibold text-ink">
                {a.org} · {a.role}
              </p>
              <ul>{renderBulletList("activities", [a])[0]}</ul>
            </div>
          ))}
        </div>
      )}

      {parsedResume.skills && (
        <div>
          <h3 className="text-xs font-bold text-esther-blue border-b border-esther-blue/30 pb-0.5 mb-2">
            技能
          </h3>
          <p className="text-[11px] text-ink-soft leading-relaxed">
            {Object.values(parsedResume.skills).flat().filter(Boolean).join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
