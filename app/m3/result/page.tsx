"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { EditSuggestionCard, type EditSuggestion, type Decision, type GapAlertDecision } from "@/components/EditSuggestionCard";
import { GapAlertCard } from "@/components/GapAlertCard";

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
type JdCtx = { jd_summary?: string; must_have?: string[] } | null;
type HiddenList = unknown[];

export default function ResultPage() {
  const router = useRouter();
  const [parsedResume] = useLocalState<ParsedResume>(STORAGE_KEYS.PARSED_RESUME, null);
  const [jdContext] = useLocalState<JdCtx>(STORAGE_KEYS.JD_CONTEXT, null);
  const [hiddenExperiences, setHiddenExperiences] = useLocalState<HiddenList>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<SuggestEditsResult | null>(null);
  const [decisions, setDecisions] = useState<DecisionsMap>({});
  const [rewritten, setRewritten] = useState<RewrittenMap>({});
  const [gapDecisions, setGapDecisions] = useState<GapDecisionsMap>({});
  const [gapFillBusyId, setGapFillBusyId] = useState<string | null>(null);
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

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
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as SuggestEditsResult;
      setData(parsed);

      // Auto-accept top high-priority edits per default_accept_count
      const initialDecisions: DecisionsMap = {};
      const highPriorityEdits = parsed.edits.filter((e) => e.priority === "high");
      const autoAcceptCount = Math.min(
        parsed.default_accept_count ?? 3,
        highPriorityEdits.length
      );
      for (let i = 0; i < autoAcceptCount; i++) {
        initialDecisions[highPriorityEdits[i].id] = "accept";
      }
      setDecisions(initialDecisions);
      setStatus("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      setErrorMsg(message);
      setStatus("error");
    }
  }, [parsedResume, jdContext, hiddenExperiences]);

  useEffect(() => {
    if (parsedResume && !data && status === "loading") {
      loadSuggestions();
    }
  }, [parsedResume, data, status, loadSuggestions]);

  function handleAccept(id: string) {
    setDecisions((d) => ({ ...d, [id]: "accept" }));
  }
  function handleReject(id: string) {
    setDecisions((d) => ({ ...d, [id]: "reject" }));
  }
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
    setTimeout(() => router.push("/m4"), 800);
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
          <div className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
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

            {/* 右:改动建议卡片列表 */}
            <div className="space-y-4">
              <Card className="p-4 border-2 border-esther-blue/30 bg-esther-blue/5">
                <p className="text-sm text-ink-soft leading-relaxed">
                  💡 {data.optimization_summary}
                </p>
                <p className="text-[11px] text-ink-muted mt-1">
                  used skills: <span className="font-mono">{data.used_supplements.join(", ")}</span>
                </p>
              </Card>

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
                        onReject={() => handleReject(edit.id)}
                        onRegen={() => handleRegen(edit)}
                        regenBusy={regenBusyId === edit.id}
                      />
                    ))}
                  </>
                );
              })()}
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
    const matched = edits.find((e) => e.target === target);
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
