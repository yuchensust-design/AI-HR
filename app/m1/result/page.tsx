"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResetQuizButton } from "@/components/ResetQuizButton";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { RIASECRadar } from "@/components/RIASECRadar";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { NegativeReveal, type NegativeItem } from "@/components/NegativeReveal";
import { RefineChips } from "@/components/RefineChips";
import { RecommendationRationale } from "@/components/RecommendationRationale";
import {
  DIMENSION_DESCRIPTIONS,
  DIMENSION_LABELS,
  DIMENSION_LEVEL_LABELS,
  getDimensionLevel,
  migrateAnswersSchema,
  type Confidence,
  type Dimension,
} from "@/lib/quiz-data";
import { M1_SAMPLE } from "@/lib/m1-sample";

/**
 * 模块 1 测评结果页
 * 路由 /m1/result
 *
 * 数据来源:
 *   - localStorage.riasec_result(来自 /m1/quiz → /api/m1/recommend)
 *   - 没数据 → 显示 sample(评委直接访问 demo 友好)
 *   - 来源 = "api-error" → 顶部 banner 提示降级,可点重试
 */

type PositiveItem = {
  industry: string;
  role_type: string;
  why_fit: string;
  match: string;
  match_percentage?: number;
};

type Scores = [number, number, number, number, number, number];

type Rationale = {
  interestEvidence?: string | null;
  experienceEvidence?: string | null;
  preferenceSignals?: string | null;
  confidence?: Confidence | null;
  confidenceWhy?: string | null;
  cautions?: string[] | null;
  nextStep?: string | null;
  whyNotOther?: string | null;
};

type EvidenceInfo = {
  source: "resume" | "chat" | "skip";
  summary?: string;
  tags?: string[];
  userNotes?: string;
  quality?: "high" | "mid" | "low";
  rawSnippet?: string;
  createdAt?: string;
} | null;

type RecommendResult = {
  scores: Scores;
  code: string;
  confidence: Confidence;
  positive: PositiveItem[];
  negative: NegativeItem[];
  refine_chips: string[];
  disclaimer: string;
  completedAt: string;
  refineCount?: number;
  answers?: Record<number, number | string[] | Record<string, number>>;
  rationale?: Rationale | null;
  evidence?: EvidenceInfo;
  fallback?: "api-error" | "sample" | null;
  isSample?: boolean;
  sampleMeta?: {
    background: string;
    emoji: string;
    tags: string[];
    experiences: string[];
  };
};

const DIMS: Dimension[] = ["R", "I", "A", "S", "E", "C"];

// 保留 sampleMeta 的具体类型,让本页直接 SAMPLE.sampleMeta.emoji 等访问可以 narrow
const SAMPLE: RecommendResult & { sampleMeta: NonNullable<RecommendResult["sampleMeta"]> } = M1_SAMPLE;

const NEXT_STEPS = [
  {
    title: "整理简历",
    desc: "基于这些方向调整简历,让经历更聚焦目标",
    href: "/m3",
  },
  {
    title: "补 gap 项目",
    desc: "对方向感兴趣但经历不够?设计 2-4 周项目补强",
    href: "/m4",
  },
  {
    title: "练一场模拟面试",
    desc: "用目标 JD 跑一场,看「具体性」「逻辑性」是否到位",
    href: "/m5",
  },
];

type FallbackKind = "no-data" | "api-error" | null;

export default function Module1ResultPage() {
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [fallbackKind, setFallbackKind] = useState<FallbackKind>(null);
  const [loaded, setLoaded] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("riasec_result");
      if (raw) {
        const parsed = JSON.parse(raw) as RecommendResult;
        const isApiFallback = parsed.fallback === "api-error";
        if (
          parsed.positive &&
          Array.isArray(parsed.positive) &&
          parsed.positive.length > 0
        ) {
          // 防御:外部塞进来的 answers 也走一次 schema 迁移
          if (parsed.answers) {
            parsed.answers = migrateAnswersSchema(parsed.answers) as RecommendResult["answers"];
          }
          // 合并独立 key m1_evidence(三路径 utility 会同时写两处)
          if (!parsed.evidence) {
            try {
              const evRaw = window.localStorage.getItem("m1_evidence");
              if (evRaw) {
                parsed.evidence = JSON.parse(evRaw) as EvidenceInfo;
              }
            } catch {
              // ignore
            }
          }
          setResult(parsed);
          setIsSample(Boolean(parsed.isSample) || isApiFallback);
          setFallbackKind(isApiFallback ? "api-error" : null);
          setLoaded(true);
          return;
        }
      }
    } catch (e) {
      console.warn("riasec_result parse failed:", e);
    }
    // 完全没数据 → sample,banner 提示「这是 sample,你还没做」
    setResult(SAMPLE);
    setIsSample(true);
    setFallbackKind("no-data");
    setLoaded(true);
  }, []);

  const handleRetryAnalysis = async () => {
    if (!result?.answers) return;
    setRetrying(true);
    try {
      const res = await fetch("/api/m1/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: migrateAnswersSchema(result.answers) }),
      });
      if (!res.ok) throw new Error(`请求失败: ${res.status}`);
      const data = await res.json();
      const merged: RecommendResult = {
        ...data,
        answers: migrateAnswersSchema(result.answers) as RecommendResult["answers"],
        refineCount: 0,
        fallback: null,
        isSample: false,
      };
      window.localStorage.setItem("riasec_result", JSON.stringify(merged));
      setResult(merged);
      setIsSample(false);
      setFallbackKind(null);
    } catch (e) {
      console.warn("retry analysis failed:", e);
    } finally {
      setRetrying(false);
    }
  };

  const handleRefine = async (chip: string) => {
    if (!result || isSample) return;
    setRefining(true);
    setRefineError(null);
    try {
      const res = await fetch("/api/m1/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: result.answers,
          previous: {
            positive: result.positive,
            negative: result.negative,
            refine_chips: result.refine_chips,
          },
          chip,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `请求失败: ${res.status}`);
      }
      const data = await res.json();
      const updated: RecommendResult = {
        ...result,
        positive: data.positive,
        negative: data.negative,
        refine_chips: data.refine_chips,
        rationale: data.rationale ?? result.rationale ?? null,
        refineCount: (result.refineCount || 0) + 1,
      };
      setResult(updated);
      localStorage.setItem("riasec_result", JSON.stringify(updated));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      setRefineError(msg);
    } finally {
      setRefining(false);
    }
  };

  if (!loaded) {
    return (
      <main className="min-h-screen bg-warm-bg flex items-center justify-center">
        <p className="text-sm text-ink-muted">加载中…</p>
      </main>
    );
  }

  if (!result) return null;

  // 答得太少 — 提示重答(如果有 draft 也提示「继续上次」)
  if (result.confidence === "none") {
    let hasDraft = false;
    let draftAnswered = 0;
    try {
      const rawDraft = window.localStorage.getItem("m1_quiz_draft");
      if (rawDraft) {
        const parsedDraft = JSON.parse(rawDraft) as { answers?: Record<string, unknown> };
        draftAnswered = parsedDraft.answers
          ? Object.keys(parsedDraft.answers).length
          : 0;
        hasDraft = draftAnswered > 0;
      }
    } catch {
      hasDraft = false;
    }
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg pt-32 px-6">
          <div className="max-w-md mx-auto text-center">
            <p className="text-6xl mb-6">🤔</p>
            <h2 className="text-2xl font-bold text-ink mb-3">答得太少啦</h2>
            <p className="text-sm text-ink-soft mb-8 leading-relaxed">
              至少需要答 5 道题才能给你靠谱的推荐 — 一道一道来,不着急
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/m1/quiz"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                {hasDraft ? `继续上次(已答 ${draftAnswered} 题) →` : "重新答题 →"}
              </Link>
              {hasDraft && (
                <button
                  onClick={() => {
                    try {
                      window.localStorage.removeItem("m1_quiz_draft");
                      window.localStorage.removeItem("riasec_result");
                    } catch {
                      // ignore
                    }
                    window.location.href = "/m1/quiz";
                  }}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-6 py-2.5 text-sm font-medium hover:border-esther-blue transition-colors"
                >
                  从头开始
                </button>
              )}
            </div>
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

        {/* Fallback banner — 顶部条 */}
        {fallbackKind === "no-data" && (
          <div className="border-b border-esther-yellow/40 bg-esther-yellow/15">
            <div className="max-w-[1100px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink leading-relaxed">
                👋 你还没做过测评 — 下面是 sample 结果,先看长什么样,
                <Link
                  href="/m1/quiz"
                  className="underline text-esther-blue hover:text-esther-blue-dark ml-1"
                >
                  点这里开始测自己的 →
                </Link>
              </p>
            </div>
          </div>
        )}
        {fallbackKind === "api-error" && (
          <div className="border-b border-esther-red/40 bg-esther-red/10">
            <div className="max-w-[1100px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink leading-relaxed">
                ⚠️ 实时分析失败,先用 sample 结果占位 — 不影响你浏览结构,可点右边重试真实分析。
              </p>
              <button
                onClick={handleRetryAnalysis}
                disabled={retrying || !result.answers}
                className="inline-flex items-center justify-center rounded-full bg-esther-red text-white px-4 py-1.5 text-xs font-medium hover:bg-esther-red/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {retrying ? "重试中…" : "重试分析"}
              </button>
            </div>
          </div>
        )}

        {/* 页面标题 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-10">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors"
              >
                ← 回首页
              </Link>
              <ResetQuizButton />
            </div>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 01 · 兴趣岗位发现
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              我们觉得你可能适合的方向
            </h1>
            <p className="text-ink-soft text-sm">
              基于霍兰德 RIASEC 6 维(18 题)+ 兴趣 tag 综合判断
            </p>
          </div>
        </section>

        {/* 雷达 + 编码 + confidence */}
        <section className="border-b border-border bg-warm-bg-deep/40">
          <div className="max-w-[1100px] mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 items-center">
            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm">
              <p className="font-display italic text-xs text-esther-blue mb-1 text-center">
                Your RIASEC Code
              </p>
              <p className="text-center text-lg font-bold text-ink mb-4 font-display italic">
                {result.code}
              </p>
              <RIASECRadar scores={result.scores} />
              <div className="flex justify-center mt-4">
                <ConfidenceBadge confidence={result.confidence} />
              </div>
              <p className="text-[11px] text-ink-muted text-center mt-3 leading-relaxed">
                每维 3-15 分(5 点 Likert × 3 题),数值越高表示倾向越强
              </p>
            </div>

            <div>
              {isSample ? (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-esther-blue/15 border-2 border-esther-blue/40 flex items-center justify-center text-2xl">
                      {SAMPLE.sampleMeta.emoji}
                    </div>
                    <div>
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border mb-1">
                        sample case
                      </span>
                      <p className="text-sm text-ink leading-relaxed">
                        {SAMPLE.sampleMeta.background}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-ink-muted uppercase tracking-wider mb-1.5 font-display italic">
                        Interest tags
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {SAMPLE.sampleMeta.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center px-2.5 py-1 rounded-md bg-esther-yellow/30 text-ink text-xs font-medium border border-esther-yellow/60"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-ink-muted uppercase tracking-wider mb-1.5 font-display italic">
                        Experiences
                      </p>
                      <ul className="space-y-1.5">
                        {SAMPLE.sampleMeta.experiences.map((e) => (
                          <li
                            key={e}
                            className="text-sm text-ink-soft flex items-start gap-2"
                          >
                            <span className="text-esther-blue mt-1 text-[8px]">●</span>
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <p className="text-xs text-ink-muted pt-2 italic font-display">
                      ↑ 这是 demo sample case;
                      <Link href="/m1/quiz" className="underline text-esther-blue ml-1">
                        点这里测自己的 →
                      </Link>
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <p className="font-display italic text-xs text-esther-blue mb-2">
                    Your code
                  </p>
                  <h2 className="text-xl font-bold text-ink mb-3">
                    {result.code}
                  </h2>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    你的 6 维分布显示你在
                    <span className="font-medium text-ink"> Top 3 维度</span>
                    特别明显,下面是基于这个判断挑出来的方向。
                  </p>
                  {result.refineCount && result.refineCount > 0 ? (
                    <p className="text-xs text-ink-muted mt-3 font-display italic">
                      已调整 {result.refineCount} 次
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 推荐依据 5 块 — AI-HR 视角"可解释推荐"能力的核心展示 */}
        <RecommendationRationale
          scores={result.scores}
          confidence={result.confidence}
          answers={result.answers}
          rationale={result.rationale}
          evidence={result.evidence}
          isSample={isSample}
        />

        {/* 自我探索 — 6 维深度解读(基于 Holland 1997 经典 RIASEC) */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              Know yourself first
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              你是怎样的人 · 6 维深度解读
            </h2>
            <p className="text-sm text-ink-soft mb-8 max-w-2xl">
              基于霍兰德 RIASEC 经典 6 维理论 — 不只是"推荐"标签,先理解你自己。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {DIMS.map((dim, idx) => {
                const score = result.scores[idx];
                const level = getDimensionLevel(score);
                const desc = DIMENSION_DESCRIPTIONS[dim];
                const isTop3 = result.code.split(" ").slice(0, 3).some((c) => c.startsWith(dim));
                const levelColor =
                  level === "high"
                    ? "bg-esther-blue text-white"
                    : level === "mid"
                    ? "bg-esther-yellow text-ink"
                    : "bg-warm-bg-deep text-ink-muted";

                return (
                  <div
                    key={dim}
                    className={`p-5 rounded-2xl border-2 transition-all ${
                      isTop3
                        ? "border-esther-blue bg-card shadow-sm"
                        : "border-border bg-card opacity-90"
                    }`}
                  >
                    <div className="flex items-baseline gap-3 mb-2 flex-wrap">
                      <span className="font-display italic text-3xl font-bold text-esther-blue">
                        {dim}
                      </span>
                      <span className="text-lg font-bold text-ink">
                        {DIMENSION_LABELS[dim].cn}
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${levelColor}`}
                      >
                        {DIMENSION_LEVEL_LABELS[level]}
                        <span className="ml-1 font-display italic">
                          {score}/15
                        </span>
                      </span>
                    </div>
                    <p className="text-sm text-ink-soft mb-3 font-medium">
                      {desc.tagline}
                    </p>
                    {isTop3 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-border">
                        <p className="text-xs text-ink-muted font-display italic">
                          You tend to ↓
                        </p>
                        <ul className="space-y-1">
                          {desc.strengths.map((s, i) => (
                            <li
                              key={i}
                              className="text-xs text-ink leading-relaxed flex items-start gap-2"
                            >
                              <span className="text-esther-blue mt-1 text-[8px]">
                                ●
                              </span>
                              {s}
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs text-ink-soft mt-3 leading-relaxed">
                          <span className="font-medium text-ink">适合方向:</span>{" "}
                          {desc.suited}
                        </p>
                        <p className="text-xs text-ink-muted/80 leading-relaxed italic">
                          <span className="font-medium">留意:</span>{" "}
                          {desc.caution}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-ink-muted mt-6 italic font-display">
              * 蓝色高亮 = 你的 Top 3 维度(优先看这 3 个) · 其他 3 维供参考
            </p>
          </div>
        </section>

        {/* 5 正向方向 — v4.1 按行业大类分组 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              {result.positive.length} directions for you · across {new Set(result.positive.map((p) => p.industry)).size} industries
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              {result.positive.length} 个推荐方向 · 覆盖 {new Set(result.positive.map((p) => p.industry)).size} 个行业大类
            </h2>
            <p className="text-sm text-ink-soft mb-10 max-w-2xl">
              下面按 <span className="font-medium text-ink">行业大类</span> 分组,每个大类下是具体职业方向 — 不再 5 个挤一类。
            </p>

            {/* 按 industry 分组渲染 */}
            <div className="space-y-8">
              {Array.from(
                result.positive.reduce<Map<string, typeof result.positive>>(
                  (map, item) => {
                    const key = item.industry || "其他";
                    if (!map.has(key)) map.set(key, []);
                    map.get(key)!.push(item);
                    return map;
                  },
                  new Map()
                )
              ).map(([industry, items]) => (
                <div key={industry}>
                  {/* 行业大类 header */}
                  <div className="flex items-baseline gap-3 mb-4 pb-2 border-b-2 border-esther-blue/20">
                    <span className="font-display italic text-2xl text-esther-blue/60">
                      ┌─
                    </span>
                    <h3 className="text-lg font-bold text-ink">
                      {industry}
                    </h3>
                    <span className="text-xs text-ink-muted font-display italic">
                      · {items.length} 个匹配职业
                    </span>
                  </div>
                  {/* 该 industry 下的职业卡片 */}
                  <div className="space-y-4 pl-6 border-l-2 border-esther-blue/10">
                    {items.map((r, idx) => (
                <Card
                  key={idx}
                  className="p-7 border-2 border-border hover:border-esther-blue transition-colors"
                >
                  <div className="flex items-start gap-5 mb-3">
                    <span className="font-display italic text-4xl font-bold text-esther-blue/40 leading-none flex-shrink-0">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1">
                      <p className="text-xs text-ink-muted mb-0.5 font-display italic">
                        {r.industry}
                      </p>
                      <h3 className="text-xl font-bold text-ink mb-2 leading-snug">
                        🎯 {r.role_type}
                      </h3>
                      <div className="flex items-center gap-3 mb-3 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-esther-yellow/30 text-ink text-[11px] font-medium">
                          匹配度 {r.match}
                        </span>
                        {typeof r.match_percentage === "number" && (
                          <div className="flex items-center gap-2 flex-1 min-w-[140px] max-w-[260px]">
                            <div className="flex-1 h-2 rounded-full bg-warm-bg-deep overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-esther-blue to-esther-yellow rounded-full transition-all duration-500"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    Math.max(0, r.match_percentage)
                                  )}%`,
                                }}
                              />
                            </div>
                            <span className="font-display italic text-sm font-bold text-esther-blue">
                              {r.match_percentage}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pl-12">
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-warm-bg-deep/50">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-esther-blue text-white flex-shrink-0">
                        why
                      </span>
                      <p className="text-sm text-ink leading-relaxed">
                        {r.why_fit}
                      </p>
                    </div>
                  </div>
                </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-ink-muted mt-8 italic leading-relaxed max-w-2xl">
              ℹ️ {result.disclaimer}
            </p>
          </div>
        </section>

        {/* 反向折叠区 */}
        <NegativeReveal items={result.negative} />

        {/* Chip 修推荐 */}
        {!isSample && result.refine_chips.length > 0 && (
          <>
            <RefineChips
              chips={result.refine_chips}
              onRefine={handleRefine}
              disabled={refining}
            />
            {refineError && (
              <div className="max-w-[1100px] mx-auto px-6 -mt-6 pb-4">
                <p className="text-sm text-esther-red">⚠️ {refineError}</p>
              </div>
            )}
            {refining && (
              <div className="max-w-[1100px] mx-auto px-6 -mt-6 pb-4">
                <p className="text-sm text-ink-soft animate-pulse">
                  不二正在重新挑…
                </p>
              </div>
            )}
          </>
        )}

        {/* 下一步 CTA */}
        <section className="border-b border-border bg-warm-bg-deep/30">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              Next steps
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              接下来想做什么?
            </h2>
            <p className="text-sm text-ink-soft mb-8">
              方向出来了,下一步可以是 ⬇️
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {NEXT_STEPS.map((s) => (
                <Link key={s.href} href={s.href} className="group block">
                  <Card className="h-full p-6 bg-card border-2 border-border hover:border-esther-blue hover:shadow-md transition-all">
                    <h3 className="text-base font-semibold text-ink mb-2 leading-snug">
                      {s.title} →
                    </h3>
                    <p className="text-sm text-ink-soft leading-relaxed">
                      {s.desc}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
              <p className="text-xs text-ink-muted flex items-center flex-wrap gap-1">
                也可以选择 →
                <ResetQuizButton className="ml-1 underline text-ink-soft hover:text-esther-blue text-xs">
                  重新做一次测评
                </ResetQuizButton>
              </p>
            </div>
          </div>
        </section>

        {/* Footer disclaimer */}
        <footer className="bg-warm-bg">
          <div className="max-w-[1100px] mx-auto px-6 py-12 text-center">
            <p className="text-sm text-ink-muted font-display italic">
              ℹ️ 测评仅供参考,愿你的热爱与擅长终在某处相逢
            </p>
            <p className="text-xs text-ink-muted mt-3 leading-relaxed">
              本测评仅辅助你探索方向,不作为筛选标准;不因学校 / 专业 / 空窗判优劣。
              <br />
              推荐方向都能追溯到你的兴趣维度和经历信号,你可以拒绝或重测。
            </p>
            <p className="text-xs text-ink-muted mt-3 leading-relaxed">
              基于霍兰德 RIASEC 经典 6 维理论(Holland, 1997),
              <br />
              题面参考 Martins et al. (2024) 心理测量学修订项
            </p>
          </div>
        </footer>

        <BuerFloatingButton />
      </main>
    </>
  );
}
