"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import {
  RIASEC_QUESTIONS,
  INTEREST_QUESTION,
  INTEREST_TAGS,
  LIKERT_OPTIONS,
  migrateAnswersSchema,
  type LikertValue,
} from "@/lib/quiz-data";
import { M1_SAMPLE } from "@/lib/m1-sample";

/**
 * 模块 1 测评答题页
 *
 * 题型:
 *   - RIASEC 18 题:5 点 Likert(1 非常不喜欢 → 5 非常喜欢)
 *   - 第 19 题兴趣 tag:multi-select(零打字),选中后可选喜欢强度 1-5
 *
 * 数据流:答完 → POST /api/m1/recommend → setItem('riasec_result') → /m1/result
 *
 * 进度断点:答题状态 debounce 写入 localStorage.m1_quiz_draft,刷新自动恢复
 */

type LikertQ = {
  no: number;
  text: string;
  dim: "R" | "I" | "A" | "S" | "E" | "C";
  type: "likert";
};

type MultiOption = { label: string; text: string };

type MultiQ = {
  no: number;
  text: string;
  helper?: string;
  options: MultiOption[];
  type: "multi";
};

type QuestionUI = LikertQ | MultiQ;

const ALL_QUESTIONS: QuestionUI[] = [
  ...RIASEC_QUESTIONS.map((q) => ({
    no: q.no,
    text: q.text,
    dim: q.dim,
    type: "likert" as const,
  })),
  {
    no: INTEREST_QUESTION.no,
    text: INTEREST_QUESTION.text,
    helper: INTEREST_QUESTION.helper,
    options: INTEREST_TAGS.map((t) => ({ label: t.label, text: t.text })),
    type: "multi" as const,
  },
];

const DRAFT_KEY = "m1_quiz_draft";

type AnswersMap = Record<number, LikertValue | Record<string, number>>;

type DraftPayload = {
  answers: AnswersMap;
  current: number;
};

function clampIndex(idx: number, max: number): number {
  if (!Number.isFinite(idx)) return 0;
  if (idx < 0) return 0;
  if (idx > max) return max;
  return idx;
}

export default function Module1QuizPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoNext, setAutoNext] = useState(true);
  const [restored, setRestored] = useState(false);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  // 入场:恢复草稿(v2 schema 自动迁移)
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<DraftPayload>;
      const safeAnswers = migrateAnswersSchema(parsed.answers) as AnswersMap;
      const safeCurrent = clampIndex(
        typeof parsed.current === "number" ? parsed.current : 0,
        ALL_QUESTIONS.length - 1
      );
      if (Object.keys(safeAnswers).length > 0) {
        setAnswers(safeAnswers);
        setCurrent(safeCurrent);
        setRestored(true);
      }
    } catch (e) {
      console.warn("[m1/quiz] draft restore failed:", e);
      try {
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  // debounce 写草稿
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      try {
        if (Object.keys(answers).length === 0) {
          window.localStorage.removeItem(DRAFT_KEY);
        } else {
          window.localStorage.setItem(
            DRAFT_KEY,
            JSON.stringify({ answers, current } satisfies DraftPayload)
          );
        }
      } catch {
        // ignore (quota / disabled)
      }
    }, 400);
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [answers, current]);

  const safeIndex = clampIndex(current, ALL_QUESTIONS.length - 1);
  const q = ALL_QUESTIONS[safeIndex];
  const isLast = safeIndex === ALL_QUESTIONS.length - 1;

  // 边界守卫:q 缺失就用错误状态接管,避免后续访问 q.no/q.type 崩溃
  if (!q) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex flex-col items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-5xl mb-5">🤔</p>
            <h2 className="text-xl font-bold text-ink mb-3">
              测评数据看起来有点乱
            </h2>
            <p className="text-sm text-ink-soft leading-relaxed mb-6">
              我们没读到合法的题目状态,可能是缓存残留。点下面按钮清掉重来。
            </p>
            <button
              onClick={() => {
                try {
                  window.localStorage.removeItem(DRAFT_KEY);
                } catch {
                  // ignore
                }
                setAnswers({});
                setCurrent(0);
              }}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              重新开始测评
            </button>
          </div>
        </main>
      </>
    );
  }

  const currentAnswer = answers[q.no];

  const hasAnswer =
    q.type === "likert"
      ? typeof currentAnswer === "number"
      : typeof currentAnswer === "object" &&
        currentAnswer !== null &&
        !Array.isArray(currentAnswer) &&
        Object.keys(currentAnswer).length > 0;

  const selectLikert = (value: LikertValue) => {
    setAnswers({ ...answers, [q.no]: value });
    if (autoNext && !isLast) {
      setTimeout(
        () => setCurrent((c) => clampIndex(c + 1, ALL_QUESTIONS.length - 1)),
        200
      );
    }
  };

  const toggleInterest = (label: string) => {
    const cur =
      currentAnswer && typeof currentAnswer === "object" && !Array.isArray(currentAnswer)
        ? { ...(currentAnswer as Record<string, number>) }
        : {};
    if (cur[label] !== undefined) {
      delete cur[label];
      setAnswers({ ...answers, [q.no]: cur });
    } else {
      cur[label] = 4;
      setAnswers({ ...answers, [q.no]: cur });
    }
  };

  const setInterestStrength = (label: string, strength: number) => {
    const cur =
      currentAnswer && typeof currentAnswer === "object" && !Array.isArray(currentAnswer)
        ? { ...(currentAnswer as Record<string, number>) }
        : {};
    cur[label] = Math.max(1, Math.min(5, Math.round(strength)));
    setAnswers({ ...answers, [q.no]: cur });
  };

  const writeSampleFallback = () => {
    try {
      window.localStorage.setItem(
        "riasec_result",
        JSON.stringify({
          ...M1_SAMPLE,
          completedAt: new Date().toISOString(),
          fallback: "api-error",
        })
      );
    } catch {
      // ignore
    }
  };

  const submitToBackend = async (finalAnswers: AnswersMap) => {
    setLoading(true);
    setError(null);
    try {
      const sanitized = migrateAnswersSchema(finalAnswers);
      const res = await fetch("/api/m1/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: sanitized }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `请求失败: ${res.status}`);
      }
      const data = await res.json();
      try {
        window.localStorage.setItem(
          "riasec_result",
          JSON.stringify({
            ...data,
            answers: sanitized,
            refineCount: 0,
          })
        );
        window.localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore quota
      }
      router.push("/m1/result");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      // API 失败兜底:写 sample 进 localStorage,result 页会 banner 提示
      writeSampleFallback();
      setError(
        `分析失败:${msg}。已临时切到 sample 结果让你先往下看,可点 retry 重试。`
      );
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (isLast) {
      submitToBackend(answers);
    } else {
      setCurrent(clampIndex(safeIndex + 1, ALL_QUESTIONS.length - 1));
    }
  };

  const handlePrev = () => {
    if (safeIndex > 0) setCurrent(safeIndex - 1);
  };

  const handleSkip = () => {
    handleNext();
  };

  const handleRetryFromFallback = () => {
    setError(null);
    submitToBackend(answers);
  };

  const handleViewFallback = () => {
    router.push("/m1/result");
  };

  const progress = ((safeIndex + 1) / ALL_QUESTIONS.length) * 100;

  if (loading) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex flex-col items-center justify-center px-6">
          <div className="text-center max-w-md">
            <div className="inline-block animate-spin w-12 h-12 border-4 border-esther-blue border-t-transparent rounded-full mb-6" />
            <h2 className="text-xl font-bold text-ink mb-3">
              不二正在帮你分析…
            </h2>
            <p className="text-sm text-ink-soft leading-relaxed">
              基于 RIASEC 6 维 + 你的兴趣 tag,
              <br />
              从 40+ 职业方向里挑出最契合的 5 个
            </p>
            <p className="text-xs text-ink-muted mt-6 font-display italic">
              通常 5-10 秒
            </p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* 顶部进度 */}
        <section className="border-b border-border bg-card sticky top-20 z-10">
          <div className="max-w-[800px] mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
              <Link
                href="/m1"
                className="text-xs text-ink-soft hover:text-esther-blue transition-colors"
              >
                ← 退出测评(进度会保留)
              </Link>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoNext}
                    onChange={(e) => setAutoNext(e.target.checked)}
                    className="w-3.5 h-3.5 accent-esther-blue cursor-pointer"
                  />
                  <span className="text-xs text-ink-soft">自动下一题</span>
                </label>
                <p className="text-xs text-ink-muted font-display italic">
                  {safeIndex + 1} / {ALL_QUESTIONS.length}
                </p>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-warm-bg-deep overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-esther-blue to-esther-yellow transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            {restored && safeIndex > 0 && (
              <p className="text-[11px] text-ink-muted mt-2 font-display italic">
                ↻ 已恢复上次进度(第 {safeIndex + 1} 题)
              </p>
            )}
          </div>
        </section>

        {/* 第 1 题时显示一次性指导语 */}
        {safeIndex === 0 && q.type === "likert" && (
          <section className="max-w-[800px] mx-auto px-6 pt-8">
            <div className="p-4 rounded-xl bg-esther-yellow/15 border-l-4 border-esther-yellow">
              <p className="text-sm text-ink leading-relaxed">
                <span className="font-medium">说明:</span>{" "}
                下面 18 件事,如果让你做,你对它的喜欢程度是?选 1(非常不喜欢)到 5(非常喜欢)。
              </p>
              <p className="text-xs text-ink-soft mt-2 italic">
                基于霍兰德 RIASEC 职业兴趣理论的简化测评,结合你的经历信号做交叉验证 · 共 19 题约 3-4 分钟。
              </p>
            </div>
          </section>
        )}

        {/* 题目卡 */}
        <div className="max-w-[800px] mx-auto px-6 py-8">
          <Card className="p-8 md:p-10 border-2 border-border">
            <p className="font-display italic text-xs text-esther-blue mb-3">
              Question {q.no}
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-ink mb-8 leading-snug">
              {q.text}
            </h2>

            {/* Likert 5 点 chip */}
            {q.type === "likert" && (
              <>
                <div className="grid grid-cols-5 gap-2 md:gap-3">
                  {LIKERT_OPTIONS.map((opt) => {
                    const selected = currentAnswer === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => selectLikert(opt.value as LikertValue)}
                        className={`flex flex-col items-center gap-2 px-2 py-4 rounded-xl border-2 transition-all ${
                          selected
                            ? "border-esther-blue bg-esther-blue/10 shadow-sm"
                            : "border-border bg-card hover:border-esther-blue/50"
                        }`}
                      >
                        <span className="text-3xl md:text-4xl leading-none">
                          {opt.emoji}
                        </span>
                        <span
                          className={`text-[11px] md:text-xs text-center leading-tight ${
                            selected
                              ? "text-esther-blue font-semibold"
                              : "text-ink-soft"
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="text-[10px] text-ink-muted font-display italic">
                          {opt.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-muted mt-4 text-center font-display italic">
                  非常不喜欢 ← → 非常喜欢
                </p>
              </>
            )}

            {/* Multi-select(兴趣 tag) */}
            {q.type === "multi" && Array.isArray(q.options) && (
              <>
                <div className="space-y-3">
                  {q.options.map((opt) => {
                    if (!opt || typeof opt.label !== "string") return null;
                    const selectedMap =
                      currentAnswer &&
                      typeof currentAnswer === "object" &&
                      !Array.isArray(currentAnswer)
                        ? (currentAnswer as Record<string, number>)
                        : {};
                    const isSelected = selectedMap[opt.label] !== undefined;
                    const strength = selectedMap[opt.label] ?? 4;
                    return (
                      <div
                        key={opt.label}
                        className={`rounded-xl border-2 transition-all overflow-hidden ${
                          isSelected
                            ? "border-esther-blue bg-esther-blue/5"
                            : "border-border bg-card hover:border-esther-blue/50"
                        }`}
                      >
                        <button
                          onClick={() => toggleInterest(opt.label)}
                          className="w-full flex items-start gap-4 p-4 text-left"
                        >
                          <span
                            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                              isSelected
                                ? "bg-esther-blue/15"
                                : "bg-warm-bg-deep"
                            }`}
                          >
                            {opt.label}
                          </span>
                          <span className="flex-1 text-sm text-ink leading-relaxed pt-2">
                            {opt.text}
                          </span>
                          {isSelected && (
                            <span className="font-display italic text-xs text-esther-blue font-bold pt-2">
                              {strength}/5
                            </span>
                          )}
                        </button>
                        {isSelected && (
                          <div className="border-t border-esther-blue/20 px-4 py-3 bg-esther-blue/5">
                            <p className="text-[11px] text-ink-muted mb-2 font-display italic">
                              喜欢程度
                            </p>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((v) => (
                                <button
                                  key={v}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInterestStrength(opt.label, v);
                                  }}
                                  className={`flex-1 h-9 rounded-md text-sm font-bold transition-colors ${
                                    v === strength
                                      ? "bg-esther-blue text-white"
                                      : "bg-card border border-border text-ink-soft hover:border-esther-blue/50"
                                  }`}
                                >
                                  {v}
                                </button>
                              ))}
                            </div>
                            <p className="text-[10px] text-ink-muted mt-1.5 text-center">
                              1 = 一般 · 3 = 中等 · 5 = 超爱
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {q.helper && (
                  <p className="text-xs text-ink-muted mt-4 font-display italic">
                    * {q.helper}
                  </p>
                )}
              </>
            )}
          </Card>

          {error && (
            <div className="mt-4 p-4 rounded-xl bg-esther-red/5 border border-esther-red/30 text-sm text-esther-red">
              <p className="leading-relaxed">{error}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={handleRetryFromFallback}
                  className="inline-flex items-center justify-center rounded-full bg-esther-red text-white px-4 py-1.5 text-xs font-medium hover:bg-esther-red/90 transition-colors"
                >
                  重试分析
                </button>
                <button
                  onClick={handleViewFallback}
                  className="inline-flex items-center justify-center rounded-full border border-esther-red/40 text-esther-red px-4 py-1.5 text-xs font-medium hover:bg-esther-red/10 transition-colors"
                >
                  先看 sample 结果 →
                </button>
              </div>
            </div>
          )}

          {/* 控件 */}
          <div className="flex items-center justify-between mt-6 gap-4">
            <button
              onClick={handlePrev}
              disabled={safeIndex === 0}
              className="px-5 py-2.5 rounded-full border border-border bg-card text-sm text-ink-soft hover:border-esther-blue transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← 上一题
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSkip}
                className="px-4 py-2.5 text-sm text-ink-muted hover:text-ink-soft transition-colors"
              >
                跳过这题
              </button>
              <button
                onClick={handleNext}
                disabled={!hasAnswer && !isLast}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLast ? "完成 → 看推荐" : "下一题 →"}
              </button>
            </div>
          </div>

          <p className="text-xs text-ink-muted text-center mt-6 font-display italic">
            * 共 {ALL_QUESTIONS.length} 题 · 答不上可跳过(不致命)· 基于霍兰德 RIASEC 6 维
          </p>
        </div>
      </main>
    </>
  );
}
