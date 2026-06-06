"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import {
  M5_STORAGE_KEYS,
  type DebriefHighlight,
  type DebriefResult,
  type FromDebriefHighlight,
  type InterviewSession,
} from "@/lib/interview-types";
import { STORAGE_KEYS } from "@/lib/use-local-state";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";

/**
 * 把 M5 复盘 highlight 映射成 HiddenExperience(M3 素材池统一格式)。
 * M3 result 页会读 HIDDEN_EXPERIENCES + 把它们当 "可直接整理成 bullet 的素材" 喂给 suggest-edits。
 * 这样 M5 → M3 的回写就走统一通道,不再覆盖式单条。
 */
function highlightToHiddenExperience(
  h: DebriefHighlight,
  sessionId: string,
): {
  question_id: string;
  topic_name: string;
  raw_user_material: string;
  star_breakdown: null;
  candidate_bullets: { text: string; anti_fab_note: string | null }[];
} {
  const date = new Date().toISOString().slice(0, 10);
  return {
    question_id: `m5-debrief-${sessionId}-${h.excerpt.slice(0, 16).replace(/\s+/g, "-")}`,
    topic_name: `M5 复盘亮点 · ${h.question.slice(0, 30)} · ${date}`,
    raw_user_material: h.excerpt,
    star_breakdown: null,
    candidate_bullets: [
      {
        text: h.suggestedBullet,
        anti_fab_note: "来自 M5 复盘,引用本场面试 transcript",
      },
    ],
  };
}

/**
 * 模块 5 · 模拟面试 复盘报告
 * 路由 /m5/debrief
 *
 * 数据流:
 *   读 localStorage interview_sessions[-1] → 调 /api/m5/debrief →
 *   渲染 4 维评分(PRD §3.6.8) + highlights(双向闭环 inline) + 10 题摘要
 *
 * Adopt:
 *   按钮 click → 写 localStorage from_debrief_highlight → router.push("/m3?from=debrief")
 *   跳转链路是模块 D / 模块 B 的事,模块 C 只产数据。
 */

const PERSONA_LABEL: Record<string, string> = {
  gentle: "🌸 亲切姐姐",
  strict: "⚡ 严厉压力",
  rigor: "🔍 严谨技术",
};
const TYPE_LABEL: Record<string, string> = {
  semi: "半结构化",
  bq: "行为面 BQ",
  tech: "技术面",
};

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`w-6 h-2 rounded-full ${
            n <= score
              ? "bg-esther-blue"
              : "bg-warm-bg-deep border border-border"
          }`}
        />
      ))}
      <span className="ml-2 text-sm font-bold text-esther-blue font-display italic">
        {score}/5
      </span>
    </div>
  );
}

export default function Module5DebriefPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm-bg pt-32 text-center text-ink-muted">加载中…</div>}>
      <Module5DebriefContent />
    </Suspense>
  );
}

function Module5DebriefContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const convId = sp.get("c");
  const { user } = useUser();
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [debrief, setDebrief] = useState<DebriefResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [adopted, setAdopted] = useState<Set<string>>(new Set());
  /** 复制 bullet 反馈 — key = excerpt */
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    (async () => {
      let last: InterviewSession | null = null;

      // 登录 + 有 convId → 从 DB 重建 session
      if (user && convId) {
        const supabase = createClient();
        const { data } = await supabase
          .from("m5_interviews")
          .select("config_json, turns_json, debrief_md")
          .eq("conversation_id", convId)
          .maybeSingle();
        if (data?.config_json && data?.turns_json) {
          const turns = data.turns_json as {
            questions?: InterviewSession["questions"];
            answers?: InterviewSession["answers"];
            turn_evaluations?: InterviewSession["turn_evaluations"];
          };
          last = {
            id: convId,
            config: data.config_json as InterviewSession["config"],
            questions: turns.questions ?? [],
            answers: turns.answers ?? [],
            turn_evaluations: turns.turn_evaluations ?? [],
            debrief: data.debrief_md ? (JSON.parse(data.debrief_md) as DebriefResult) : undefined,
          };
        }
      }

      // Fallback localStorage
      if (!last) {
        try {
          const raw = window.localStorage.getItem(M5_STORAGE_KEYS.SESSIONS);
          if (raw) {
            const sessions = JSON.parse(raw) as InterviewSession[];
            last = sessions[sessions.length - 1] ?? null;
          }
        } catch {
          // ignore
        }
      }

      if (!last) {
        setErr("没有面试记录 — 先去面试一场");
        setLoading(false);
        return;
      }
      setSession(last);
      // 已有 debrief → 直接用,不再 调 LLM
      if (last.debrief) {
        setDebrief(last.debrief);
        setLoading(false);
        return;
      }
      (async () => {
        try {
          const res = await fetch("/api/m5/debrief", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session: last }),
          });
          if (!res.ok) {
            const j = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            throw new Error(j.error ?? `HTTP ${res.status}`);
          }
          const j = (await res.json()) as { debrief: DebriefResult };
          setDebrief(j.debrief);
          // 登录用户回写 DB
          if (user && convId) {
            await createClient()
              .from("m5_interviews")
              .update({ debrief_md: JSON.stringify(j.debrief) })
              .eq("conversation_id", convId);
          }
          // 回写 session.debrief 到 localStorage
          try {
            const exist = JSON.parse(
              window.localStorage.getItem(M5_STORAGE_KEYS.SESSIONS) ?? "[]"
            ) as InterviewSession[];
            const next = exist.map((s) =>
              s.id === last.id ? { ...s, debrief: j.debrief } : s
            );
            window.localStorage.setItem(
              M5_STORAGE_KEYS.SESSIONS,
              JSON.stringify(next)
            );
          } catch (saveErr) {
            console.warn("[m5/debrief] save debrief back failed", saveErr);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : "复盘加载失败";
          setErr(msg);
        } finally {
          setLoading(false);
        }
      })();
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [user, convId]);

  /**
   * 把 highlight 追加到 HIDDEN_EXPERIENCES(M3 素材池统一通道)。
   * 同时写 from_debrief_highlight 单条作为"最近一条提示"供 M3 显式展示用。
   * 防重:用 question_id 去重,同一 highlight 重复采纳不会插入两次。
   */
  function appendHiddenExperiences(highlights: DebriefHighlight[]) {
    if (!session) return false;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.HIDDEN_EXPERIENCES);
      const existing = (() => {
        try {
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch {
          return [];
        }
      })();
      const existingIds = new Set(
        existing.map((x: { question_id?: string }) => x.question_id).filter(Boolean),
      );
      const toAdd = highlights
        .map((h) => highlightToHiddenExperience(h, session.id))
        .filter((he) => !existingIds.has(he.question_id));
      if (toAdd.length === 0) return true;
      const next = [...existing, ...toAdd];
      window.localStorage.setItem(STORAGE_KEYS.HIDDEN_EXPERIENCES, JSON.stringify(next));
      return true;
    } catch (e) {
      console.error("[m5/debrief] hidden_experiences append failed", e);
      return false;
    }
  }

  function handleAdopt(h: DebriefHighlight) {
    if (!session) return;
    if (adopted.has(h.excerpt)) return;
    const payload: FromDebriefHighlight = {
      source_session_id: session.id,
      question: h.question,
      excerpt: h.excerpt,
      why: h.why,
      suggestedBullet: h.suggestedBullet,
      sent_at: new Date().toISOString(),
    };
    try {
      // 1. 写最近一条 from_debrief_highlight(M3 result 用来展示"刚从面试来"提示 + 触发 suggest-edits 的 source=interview)
      window.localStorage.setItem(
        M5_STORAGE_KEYS.FROM_DEBRIEF_HIGHLIGHT,
        JSON.stringify(payload),
      );
      // 2. 追加到统一素材池 HIDDEN_EXPERIENCES — 多次采纳不互相覆盖
      appendHiddenExperiences([h]);
      setAdopted((s) => new Set(s).add(h.excerpt));
      router.push("/m3?from=debrief");
    } catch (e) {
      console.error("[m5/debrief] adopt write failed", e);
      alert("浏览器存储不可用,无法采纳");
    }
  }

  function handleAdoptAll() {
    if (!session) return;
    const toAdopt = backfillCandidates.filter((h) => !adopted.has(h.excerpt));
    if (toAdopt.length === 0) return;
    try {
      // 1. 批量追加到 HIDDEN_EXPERIENCES
      const ok = appendHiddenExperiences(toAdopt);
      if (!ok) {
        alert("浏览器存储不可用,无法批量采纳");
        return;
      }
      // 2. 写最近一条 from_debrief_highlight(取第一条作为"最近一条提示")
      const head = toAdopt[0];
      const payload: FromDebriefHighlight = {
        source_session_id: session.id,
        question: head.question,
        excerpt: head.excerpt,
        why: head.why,
        suggestedBullet: head.suggestedBullet,
        sent_at: new Date().toISOString(),
      };
      window.localStorage.setItem(
        M5_STORAGE_KEYS.FROM_DEBRIEF_HIGHLIGHT,
        JSON.stringify(payload),
      );
      setAdopted((s) => {
        const next = new Set(s);
        toAdopt.forEach((h) => next.add(h.excerpt));
        return next;
      });
      router.push("/m3?from=debrief");
    } catch (e) {
      console.error("[m5/debrief] adopt-all failed", e);
      alert("批量采纳失败");
    }
  }

  /**
   * 双轨之二:复制 bullet 文本到剪贴板。
   * 审计建议保守做法 — 不强依赖 M3 接口,demo 时手动粘贴也能演示能力链。
   */
  async function handleCopyBullet(h: DebriefHighlight) {
    try {
      await navigator.clipboard.writeText(h.suggestedBullet);
      setCopied(h.excerpt);
      window.setTimeout(() => {
        setCopied((cur) => (cur === h.excerpt ? null : cur));
      }, 2000);
    } catch (e) {
      console.warn("[m5/debrief] clipboard write failed", e);
      alert("浏览器剪贴板不可用,请手动复制下面 bullet 文本");
    }
  }

  if (loading) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <div className="text-center">
            <div className="text-3xl mb-3">📝</div>
            <p className="text-ink text-base mb-1">正在整理你这场表现…</p>
            <p className="text-ink-soft text-xs font-display italic">
              R1 思考模式,可能要 15-30 秒
            </p>
          </div>
        </main>
      </>
    );
  }

  if (err || !session || !debrief) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <div className="text-center max-w-[420px] px-6">
            <p className="text-esther-red font-medium mb-2">没法生成复盘</p>
            <p className="text-ink-soft text-sm mb-4">
              {err ?? "数据不完整"}
            </p>
            <Link
              href="/m5"
              className="inline-block rounded-full bg-esther-blue text-white px-6 py-2 text-sm"
            >
              重新开始 →
            </Link>
          </div>
        </main>
      </>
    );
  }

  const personaLabel = PERSONA_LABEL[session.config.persona] ?? "";
  const typeLabel = TYPE_LABEL[session.config.type] ?? "";
  const startedAt = session.config.started_at?.slice(0, 10) ?? "";
  const elapsedMin = (() => {
    if (!session.config.started_at || !debrief.finished_at) return null;
    const t1 = Date.parse(session.config.started_at);
    const t2 = Date.parse(debrief.finished_at);
    if (!Number.isFinite(t1) || !Number.isFinite(t2)) return null;
    return Math.max(1, Math.round((t2 - t1) / 60000));
  })();
  // 旧数据 evaluable 缺失 → 按 true 处理(向后兼容);scores 非空才算可评估
  const isEvaluable =
    debrief.evaluable !== false && debrief.scores.length > 0;
  const answeredCount = debrief.answeredCount;
  const totalCount = debrief.totalCount ?? session.questions.length;
  const partialAnswered =
    isEvaluable &&
    typeof answeredCount === "number" &&
    answeredCount > 0 &&
    answeredCount < totalCount;
  /** 审计 §3.5 优先字段名 resumeBackfillCandidates,旧数据走 highlights */
  const backfillCandidates =
    debrief.resumeBackfillCandidates ?? debrief.highlights;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/m5"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回到模拟面试入口
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 05 · 复盘报告
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              这一场,你做得怎么样
            </h1>
            <p className="text-ink-soft text-sm">
              {typeLabel} · {personaLabel} · {session.config.num_questions}{" "}
              题{elapsedMin ? ` · 实际用时 ${elapsedMin} 分钟` : ""}
              {startedAt ? ` · ${startedAt}` : ""}
            </p>
            <p className="text-xs text-ink-muted mt-4 leading-relaxed bg-warm-bg-deep/40 border border-border rounded-md px-3 py-2">
              ℹ️ 评分仅用于练习诊断,<strong>不代表真实录用结果</strong>。AI 评估有不确定性,建议你结合自己的判断使用;每项评分都附 transcript 证据,你可以自己核对。
            </p>
          </div>
        </section>

        {!isEvaluable ? (
          // T3:全跳过 / 全未答 — 专属 N/A 页,不渲染评分卡
          <section className="border-b border-border bg-warm-bg-deep/30">
            <div className="max-w-[1100px] mx-auto px-6 py-16 text-center">
              <div className="text-5xl mb-4">📭</div>
              <h2 className="text-xl md:text-2xl font-bold text-ink mb-3">
                本次未完成任何回答,无评估内容
              </h2>
              <p className="text-sm text-ink-soft max-w-[520px] mx-auto leading-relaxed mb-6">
                {debrief.summary ??
                  "因为没有 transcript,4 维评分(逻辑/具体/清晰/口水话)无法成立。建议重新开始,认真答完至少 3 题,我才能给你有意义的复盘。"}
              </p>
              <Link
                href="/m5"
                className="inline-block rounded-full bg-esther-blue text-white px-6 py-3 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                重新开始一场 →
              </Link>
              <p className="text-[11px] text-ink-muted mt-6">
                模拟面试仅供练习参考,不作为真实面试预测或录用依据
              </p>
            </div>
          </section>
        ) : (
          <section className="border-b border-border bg-warm-bg-deep/30">
            <div className="max-w-[1100px] mx-auto px-6 py-10">
              <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
                <div>
                  <p className="font-display italic text-xs text-esther-blue mb-1">
                    4-dim assessment
                  </p>
                  <h2 className="text-xl md:text-2xl font-bold text-ink">
                    4 维评分(含 transcript 证据)
                  </h2>
                  {partialAnswered && (
                    <p className="text-xs text-ink-soft mt-2">
                      基于 <span className="font-bold text-esther-blue">{answeredCount}</span> /{" "}
                      {totalCount} 题计算 — 跳过和未答的题已标 N/A 不参与维度统计
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-ink-muted font-display italic">
                    Average
                  </p>
                  <p className="text-3xl font-display italic font-bold text-esther-blue">
                    {debrief.avg}
                    <span className="text-base text-ink-muted">/5</span>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {debrief.scores.map((s) => (
                  <Card key={s.dim} className="p-5 border-2 border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-base font-semibold text-ink">
                        {s.dim}
                      </h3>
                      <ScoreBar score={s.score} />
                    </div>
                    <div className="bg-warm-bg-deep/50 rounded-lg p-3">
                      <p className="text-[10px] uppercase tracking-wider text-ink-muted font-display italic mb-1.5">
                        Evidence
                      </p>
                      <p className="text-xs text-ink leading-relaxed">
                        {s.evidence || "(本场未触发该维度)"}
                      </p>
                    </div>
                    {/* 低分示范回答(plan offer-1-sparkling-hippo P1):仅 score ≤ 2 且 LLM 给了示范时显示 */}
                    {s.score <= 2 && s.improvement_example && (
                      <div className="mt-3 bg-esther-yellow/10 border border-esther-yellow/40 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wider text-ink-muted font-display italic mb-1.5">
                          可参考的改进示范
                        </p>
                        <p className="text-xs text-ink leading-relaxed">
                          {s.improvement_example}
                        </p>
                        <p className="text-[10px] text-ink-muted mt-2 italic">
                          ⚠️ 这是 AI 基于你的 transcript 改写的口语化示范,仅供参考练习,不代表标准答案
                        </p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>

              {debrief.missedSignals && debrief.missedSignals.length > 0 && (
                <Card className="mt-5 p-5 border-2 border-esther-yellow/40 bg-esther-yellow/10">
                  <p className="text-[10px] uppercase tracking-wider text-ink-muted font-display italic mb-2">
                    JD 在意但 transcript 没出现的信号
                  </p>
                  <ul className="space-y-1.5">
                    {debrief.missedSignals.map((s, i) => (
                      <li
                        key={i}
                        className="text-xs text-ink leading-relaxed flex gap-2"
                      >
                        <span className="text-esther-blue">·</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {debrief.nextPractice && (
                <p className="text-sm text-ink-soft mt-5 leading-relaxed">
                  <span className="font-display italic text-esther-blue">
                    Next:{" "}
                  </span>
                  {debrief.nextPractice}
                </p>
              )}

              <p className="text-[11px] text-ink-muted mt-5">
                ℹ️ 评分仅供参考 · 看趋势不看单次绝对分
              </p>
            </div>
          </section>
        )}

        {/* 双向闭环 — 简历回写候选(双轨:跳转 + 复制) */}
        {backfillCandidates.length > 0 && (
          <section className="border-b border-border">
            <div className="max-w-[1100px] mx-auto px-6 py-12">
              <div className="mb-6 flex items-start justify-between flex-wrap gap-4">
                <div className="flex-1 min-w-[280px]">
                  <p className="font-display italic text-xs text-esther-blue mb-1">
                    Resume backfill ★
                  </p>
                  <h2 className="text-xl md:text-2xl font-bold text-ink mb-2">
                    💡 这 {backfillCandidates.length} 段你答得特别好 — 要不要写进简历?
                  </h2>
                  <p className="text-sm text-ink-soft">
                    一键全部采纳 / 单条采纳 / 复制 bullet 自己粘
                  </p>
                </div>
                {(() => {
                  const pendingCount = backfillCandidates.filter((h) => !adopted.has(h.excerpt)).length;
                  if (pendingCount === 0) {
                    return (
                      <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-esther-blue/10 text-esther-blue text-xs font-medium">
                        ✓ 已全部送入素材池
                      </span>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={handleAdoptAll}
                      className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
                    >
                      ✓ 一键全部采纳({pendingCount}条) → 跳简历优化
                    </button>
                  );
                })()}
              </div>
              <p className="text-[11px] text-ink-muted mb-6">
                采纳的 bullet 会进入简历优化的素材池,你可以在简历整理里继续微调
              </p>

              <div className="space-y-5">
                {backfillCandidates.map((h) => {
                  const isAdopted = adopted.has(h.excerpt);
                  const isCopied = copied === h.excerpt;
                  return (
                    <Card
                      key={h.excerpt}
                      className="p-6 border-2 border-esther-yellow bg-esther-yellow/10"
                    >
                      <p className="text-[11px] font-display italic text-esther-blue mb-2">
                        From {h.question}
                      </p>

                      <div className="bg-card border-l-4 border-esther-blue p-4 rounded-r-lg mb-4">
                        <p className="text-xs text-ink-muted mb-1.5 font-display italic">
                          你说过的话:
                        </p>
                        <p className="text-sm text-ink leading-relaxed italic">
                          “{h.excerpt}”
                        </p>
                      </div>

                      <div className="bg-warm-bg-deep/40 rounded-lg p-4 mb-4">
                        <p className="text-xs text-ink-muted mb-1.5 font-display italic">
                          为什么值得加到简历:
                        </p>
                        <p className="text-sm text-ink leading-relaxed">
                          {h.why}
                        </p>
                      </div>

                      <div className="bg-card border border-border rounded-lg p-4 mb-4">
                        <p className="text-xs text-ink-muted mb-1.5 font-display italic">
                          AI 替你拟的 bullet 草稿:
                        </p>
                        <p className="text-sm text-ink leading-relaxed font-medium">
                          “{h.suggestedBullet}”
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => handleAdopt(h)}
                          disabled={isAdopted}
                          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
                        >
                          {isAdopted
                            ? "✓ 已采纳 → 跳简历优化"
                            : "✓ 采纳 → 跳简历优化"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopyBullet(h)}
                          className="inline-flex items-center justify-center rounded-full border border-esther-blue/40 bg-card text-esther-blue px-5 py-2 text-sm hover:bg-esther-blue/10 transition-colors"
                        >
                          {isCopied ? "✓ 已复制" : "📋 复制 bullet 文本"}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setAdopted((s) => new Set(s).add(h.excerpt))
                          }
                          className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-5 py-2 text-sm hover:border-ink-soft transition-colors"
                        >
                          ✗ 不采纳
                        </button>
                        <p className="text-[11px] text-ink-muted ml-auto">
                          采纳跳转后,简历优化页顶部有「← 返回复盘」按钮
                        </p>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* transcript 摘要 — 只在可评估时渲染,避免 N/A 状态下与"未完成任何回答"提示矛盾 */}
        {isEvaluable && debrief.transcript_summary.length > 0 && (
          <section className="border-b border-border bg-warm-bg-deep/30">
            <div className="max-w-[1100px] mx-auto px-6 py-10">
              <h2 className="text-xl md:text-2xl font-bold text-ink mb-2">
                {session.config.num_questions} 题完整摘要
              </h2>
              <p className="text-sm text-ink-soft mb-6">
                每题展示问题 + 你答的核心点 + 该题得分(N/A = 跳过或未答,不参与维度统计)
              </p>

              <Card className="border-2 border-border divide-y divide-border overflow-hidden">
                {debrief.transcript_summary.map((t) => (
                  <div
                    key={t.no}
                    className="p-4 flex items-start gap-4 hover:bg-warm-bg-deep/30 transition-colors"
                  >
                    <span className="font-display italic text-lg font-bold text-esther-blue/60 flex-shrink-0 w-6">
                      {t.no}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                        <p className="text-sm font-medium text-ink leading-snug">
                          {t.q}
                        </p>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {t.hasHighlight && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-esther-yellow text-ink">
                              💡 反哺
                            </span>
                          )}
                          {t.score > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-esther-blue/15 text-esther-blue">
                              {t.score}/5
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-ink-muted/15 text-ink-muted">
                              N/A
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-ink-soft leading-relaxed">
                        {t.summary}
                      </p>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          </section>
        )}

        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-12">
            <p className="font-display italic text-xs text-esther-blue mb-1">
              Next steps
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-ink mb-6">
              接下来想做什么?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/m5/live" className="block">
                <Card className="h-full p-5 border-2 border-border hover:border-esther-blue transition-colors">
                  <p className="text-base font-semibold text-ink mb-1">
                    🔁 重新面试 →
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    用同样的配置再练一场,看你这次能不能改进
                  </p>
                </Card>
              </Link>
              <Link href="/m3" className="block">
                <Card className="h-full p-5 border-2 border-border hover:border-esther-blue transition-colors">
                  <p className="text-base font-semibold text-ink mb-1">
                    📝 优化简历 →
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    把上面亮点采纳到简历(或手动改)
                  </p>
                </Card>
              </Link>
              <Link href="/m5" className="block">
                <Card className="h-full p-5 border-2 border-border hover:border-esther-blue transition-colors">
                  <p className="text-base font-semibold text-ink mb-1">
                    🎤 换性格再试 →
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    试试不同性格面试官,看你 under pressure 怎么答
                  </p>
                </Card>
              </Link>
            </div>
          </div>
        </section>

        <BuerFloatingButton />
      </main>
    </>
  );
}
