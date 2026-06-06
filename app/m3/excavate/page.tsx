"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useM3DBSync } from "@/lib/sync/useM3DBSync";

/**
 * 模块 3 / Phase 3 隐藏经验挖掘
 *
 * 4 选项 + 1 填空 + "都没有"6 选项;沾边都算,不审判
 *
 * 退出:
 *   连续 3 个"都没有" / 用户点"够了" / hidden >= 5
 *
 * 末尾 Skeptical Recruiter(R1)对挖到的 hero story 提 3 weak spot
 */

type Question = {
  id: string;
  topic_name: string;
  context_intro: string;
  options: { letter: "A" | "B" | "C" | "D"; text: string }[];
  fill_prompt: string;
  none_label: string;
};

type HiddenExperience = {
  question_id: string;
  topic_name: string;
  raw_user_material: string;
  star_breakdown: { situation?: string; task?: string; action?: string; result?: string } | null;
  candidate_bullets: { text: string; anti_fab_note: string | null }[];
  skeptical_flags?: string[];
};

type HistoryItem = {
  question_id: string;
  topic_name: string;
  skipped: boolean;
  user_answer_summary: string;
};

type Status = "loading-question" | "answering" | "saving" | "finalize" | "done" | "error";

const MAX_QUESTIONS = 7; // 安全上限,避免死循环
const MAX_NONE_IN_ROW = 3; // 连续 3 次"都没有"自动结束
const TARGET_HIDDEN = 5; // 收集到 5 个就鼓励结束

export default function ExcavatePage() {
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
      <ExcavateContent />
    </Suspense>
  );
}

function ExcavateContent() {
  const router = useRouter();
  const { isLoggedInWithConv, dbData, convQs, saveField } = useM3DBSync();

  const [localParsedResume] = useLocalState(STORAGE_KEYS.PARSED_RESUME, null);
  const [localJdContext] = useLocalState(STORAGE_KEYS.JD_CONTEXT, null);
  const [localHidden, setLocalHidden] = useLocalState<HiddenExperience[]>(
    STORAGE_KEYS.HIDDEN_EXPERIENCES,
    [],
  );

  const parsedResume = isLoggedInWithConv ? dbData?.parsed_resume_json ?? null : localParsedResume;
  const jdContext = isLoggedInWithConv ? dbData?.jd_context_json ?? null : localJdContext;
  const hidden = isLoggedInWithConv
    ? (Array.isArray(dbData?.hidden_experience_json) ? (dbData!.hidden_experience_json as HiddenExperience[]) : [])
    : localHidden;

  const setHidden = useCallback(
    async (next: HiddenExperience[] | ((prev: HiddenExperience[]) => HiddenExperience[])) => {
      const resolved = typeof next === "function" ? next(hidden) : next;
      setLocalHidden(resolved);
      if (isLoggedInWithConv) await saveField("hidden_experience_json", resolved);
    },
    [hidden, isLoggedInWithConv, saveField, setLocalHidden],
  );

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentQ, setCurrentQ] = useState<Question | null>(null);
  const [selectedLetters, setSelectedLetters] = useState<Set<string>>(new Set());
  const [fillText, setFillText] = useState("");
  const [status, setStatus] = useState<Status>("loading-question");
  const [errorMsg, setErrorMsg] = useState("");
  const [noneInRow, setNoneInRow] = useState(0);
  const [finalSummary, setFinalSummary] = useState("");

  const loadNextQuestion = useCallback(async () => {
    setStatus("loading-question");
    setErrorMsg("");
    setSelectedLetters(new Set());
    setFillText("");
    setCurrentQ(null);
    try {
      const res = await fetch("/api/m3/excavate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "next-question",
          parsedResume,
          jdContext,
          history,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const q = (await res.json()) as Question;
      setCurrentQ(q);
      setStatus("answering");
    } catch (err) {
      const message = err instanceof Error ? err.message : "出题失败";
      setErrorMsg(message);
      setStatus("error");
    }
  }, [parsedResume, jdContext, history]);

  // 首次加载
  useEffect(() => {
    if (!parsedResume) return;
    if (history.length === 0 && !currentQ && status === "loading-question") {
      loadNextQuestion();
    }
  }, [parsedResume, history.length, currentQ, status, loadNextQuestion]);

  function toggleOption(letter: string) {
    setSelectedLetters((prev) => {
      const next = new Set(prev);
      if (letter === "NONE") {
        // "都没有" 互斥
        return next.has("NONE") ? new Set() : new Set(["NONE"]);
      }
      // 选其他 → 清除 NONE
      next.delete("NONE");
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  }

  async function handleSubmitAnswer() {
    if (!currentQ) return;
    if (selectedLetters.size === 0 && !fillText.trim()) {
      setErrorMsg("请至少选 1 个或填空");
      return;
    }

    setStatus("saving");
    setErrorMsg("");

    const isNone = selectedLetters.has("NONE") && !fillText.trim();
    const userAnswer = {
      option_letters: Array.from(selectedLetters),
      fill_text: fillText.trim() || undefined,
    };

    try {
      const res = await fetch("/api/m3/excavate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "answer",
          question: currentQ,
          userAnswer,
          parsedResume,
          jdContext,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = await res.json();

      const newHistoryItem: HistoryItem = {
        question_id: currentQ.id,
        topic_name: currentQ.topic_name,
        skipped: isNone || parsed.skipped,
        user_answer_summary: isNone
          ? "(都没有)"
          : `${Array.from(selectedLetters).join("+")}${fillText.trim() ? " + 填空" : ""}`,
      };
      setHistory((h) => [...h, newHistoryItem]);

      if (!isNone && !parsed.skipped) {
        const newHidden: HiddenExperience = {
          question_id: currentQ.id,
          topic_name: parsed.topic_name,
          raw_user_material: parsed.raw_user_material,
          star_breakdown: parsed.star_breakdown,
          candidate_bullets: parsed.candidate_bullets,
        };
        setHidden((arr) => [...arr, newHidden]);
        setNoneInRow(0);
      } else {
        setNoneInRow((n) => n + 1);
      }

      // 判定退出
      const collectedCount = hidden.length + (isNone || parsed.skipped ? 0 : 1);
      const newNoneInRow = isNone || parsed.skipped ? noneInRow + 1 : 0;
      const shouldFinalize =
        collectedCount >= TARGET_HIDDEN ||
        newNoneInRow >= MAX_NONE_IN_ROW ||
        history.length + 1 >= MAX_QUESTIONS;

      if (shouldFinalize) {
        await handleFinalize(hidden);
      } else {
        await loadNextQuestion();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "提交失败";
      setErrorMsg(message);
      setStatus("error");
    }
  }

  async function handleFinalize(experiences: HiddenExperience[]) {
    setStatus("finalize");
    setErrorMsg("");
    try {
      const res = await fetch("/api/m3/excavate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finalize",
          hiddenExperiences: experiences,
          jdContext,
        }),
      });
      const parsed = await res.json();
      const flagsByTopic: Record<string, string[]> = parsed.skeptical_flags_by_topic ?? {};
      // 合并 skeptical_flags 到 hidden
      setHidden((arr) =>
        arr.map((h) => ({
          ...h,
          skeptical_flags: flagsByTopic[h.topic_name] ?? [],
        }))
      );
      setFinalSummary(parsed.summary ?? "");
      setStatus("done");
    } catch (err) {
      console.error("finalize failed:", err);
      setStatus("done");
    }
  }

  const busy = status === "loading-question" || status === "saving" || status === "finalize";

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

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/m3/jd"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回 Phase 2
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              Phase 3 / 5 · 隐藏经验挖掘
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              我问几个问题,帮你回忆一下
            </h1>
            <p className="text-ink-soft text-sm">
              沾边都算,不审判 · 选择题为主 + 1 个填空 · "都没有"也 OK
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* 左:选择题 + 已挖列表 */}
          <div className="space-y-6">
            {/* 进度 */}
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="text-ink-soft">
                <span className="font-medium text-ink">第 {history.length + (currentQ ? 1 : 0)} 轮</span>
                {" · 已挖到 "}
                <span className="font-medium text-esther-blue">{hidden.length}</span>
                {" 个隐藏经验"}
                {noneInRow > 0 && (
                  <span className="ml-2 text-ink-muted">
                    (连续 {noneInRow} 个"都没有")
                  </span>
                )}
              </p>
              {hidden.length >= 2 && status !== "done" && (
                <button
                  onClick={() => handleFinalize(hidden)}
                  disabled={busy}
                  className="text-xs text-ink-muted hover:text-esther-red transition-colors disabled:opacity-40"
                >
                  够了,直接结束 →
                </button>
              )}
            </div>

            {/* 当前选择题 */}
            {currentQ && status === "answering" && (
              <Card className="p-6 border-2 border-esther-blue/30">
                <div className="mb-4">
                  <p className="font-display italic text-xs text-esther-blue mb-2">
                    Topic · {currentQ.topic_name}
                  </p>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    {currentQ.context_intro}
                  </p>
                </div>

                <p className="text-sm font-medium text-ink mb-3">
                  下面哪些你做过 / 沾边过?(可多选)
                </p>

                <div className="space-y-2 mb-4">
                  {currentQ.options.map((opt) => (
                    <button
                      key={opt.letter}
                      onClick={() => toggleOption(opt.letter)}
                      className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3 ${
                        selectedLetters.has(opt.letter)
                          ? "border-esther-blue bg-esther-blue/8"
                          : "border-border bg-card hover:border-esther-blue/40"
                      }`}
                    >
                      <span
                        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          selectedLetters.has(opt.letter)
                            ? "bg-esther-blue text-white"
                            : "bg-warm-bg-deep text-ink-muted"
                        }`}
                      >
                        {opt.letter}
                      </span>
                      <span className="text-sm text-ink leading-relaxed flex-1">
                        {opt.text}
                      </span>
                    </button>
                  ))}

                  {/* 填空 */}
                  <div
                    className={`p-3 rounded-xl border-2 transition-all ${
                      fillText.trim()
                        ? "border-esther-blue bg-esther-blue/8"
                        : "border-border bg-card"
                    }`}
                  >
                    <p className="text-xs text-ink-muted mb-2">
                      ✏️ {currentQ.fill_prompt}
                    </p>
                    <input
                      value={fillText}
                      onChange={(e) => setFillText(e.target.value)}
                      placeholder="自由发挥 — 想到什么就写,沾一点边也算"
                      className="w-full px-3 py-2 rounded-lg border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue"
                      disabled={busy}
                    />
                  </div>

                  {/* "都没有" 第 6 选项 */}
                  <button
                    onClick={() => toggleOption("NONE")}
                    className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                      selectedLetters.has("NONE")
                        ? "border-esther-red bg-esther-red/5"
                        : "border-border bg-card hover:border-esther-red/30"
                    }`}
                  >
                    <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-warm-bg-deep text-ink-muted">
                      ✗
                    </span>
                    <span className="text-sm text-ink-soft">
                      {currentQ.none_label}(跳过这题,问下一个)
                    </span>
                  </button>
                </div>

                {errorMsg && (
                  <p className="text-xs text-esther-red mb-3">⚠️ {errorMsg}</p>
                )}

                <div className="flex items-center justify-end">
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={busy || (selectedLetters.size === 0 && !fillText.trim())}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {busy ? "提交中..." : "提交,下一题 →"}
                  </button>
                </div>
              </Card>
            )}

            {/* Loading 状态 */}
            {(status === "loading-question" || status === "saving") && (
              <Card className="p-6 border-2 border-border bg-warm-bg-deep/30">
                <p className="text-sm text-ink-soft text-center py-4">
                  {status === "loading-question"
                    ? "🤖 AI 在想下一题..."
                    : "💭 整理你的答案为 STAR..."}
                </p>
              </Card>
            )}

            {status === "finalize" && (
              <Card className="p-6 border-2 border-esther-blue/30 bg-esther-blue/5">
                <p className="text-sm text-ink-soft text-center py-4">
                  🔍 AI 在帮你提前找面试官会追问的薄弱点...
                </p>
              </Card>
            )}

            {/* Done */}
            {status === "done" && (
              <Card className="p-6 border-2 border-esther-blue bg-esther-blue/5">
                <p className="font-display italic text-xs text-esther-blue mb-2">
                  Done
                </p>
                <h3 className="text-base font-semibold text-ink mb-3">
                  ✓ 挖完了 — 共 {hidden.length} 个隐藏经验
                </h3>
                {finalSummary && (
                  <p className="text-sm text-ink-soft leading-relaxed mb-4 p-3 bg-card rounded-lg border border-border">
                    💬 {finalSummary}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href="/m3/jd"
                    className="text-xs text-ink-muted hover:text-ink transition-colors px-3"
                  >
                    ← 回去改 JD
                  </Link>
                  <button
                    onClick={() => router.push(`/m3/result${convQs}`)}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
                  >
                    Phase 5 整理简历 →
                  </button>
                </div>
              </Card>
            )}

            {/* 已挖到的经验列表 */}
            {hidden.length > 0 && (
              <Card className="p-5 border-2 border-border bg-warm-bg-deep/30">
                <p className="font-display italic text-xs text-esther-blue mb-3">
                  Collected ({hidden.length})
                </p>
                <h3 className="text-sm font-semibold text-ink mb-3">
                  ✨ 已挖到的隐藏经验
                </h3>
                <ul className="space-y-3">
                  {hidden.map((h, i) => (
                    <li
                      key={h.question_id}
                      className="text-xs text-ink-soft leading-relaxed bg-card border-l-4 border-esther-yellow p-3 rounded"
                    >
                      <p className="font-medium text-ink mb-1">
                        {i + 1}. {h.topic_name}
                      </p>
                      {h.candidate_bullets.slice(0, 1).map((b, bi) => (
                        <p key={bi} className="text-ink-soft">
                          → {b.text}
                          {b.anti_fab_note && (
                            <span className="text-esther-red ml-1">{b.anti_fab_note}</span>
                          )}
                        </p>
                      ))}
                      {h.skeptical_flags && h.skeptical_flags.length > 0 && (
                        <div className="mt-2 p-2 bg-esther-yellow/15 rounded">
                          <p className="text-[10px] text-ink-muted mb-1 font-display italic">
                            🤔 面试官可能追问:
                          </p>
                          {h.skeptical_flags.map((flag, fi) => (
                            <p key={fi} className="text-[11px] text-ink leading-relaxed">
                              · {flag}
                            </p>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          {/* 右:Phase 进度 + Tips */}
          <aside className="space-y-5">
            <Card className="p-5 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Process
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">5 个 Phase 进度</h3>
              <ul className="space-y-3 text-sm">
                {[
                  ["1", "简历解析", true, false],
                  ["2", "岗位匹配", true, false],
                  ["3", "隐藏经验挖掘", false, true],
                  ["4", "学习计划", false, false],
                  ["5", "整理简历", false, false],
                ].map(([no, title, done, current]) => (
                  <li key={no as string} className="flex items-start gap-3">
                    <span
                      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        current
                          ? "bg-esther-blue text-white animate-pulse"
                          : done
                          ? "bg-esther-yellow text-ink"
                          : "bg-warm-bg-deep text-ink-muted border border-border"
                      }`}
                    >
                      {done ? "✓" : (no as string)}
                    </span>
                    <p className={current ? "font-medium text-esther-blue" : done ? "text-ink" : "text-ink-muted"}>
                      {title as string}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5 border-2 border-esther-yellow/40 bg-esther-yellow/10">
              <p className="font-display italic text-xs text-esther-blue mb-2">Tips</p>
              <ul className="text-xs text-ink-soft space-y-1.5 leading-relaxed">
                <li>· 沾边就算 — 别审判自己</li>
                <li>· 选了的可以同时填空补细节</li>
                <li>· "都没有" 也 OK,连续 3 个我就停</li>
                <li>· 收到 5 个就鼓励你结束</li>
                <li>· 最后 R1 模型会扮演怀疑面试官提 weak spot</li>
              </ul>
            </Card>
          </aside>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
