"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import {
  RIASEC_QUESTIONS,
  INTEREST_QUESTION,
  INTEREST_TAGS,
  LIKERT_OPTIONS,
  type LikertValue,
} from "@/lib/quiz-data";

/**
 * 模块 1 测评答题页(v2 18REST-2 学术验证版)
 *
 * 题型升级:
 *   - RIASEC 18 题:从"4 选 1"改为"5 点 Likert"(1 非常不喜欢 → 5 非常喜欢)
 *   - 第 19 题兴趣 tag:保留 multi-select(零打字)
 *
 * 数据流:答完 → POST /api/m1/recommend → setItem('riasec_result') → /m1/result
 *
 * 题库来源:Martins et al. (2024). 18REST-2. Journal of Career Assessment 33(1).
 */

type LikertQ = {
  no: number;
  text: string;
  dim: "R" | "I" | "A" | "S" | "E" | "C";
  type: "likert";
};

type MultiQ = {
  no: number;
  text: string;
  helper?: string;
  options: Array<{ label: string; text: string }>;
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

export default function Module1QuizPage() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<
    Record<number, LikertValue | string[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = ALL_QUESTIONS[current];
  const isLast = current === ALL_QUESTIONS.length - 1;
  const currentAnswer = answers[q.no];

  const hasAnswer =
    q.type === "likert"
      ? typeof currentAnswer === "number"
      : Array.isArray(currentAnswer) && currentAnswer.length > 0;

  const selectLikert = (value: LikertValue) => {
    setAnswers({ ...answers, [q.no]: value });
  };

  const toggleMulti = (label: string) => {
    const cur = (answers[q.no] as string[]) || [];
    const next = cur.includes(label)
      ? cur.filter((x) => x !== label)
      : [...cur, label];
    setAnswers({ ...answers, [q.no]: next });
  };

  const submitToBackend = async (finalAnswers: typeof answers) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/m1/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `请求失败: ${res.status}`);
      }
      const data = await res.json();
      localStorage.setItem(
        "riasec_result",
        JSON.stringify({
          ...data,
          answers: finalAnswers,
          refineCount: 0,
        })
      );
      router.push("/m1/result");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setError(`分析失败:${msg}。可以重试。`);
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (isLast) {
      submitToBackend(answers);
    } else {
      setCurrent(current + 1);
    }
  };

  const handlePrev = () => {
    if (current > 0) setCurrent(current - 1);
  };

  const handleSkip = () => {
    handleNext();
  };

  const progress = ((current + 1) / ALL_QUESTIONS.length) * 100;

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
              基于 18REST-2 学术测评 + 你的兴趣 tag,
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
            <div className="flex items-center justify-between mb-2">
              <Link
                href="/m1"
                className="text-xs text-ink-soft hover:text-esther-blue transition-colors"
              >
                ← 退出测评(进度会丢)
              </Link>
              <p className="text-xs text-ink-muted font-display italic">
                {current + 1} / {ALL_QUESTIONS.length}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-warm-bg-deep overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-esther-blue to-esther-yellow transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </section>

        {/* 第 1 题时显示一次性指导语 */}
        {current === 0 && q.type === "likert" && (
          <section className="max-w-[800px] mx-auto px-6 pt-8">
            <div className="p-4 rounded-xl bg-esther-yellow/15 border-l-4 border-esther-yellow">
              <p className="text-sm text-ink leading-relaxed">
                <span className="font-medium">说明:</span>{" "}
                下面 18 件事,如果让你做,你对它的喜欢程度是?选 1(非常不喜欢)到 5(非常喜欢)。
              </p>
              <p className="text-xs text-ink-soft mt-2 italic">
                测评基于 18REST-2 学术量表(Martins et al., 2024),共 19 题约 3-4 分钟。
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
            {q.type === "multi" && (
              <>
                <div className="space-y-3">
                  {q.options.map((opt) => {
                    const selected =
                      Array.isArray(currentAnswer) &&
                      currentAnswer.includes(opt.label);
                    return (
                      <button
                        key={opt.label}
                        onClick={() => toggleMulti(opt.label)}
                        className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${
                          selected
                            ? "border-esther-blue bg-esther-blue/5"
                            : "border-border bg-card hover:border-esther-blue/50"
                        }`}
                      >
                        <span
                          className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-xl ${
                            selected
                              ? "bg-esther-blue/15"
                              : "bg-warm-bg-deep"
                          }`}
                        >
                          {opt.label}
                        </span>
                        <span className="flex-1 text-sm text-ink leading-relaxed pt-2">
                          {opt.text}
                        </span>
                      </button>
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
              {error}
            </div>
          )}

          {/* 控件 */}
          <div className="flex items-center justify-between mt-6 gap-4">
            <button
              onClick={handlePrev}
              disabled={current === 0}
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
            * 共 {ALL_QUESTIONS.length} 题 · 答不上可跳过(不致命)· 基于 18REST-2 学术量表
          </p>
        </div>
      </main>
    </>
  );
}
