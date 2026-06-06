"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useM3DBSync } from "@/lib/sync/useM3DBSync";
import {
  type EditSuggestion,
  type Decision,
  type RejectReason,
} from "@/components/EditSuggestionCard";
import { type LlmMetrics } from "@/components/DiffMetricsTable";
import { M3OptimizationStepper } from "@/components/M3OptimizationStepper";
import { M3ScoreDashboard, type M3DashboardData } from "@/components/M3ScoreDashboard";
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

type AnyBullet = { text?: string; narrative_tag?: string } | string;
type ParsedResume = {
  basic?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    school?: string | null;
    major?: string | null;
    year_level?: string | null;
    gpa?: string | null;
    location?: string | null;
  };
  education?: {
    school?: string;
    major?: string;
    degree?: string;
    period?: string;
    gpa?: string | null;
    rank?: string | null;
    courses?: string[];
    awards?: string[];
  }[];
  experience?: { org?: string; role?: string; period?: string; bullets?: AnyBullet[] }[];
  projects?: { name?: string; period?: string; role?: string; tech_stack?: string[]; bullets?: AnyBullet[] }[];
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
  const { isLoggedInWithConv, dbData, convQs, saveField, loading: dbLoading } = useM3DBSync();

  const [localParsedResume, setLocalParsedResume] = useLocalState<ParsedResume>(STORAGE_KEYS.PARSED_RESUME, null);
  const [localJdContext, setLocalJdContext] = useLocalState<JdCtx>(STORAGE_KEYS.JD_CONTEXT, null);
  const [localHidden] = useLocalState<HiddenList>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);

  const parsedResume = (isLoggedInWithConv ? dbData?.parsed_resume_json ?? null : localParsedResume) as ParsedResume;
  const jdContext = (isLoggedInWithConv ? dbData?.jd_context_json ?? null : localJdContext) as JdCtx;
  const hiddenExperiences = (isLoggedInWithConv
    ? (Array.isArray(dbData?.hidden_experience_json) ? dbData!.hidden_experience_json : [])
    : localHidden) as HiddenList;

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<SuggestEditsResult | null>(null);
  const [decisions, setDecisions] = useState<DecisionsMap>({});
  const [rewritten, setRewritten] = useState<RewrittenMap>({});
  const [downloading, setDownloading] = useState(false);
  const [fromDebriefHighlight, setFromDebriefHighlight] = useState<FromDebriefHighlight>(null);

  // V3 — hover/点击 AI 改清单某条 → 右侧简历对应 bullet 蓝色高亮 + 滚到视野
  const [hoveredEditId, setHoveredEditId] = useState<string | null>(null);

  // LLM metrics 给顶部"综合 +N 分 / JD 命中 +N 个"用(简化版)
  const [llmMetrics, setLlmMetrics] = useState<LlmMetrics | null>(null);
  const [llmJdKeywords, setLlmJdKeywords] = useState<string[]>([]);
  const [llmMatchedKeywords, setLlmMatchedKeywords] = useState<string[]>([]);
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
      // §8.28 — 读 step 3 用户勾选的优化目标(localStorage),传给后端 prompt
      let optimizationGoals: string[] | undefined;
      try {
        const raw = window.localStorage.getItem("m3_optimization_goals");
        if (raw) {
          const parsedGoals = JSON.parse(raw);
          if (Array.isArray(parsedGoals)) optimizationGoals = parsedGoals;
        }
      } catch {
        /* ignore */
      }

      // §8.28 — m3 主页 step 2 用户只保存了 raw JD(meta.mode=raw),没结构化
      // 这里 lazy parse:先 parse-jd 转 full,再 suggest-edits
      // 用户感知:一个 loading,不再多按一步"解析"
      let effectiveJd = jdContext;
      const isRawMode =
        jdContext &&
        typeof jdContext === "object" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((jdContext as any).meta?.mode === "raw" || !!(jdContext as any).rawJdText) &&
        // 已结构化(有 must_have / matched 等)就跳过
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !(jdContext as any).must_have &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        !(jdContext as any).matched;

      if (isRawMode) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawJdText = String((jdContext as any).rawJdText ?? "");
        if (rawJdText.length >= 30) {
          try {
            const parseRes = await fetch("/api/m3/parse-jd", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "full",
                jdText: rawJdText,
                parsedResume,
              }),
            });
            if (parseRes.ok) {
              const fullJd = await parseRes.json();
              // 双轨持久化升级后的 full jdContext
              if (isLoggedInWithConv) {
                await saveField("jd_context_json", fullJd);
              } else {
                setLocalJdContext(fullJd);
              }
              effectiveJd = fullJd;
            }
          } catch {
            // parse-jd 挂了 → 继续用 raw,LLM 能读 rawJdText
          }
        }
      }

      const res = await fetch("/api/m3/suggest-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: effectiveJd ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          fromDebriefHighlight: fromDebriefHighlight ?? null,
          optimizationGoals,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as SuggestEditsResult;
      setData(parsed);

      // V2 自动 accept(2026-06-07 用户反馈):放弃逐条 accept/reject 流,所有低风险全自动改。
      // 低风险 = claim_type === "explicit" 且 category 不是 hidden-experience-add / gap-alert / quantification。
      // 高风险(inferred / needs_confirmation / quantification / 新增) → 保持 pending,在简历里【请补充】高亮等用户填。
      const LOW_RISK_CAT = new Set([
        "narrative-tools",
        "ats-keyword",
        "section-reorder",
        "career-translator",
        "tech-deepening",
      ]);
      const initialDecisions: DecisionsMap = {};
      for (const e of parsed.edits) {
        if (e.claim_type === "explicit" && LOW_RISK_CAT.has(e.category)) {
          initialDecisions[e.id] = "accept";
        }
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

  // === LLM diff-metrics(只取顶部 1 行评分需要的 JD 关键词命中数 + STAR/hard_req 提升)===
  const loadLlmMetrics = useCallback(async () => {
    if (!parsedResume) return;
    setLlmMetricsRefreshing(true);
    try {
      // V2 不再计算 6 维表,只给 LLM 一个简化 payload 拿 jd_keywords / matched / STAR
      const acceptedEditsForDiff = data
        ? data.edits
            .filter((e) => decisions[e.id] === "accept" && e.category !== "gap-alert")
            .map((e) => ({
              target: e.target,
              original_text: e.original_text,
              suggested_text: rewritten[e.id] ?? e.suggested_text,
            }))
        : [];
      const v1Bullets: string[] = [];
      const v2Bullets: string[] = [];
      // 简单提取所有 bullet 文本(rough,只为后端 STAR 评分)
      const sections: Array<keyof NonNullable<ParsedResume>> = [
        "experience",
        "projects",
        "activities",
      ];
      for (const sec of sections) {
        const arr = (parsedResume as Record<string, unknown>)?.[sec];
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          const bs = (it as { bullets?: Array<string | { text?: string }> })?.bullets;
          if (!Array.isArray(bs)) continue;
          for (const b of bs) {
            const t = typeof b === "string" ? b : b?.text ?? "";
            if (t) {
              v1Bullets.push(t);
              const repl = acceptedEditsForDiff.find((e) => e.original_text === t);
              v2Bullets.push(repl ? repl.suggested_text : t);
            }
          }
        }
      }
      if (v1Bullets.length === 0) {
        setLlmMetricsRefreshing(false);
        return;
      }
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
    } catch (err) {
      console.error("[loadLlmMetrics] failed:", err);
    } finally {
      setLlmMetricsRefreshing(false);
    }
  }, [parsedResume, jdContext, data, decisions, rewritten]);

  // 进 ready 状态后自动跑 1 次 LLM diff-metrics
  useEffect(() => {
    if (status === "ready" && data && !llmMetrics && !llmMetricsRefreshing) {
      loadLlmMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);

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

  // V2 待补充 edit(简历里【请补充】高亮 + 用户点击填)
  const pendingFillEdits = useMemo(() => {
    if (!data) return [];
    return data.edits.filter(
      (e) =>
        e.category !== "gap-alert" &&
        decisions[e.id] !== "accept" &&
        decisions[e.id] !== "reject" &&
        (e.claim_type === "needs_confirmation" ||
          e.claim_type === "inferred" ||
          e.category === "quantification"),
    );
  }, [data, decisions]);

  // V2 已自动改的 edit 清单(给左侧"看 AI 改了哪 N 处"用)
  const acceptedEdits = useMemo(() => {
    if (!data) return [];
    return data.edits.filter((e) => decisions[e.id] === "accept");
  }, [data, decisions]);

  // V3 评分大卡数据(综合 0-100 + 4 维度 + delta + 改造 tags)
  const dashboardData = useMemo<M3DashboardData>(() => {
    const matchedKeywordsCount = llmMatchedKeywords.length;
    const totalKeywordsCount = llmJdKeywords.length;
    const keywordsCoveragePct =
      totalKeywordsCount > 0
        ? (matchedKeywordsCount / totalKeywordsCount) * 100
        : 60; // 没 LLM 数据时 60% baseline

    const jdMatchPct = llmMetrics?.hard_req_total
      ? ((llmMetrics.hard_req_v2_aligned ?? 0) / llmMetrics.hard_req_total) * 100
      : keywordsCoveragePct; // fallback 用关键词覆盖度

    const structurePct = llmMetrics?.star_complete_v2?.total
      ? (llmMetrics.star_complete_v2.complete / llmMetrics.star_complete_v2.total) * 100
      : 65;

    // 成果表达清晰度:基于 acceptedCount / 总 bullet 数
    let totalBullets = 0;
    if (parsedResume) {
      const sections: Array<keyof NonNullable<ParsedResume>> = [
        "experience",
        "projects",
        "activities",
      ];
      for (const sec of sections) {
        const arr = (parsedResume as Record<string, unknown>)?.[sec];
        if (Array.isArray(arr)) {
          for (const it of arr) {
            const bs = (it as { bullets?: unknown[] })?.bullets;
            if (Array.isArray(bs)) totalBullets += bs.length;
          }
        }
      }
    }
    const achievementPct =
      totalBullets > 0
        ? Math.min(95, 50 + (acceptedCount / totalBullets) * 50)
        : 70;

    // 综合评分:4 维度加权平均
    const totalScore = Math.round(
      jdMatchPct * 0.3 +
        keywordsCoveragePct * 0.3 +
        structurePct * 0.2 +
        achievementPct * 0.2,
    );

    // delta 估算:v2 - v1 主要靠 STAR + hard_req 提升
    let delta = acceptedCount * 2; // fallback
    if (llmMetrics) {
      const starGain =
        (llmMetrics.star_complete_v2?.complete ?? 0) -
        (llmMetrics.star_complete_v1?.complete ?? 0);
      const hardGain =
        (llmMetrics.hard_req_v2_aligned ?? 0) -
        (llmMetrics.hard_req_v1_aligned ?? 0);
      delta = Math.max(acceptedCount, Math.round(starGain * 3 + hardGain * 5 + acceptedCount * 2));
    }

    // improveTags:基于 edit 分布选 1-3 个有代表性的 tag
    const cats = new Set<string>();
    if (data) {
      for (const e of data.edits) {
        if (decisions[e.id] === "accept") cats.add(e.category);
      }
    }
    const improveTags: string[] = [];
    if (cats.has("ats-keyword") || cats.has("narrative-tools")) improveTags.push("关键词补强");
    if (cats.has("quantification") || cats.has("tech-deepening"))
      improveTags.push("成果表达增强");
    if (cats.has("section-reorder")) improveTags.push("结构更完整");
    if (improveTags.length === 0 && acceptedCount > 0) improveTags.push("表述更精炼");

    return {
      totalScore: Math.max(0, Math.min(100, totalScore)),
      delta: Math.max(0, delta),
      acceptedCount,
      pendingCount: pendingFillEdits.length,
      jdMatchPct,
      keywordsCoveragePct,
      structurePct,
      achievementPct,
      improveTags,
      loading: llmMetricsRefreshing && !llmMetrics,
    };
  }, [
    llmMatchedKeywords,
    llmJdKeywords,
    llmMetrics,
    llmMetricsRefreshing,
    parsedResume,
    acceptedCount,
    data,
    decisions,
    pendingFillEdits.length,
  ]);

  function handleFillBlank(editId: string, filledText: string) {
    setRewritten((r) => ({ ...r, [editId]: filledText }));
    setDecisions((d) => ({ ...d, [editId]: "accept" }));
  }

  // 登录用户 DB 还在 fetch → 显示 loading,别闪 "还没读到你的简历"
  if (isLoggedInWithConv && dbLoading) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg">
          <div className="h-20" />
          <div className="max-w-[600px] mx-auto px-6 py-20 text-center">
            <div className="inline-block animate-spin w-8 h-8 border-2 border-esther-blue border-t-transparent rounded-full mb-4" />
            <p className="text-sm text-ink-soft">正在读取你的简历…</p>
          </div>
        </main>
      </>
    );
  }

  if (!parsedResume) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center p-6">
          <Card className="p-6 max-w-md">
            <p className="text-sm text-ink mb-3">⚠️ 还没读到你的简历</p>
            <Link
              href={`/m3${convQs}`}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              ← 回 Step 1 上传简历
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

        {/* Loading 中 → V2 stepper(参考竞品 — 显示 AI 思考过程,不再"AI 正在分析…"一句话)*/}
        {status === "loading" && <M3OptimizationStepper ready={false} />}

        {/* Error */}
        {status === "error" && (
          <div className="max-w-[600px] mx-auto px-6 py-20">
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

        {/* Ready — V3 左对话 + 右简历 */}
        {status === "ready" && data && (
          <>
            {/* 顶部 sticky 工具栏(返回 + 下载)*/}
            <section className="sticky top-20 z-30 bg-warm-bg/95 backdrop-blur-sm border-b border-border shadow-sm">
              <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
                <Link
                  href={`/m3${convQs}`}
                  className="text-ink-soft hover:text-esther-blue text-xs"
                >
                  ← 改简历 / JD
                </Link>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {downloading ? "生成中..." : "↓ 下载 Word"}
                </button>
              </div>
            </section>

            {/* V3 评分大卡(照抄竞品)*/}
            <div className="max-w-[1400px] mx-auto px-6 pt-6">
              <M3ScoreDashboard data={dashboardData} />
            </div>

            {/* placeholder_mode 提示(M6 → M3 没拿到 JD 全文)*/}
            {jdContext?.placeholder_mode && (
              <div className="max-w-[1400px] mx-auto px-6 pt-4">
                <div className="leading-relaxed bg-esther-yellow/15 border border-esther-yellow/50 rounded-md px-3 py-2">
                  <p className="text-xs text-ink">
                    ⚠️ <strong>岗位摘要模式</strong>:当前 JD 全文未能从 M6 抓到,仅基于
                    <span className="font-medium">
                      {" "}
                      {jdContext.role_name ?? "(岗位名)"}
                      {jdContext.company ? ` @ ${jdContext.company}` : ""}{" "}
                    </span>
                    做岗位推断。建议回 M6 复制完整 JD 重做一次。
                  </p>
                </div>
              </div>
            )}

            {/* 主内容:左 AI 对话 / 右 简历 */}
            <div className="max-w-[1400px] mx-auto px-6 py-6">
              <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-6">
                {/* 左:AI 对话(V1 stub,V2 接 chain rewrite)*/}
                <aside className="lg:sticky lg:top-32 lg:self-start lg:max-h-[calc(100vh-9rem)] flex flex-col">
                  <Card className="p-5 flex-1 flex flex-col bg-card">
                    <p className="font-display italic text-xs text-esther-blue mb-1">
                      Chat with AI
                    </p>
                    <h3 className="text-sm font-semibold text-ink mb-2">
                      💬 跟 AI 说说哪里再改
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed mb-3">
                      AI 已自动改了 {acceptedCount} 处低风险表述,你直接看右侧简历就行。如果某段想换写法、补关键词、加深度,告诉我。
                    </p>

                    {/* 已改清单(折叠 + hover 联动 → 简历对应 bullet 高亮)*/}
                    {acceptedEdits.length > 0 && (
                      <details className="mb-3 border border-border rounded p-2 bg-warm-bg-deep/20" open>
                        <summary className="text-xs text-ink-soft cursor-pointer hover:text-esther-blue list-none">
                          ▾ 看 AI 改了哪 {acceptedEdits.length} 处 <span className="text-[10px] text-ink-muted">(鼠标 hover 看右侧对应位置)</span>
                        </summary>
                        <ul className="mt-2 space-y-1 text-[11px] text-ink-soft max-h-60 overflow-y-auto">
                          {acceptedEdits.map((e) => (
                            <li
                              key={e.id}
                              onMouseEnter={() => setHoveredEditId(e.id)}
                              onMouseLeave={() => setHoveredEditId(null)}
                              onClick={() => {
                                setHoveredEditId(e.id);
                                if (typeof document !== "undefined") {
                                  const el = document.querySelector<HTMLElement>(
                                    `[data-edit-id="${e.id}"]`,
                                  );
                                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }
                              }}
                              className={`leading-snug cursor-pointer rounded px-1.5 py-1 transition-colors ${
                                hoveredEditId === e.id
                                  ? "bg-esther-blue/15 text-ink"
                                  : "hover:bg-esther-blue/[0.06]"
                              }`}
                            >
                              <span className="text-esther-blue mr-1">·</span>
                              <span className="text-ink-muted">[{e.category}]</span>{" "}
                              {e.reason || "改写"}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}

                    {/* 待补充清单 */}
                    {pendingFillEdits.length > 0 && (
                      <div className="mb-3 border border-esther-yellow/50 rounded p-2 bg-esther-yellow/[0.05]">
                        <p className="text-xs text-ink font-medium mb-1.5">
                          ⚠️ 还有 {pendingFillEdits.length} 处要你填具体数字
                        </p>
                        <p className="text-[11px] text-ink-soft leading-snug">
                          简历里【请补充】高亮的地方,点一下填具体数字 / 信息
                        </p>
                      </div>
                    )}

                    {/* 输入框 stub(V1 disabled,V2 接 LLM chain rewrite)*/}
                    <div className="mt-auto">
                      <textarea
                        disabled
                        rows={3}
                        placeholder="例:把项目经历再写得更技术 · 补充更多 JD 关键词 · 换个写法"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-warm-bg/40 text-xs text-ink leading-relaxed resize-none focus:outline-none disabled:opacity-60"
                      />
                      <p className="text-[10px] text-ink-muted mt-1.5">
                        💬 自由对话即将上线 · 当前可手动点【请补充】填值
                      </p>
                    </div>
                  </Card>
                </aside>

                {/* 右:简历预览(word-style)*/}
                <div>
                  <Card className="p-8 md:p-10 bg-white shadow-sm border-border">
                    <ResumePreview
                      parsedResume={parsedResume}
                      edits={data.edits}
                      decisions={decisions}
                      rewritten={rewritten}
                      onFillBlank={handleFillBlank}
                      hoveredEditId={hoveredEditId}
                      onHoverEdit={setHoveredEditId}
                      jdContext={jdContext}
                    />
                  </Card>

                  {fromDebriefHighlight && (
                    <Card className="mt-4 p-3 border-2 border-purple-500/30 bg-purple-500/5">
                      <p className="text-[11px] text-purple-700 leading-relaxed">
                        💡 已读到模块 5 面试复盘高价值答案,AI 已优先整理成简历里的
                        <span className="font-medium ml-1">来自面试回写</span>建议。
                      </p>
                    </Card>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        <BuerFloatingButton />
      </main>
    </>
  );
}

// ============ Resume Preview V2 — word-style + 【请补充】点击填值 ============

const FILL_RE = /【(请补充[^】]*?)】/g;

/**
 * 把 bullet 文本里的【请补充 X】拆成 text fragment + clickable blank,
 * 用户点击 blank → 弹小 input 替换那段【...】写回 rewritten。
 */
function BulletFillableText({
  text,
  editId,
  onFillBlank,
}: {
  text: string;
  editId: string | null;
  onFillBlank?: (editId: string, filledText: string) => void;
}) {
  const [openBlankIdx, setOpenBlankIdx] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 找到所有【请补充 ...】区域
  const parts: Array<{ kind: "text" | "blank"; value: string; idx?: number }> = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let blankI = 0;
  const re = new RegExp(FILL_RE);
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ kind: "text", value: text.slice(lastIdx, m.index) });
    parts.push({ kind: "blank", value: m[1], idx: blankI++ });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ kind: "text", value: text.slice(lastIdx) });

  function applyFill(idx: number, replacement: string) {
    if (!editId || !onFillBlank) return;
    // 把第 idx 个【请补充 ...】替换为 replacement
    let i = 0;
    const next = text.replace(FILL_RE, (full) => {
      const ret = i === idx ? replacement : full;
      i++;
      return ret;
    });
    onFillBlank(editId, next);
    setOpenBlankIdx(null);
    setInputVal("");
  }

  useEffect(() => {
    if (openBlankIdx !== null) inputRef.current?.focus();
  }, [openBlankIdx]);

  if (parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.value}</span>;
        const idx = p.idx!;
        if (openBlankIdx === idx) {
          return (
            <span key={i} className="inline-flex items-center gap-1 mx-0.5 align-middle">
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputVal.trim()) applyFill(idx, inputVal.trim());
                  else if (e.key === "Escape") {
                    setOpenBlankIdx(null);
                    setInputVal("");
                  }
                }}
                placeholder={p.value}
                className="px-1.5 py-0.5 rounded border border-esther-blue bg-white text-[12px] text-ink w-32 focus:outline-none focus:ring-1 focus:ring-esther-blue"
              />
              <button
                type="button"
                onClick={() => inputVal.trim() && applyFill(idx, inputVal.trim())}
                className="text-[10px] text-esther-blue hover:underline"
              >
                确认
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenBlankIdx(null);
                  setInputVal("");
                }}
                className="text-[10px] text-ink-muted hover:text-ink"
              >
                取消
              </button>
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpenBlankIdx(idx)}
            disabled={!editId || !onFillBlank}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-esther-yellow/40 hover:bg-esther-yellow/60 border border-esther-yellow text-[12px] text-ink font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            title="点击填具体数字"
          >
            ✎ {p.value}
          </button>
        );
      })}
    </>
  );
}

function ResumePreview({
  parsedResume,
  edits,
  decisions,
  rewritten,
  onFillBlank,
  hoveredEditId,
  onHoverEdit,
  jdContext,
}: {
  parsedResume: ParsedResume;
  edits: EditSuggestion[];
  decisions: DecisionsMap;
  rewritten: RewrittenMap;
  onFillBlank?: (editId: string, filledText: string) => void;
  hoveredEditId?: string | null;
  onHoverEdit?: (editId: string | null) => void;
  jdContext?: JdCtx;
}) {
  // 1 个 edit 只能映射到 1 个 bullet(防 parse-resume 出错导致跨 section 重复 bullet 时,
  // 同一 edit.suggested_text 被多个 bullet 重复显示)
  const usedEditIds = new Set<string>();

  function lookupEdit(
    section: "experience" | "projects" | "activities",
    sectionIdx: number,
    bulletIdx: number,
    originalText: string,
  ): EditSuggestion | null {
    const target = `${section}[${sectionIdx}].bullets[${bulletIdx}]`;
    const claim = (m: EditSuggestion | undefined) => {
      if (!m) return null;
      if (usedEditIds.has(m.id)) return null; // 已被前面 bullet 用过,不重复
      usedEditIds.add(m.id);
      return m;
    };

    // L1: target 精确字符串匹配(主路径)
    const l1 = edits.find((e) => e.target === target);
    if (l1) {
      const c = claim(l1);
      if (c) return c;
    }

    // L2: bullet_id 精确匹配(章节重排兜底)
    const currentBulletId = (() => {
      const items = (parsedResume as Record<string, unknown>)?.[section];
      if (!Array.isArray(items)) return null;
      const it = items[sectionIdx] as { bullets?: Array<{ id?: string } | string> } | undefined;
      const b = it?.bullets?.[bulletIdx];
      if (!b || typeof b === "string") return null;
      return b.id ?? null;
    })();
    if (currentBulletId) {
      const l2 = edits.find((e) => e.bullet_id === currentBulletId);
      const c = claim(l2);
      if (c) return c;
    }

    // L3: original_text **完全相等**(严格)
    if (originalText.length >= 10) {
      const l3 = edits.find(
        (e) =>
          e.original_text === originalText &&
          e.original_text !== "(新增)" &&
          e.original_text !== "(JD 缺口)",
      );
      const c = claim(l3);
      if (c) return c;
    }

    return null;
  }

  function getBulletDisplay(
    section: "experience" | "projects" | "activities",
    sectionIdx: number,
    bulletIdx: number,
    originalText: string,
  ): {
    text: string;
    status: "original" | "accepted" | "needs-fill" | "rejected";
    editId: string | null;
  } {
    const matched = lookupEdit(section, sectionIdx, bulletIdx, originalText);
    if (!matched) return { text: originalText, status: "original", editId: null };
    const d = decisions[matched.id];
    if (d === "accept") {
      return {
        text: rewritten[matched.id] ?? matched.suggested_text,
        status: "accepted",
        editId: matched.id,
      };
    }
    if (d === "reject") return { text: originalText, status: "rejected", editId: matched.id };
    // pending — 高风险待用户填
    const isFillable =
      matched.claim_type === "needs_confirmation" ||
      matched.claim_type === "inferred" ||
      matched.category === "quantification";
    if (isFillable) {
      return {
        text: rewritten[matched.id] ?? matched.suggested_text,
        status: "needs-fill",
        editId: matched.id,
      };
    }
    return { text: originalText, status: "original", editId: matched.id };
  }

  function renderBulletList(
    section: "experience" | "projects" | "activities",
    items: { bullets?: AnyBullet[] }[],
  ) {
    return items.map((it, sIdx) =>
      (it.bullets ?? []).map((b, bIdx) => {
        const orig = typeof b === "string" ? b : b.text ?? "";
        const { text, status, editId } = getBulletDisplay(section, sIdx, bIdx, orig);
        const isHovered = editId && hoveredEditId === editId;
        const hasFillMark = !!text.match(FILL_RE);
        return (
          <li
            key={`${section}-${sIdx}-${bIdx}`}
            data-edit-id={editId ?? undefined}
            onMouseEnter={() => editId && onHoverEdit?.(editId)}
            onMouseLeave={() => onHoverEdit?.(null)}
            className={`text-[13px] leading-relaxed flex items-start gap-2 mb-1.5 px-1.5 rounded-sm transition-all duration-200 ${
              isHovered
                ? "bg-esther-blue/25 ring-2 ring-esther-blue/60 shadow-sm"
                : status === "accepted"
                  ? "bg-esther-blue/[0.08]"
                  : status === "needs-fill"
                    ? "bg-esther-yellow/[0.12]"
                    : ""
            }`}
          >
            <span className="text-ink mt-1.5 flex-shrink-0">·</span>
            <span
              className={
                status === "rejected"
                  ? "text-ink-muted line-through"
                  : "text-ink flex-1"
              }
            >
              <BulletFillableText
                text={text}
                editId={editId}
                onFillBlank={onFillBlank}
              />
              {status === "accepted" && !hasFillMark && (
                <span className="text-esther-blue ml-1.5 text-[10px]">✓ AI 已改</span>
              )}
              {status === "needs-fill" && !hasFillMark && editId && (
                <button
                  type="button"
                  onClick={() => {
                    if (onFillBlank) onFillBlank(editId, text + "【请补充具体数字】");
                  }}
                  className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-esther-yellow/60 hover:bg-esther-yellow border border-esther-yellow text-[10px] text-ink font-medium transition-colors"
                  title="点击在这条 bullet 末尾插入【请补充具体数字】"
                >
                  ✎ 这里 AI 想加数字 — 点我标出
                </button>
              )}
            </span>
          </li>
        );
      }),
    );
  }

  // 联系方式 + 求职意向
  const basic = parsedResume?.basic;
  const targetRole = (jdContext as { role_name?: string } | null)?.role_name;
  const contactItems: string[] = [];
  if (basic?.phone) contactItems.push(`📞 ${basic.phone}`);
  if (basic?.email) contactItems.push(`✉️ ${basic.email}`);
  if (basic?.location) contactItems.push(`📍 ${basic.location}`);

  // 教育背景:优先用 education[],fallback 用 basic.school
  const educationItems =
    parsedResume?.education && parsedResume.education.length > 0
      ? parsedResume.education
      : basic?.school
        ? [
            {
              school: basic.school,
              major: basic.major ?? "",
              degree: basic.year_level ?? "",
              period: "",
              gpa: basic.gpa ?? null,
            },
          ]
        : [];

  if (!parsedResume) return null;

  return (
    <div className="font-body-zh max-w-[750px] mx-auto">
      {/* ========= 顶部 Header:姓名 + 联系方式 + 求职意向 ========= */}
      {basic && (
        <div className="text-center pb-3 mb-4 border-b-2 border-ink">
          <h2 className="text-3xl font-bold text-ink tracking-wide mb-2">
            {basic.name ?? "—"} 的简历
          </h2>
          {contactItems.length > 0 && (
            <p className="text-xs text-ink-soft mb-1">
              {contactItems.join(" | ")}
              {targetRole && (
                <>
                  {" | "}
                  <span className="text-ink">求职意向:{targetRole}</span>
                </>
              )}
            </p>
          )}
          {contactItems.length === 0 && targetRole && (
            <p className="text-xs text-ink mb-1">求职意向:{targetRole}</p>
          )}
          {basic.major && (
            <p className="text-xs text-ink-soft">
              {basic.major}
              {basic.year_level ? ` · ${basic.year_level}` : ""}
              {basic.gpa ? ` · GPA ${basic.gpa}` : ""}
            </p>
          )}
        </div>
      )}

      {/* ========= 核心技能(放最前,招聘官 ATS 一眼看) ========= */}
      {parsedResume.skills && (
        <Section title="核心技能">
          <CoreSkillsList skills={parsedResume.skills} />
        </Section>
      )}

      {/* ========= 教育背景 ========= */}
      {educationItems.length > 0 && (
        <Section title="教育背景">
          {educationItems.map((ed, idx) => (
            <div key={idx} className="mb-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-ink">
                  {ed.school}
                  {ed.major ? ` | ${ed.major}` : ""}
                  {ed.degree ? ` | ${ed.degree}` : ""}
                  {ed.gpa ? ` | GPA ${ed.gpa}` : ""}
                </p>
                {ed.period && (
                  <span className="text-ink-muted font-normal text-xs">
                    {ed.period}
                  </span>
                )}
              </div>
              {ed.awards && ed.awards.length > 0 && (
                <p className="text-[12px] text-ink-soft mt-0.5">
                  荣誉:{ed.awards.join(" · ")}
                </p>
              )}
              {ed.courses && ed.courses.length > 0 && (
                <p className="text-[12px] text-ink-soft mt-0.5">
                  主修:{ed.courses.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </Section>
      )}

      {/* ========= 实习经历 ========= */}
      {(parsedResume.experience ?? []).length > 0 && (
        <Section title="实习经历">
          {(parsedResume.experience ?? []).map((e, sIdx) => (
            <div key={sIdx} className="mb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-sm font-semibold text-ink">
                  {e.org}
                  {e.role ? ` · ${e.role}` : ""}
                </p>
                {e.period && (
                  <span className="text-ink-muted font-normal text-xs">
                    {e.period}
                  </span>
                )}
              </div>
              <ul>{renderBulletList("experience", [e])[0]}</ul>
            </div>
          ))}
        </Section>
      )}

      {/* ========= 项目经验 ========= */}
      {(parsedResume.projects ?? []).length > 0 && (
        <Section title="项目经验">
          {(parsedResume.projects ?? []).map((p, sIdx) => (
            <div key={sIdx} className="mb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-sm font-semibold text-ink">
                  {p.name}
                  {p.role ? ` · ${p.role}` : ""}
                </p>
                {p.period && (
                  <span className="text-ink-muted font-normal text-xs">
                    {p.period}
                  </span>
                )}
              </div>
              {p.tech_stack && p.tech_stack.length > 0 && (
                <p className="text-[12px] text-ink-soft mb-1">
                  技术栈:{p.tech_stack.join(" · ")}
                </p>
              )}
              <ul>{renderBulletList("projects", [p])[0]}</ul>
            </div>
          ))}
        </Section>
      )}

      {/* ========= 社团活动 ========= */}
      {(parsedResume.activities ?? []).length > 0 && (
        <Section title="社团活动">
          {(parsedResume.activities ?? []).map((a, sIdx) => (
            <div key={sIdx} className="mb-3">
              <p className="text-sm font-semibold text-ink mb-1">
                {a.org}
                {a.role ? ` · ${a.role}` : ""}
                {a.period && (
                  <span className="text-ink-muted font-normal text-xs ml-2">
                    {a.period}
                  </span>
                )}
              </p>
              <ul>{renderBulletList("activities", [a])[0]}</ul>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-bold text-ink mb-2 tracking-wide">
        {title}
      </h3>
      <div className="border-t border-ink/20 pt-2.5">{children}</div>
    </div>
  );
}

/** 核心技能:按 category 分类展示(label: value) */
function CoreSkillsList({ skills }: { skills: Record<string, string[]> }) {
  const LABELS: Record<string, string> = {
    languages: "编程语言",
    frameworks: "框架与库",
    tools: "工具",
    domain: "领域知识",
    tech: "技术",
    language: "语言",
    tool: "工具",
  };
  const entries = Object.entries(skills).filter(([, v]) => Array.isArray(v) && v.length > 0);
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {entries.map(([key, vals]) => (
        <p key={key} className="text-[13px] text-ink leading-relaxed">
          <span className="text-esther-blue font-semibold">
            {LABELS[key] ?? key}:
          </span>{" "}
          {vals.join(" · ")}
        </p>
      ))}
    </div>
  );
}
