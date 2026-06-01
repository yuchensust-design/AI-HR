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
import {
  DIMENSION_DESCRIPTIONS,
  DIMENSION_LABELS,
  DIMENSION_LEVEL_LABELS,
  formatHollandCode,
  getDimensionLevel,
  type Confidence,
  type Dimension,
} from "@/lib/quiz-data";

/**
 * 模块 1 测评结果页(v2 18REST-2 学术验证版)
 * 路由 /m1/result
 *
 * 数据来源:
 *   - localStorage.riasec_result(来自 /m1/quiz → /api/m1/recommend)
 *   - 没数据 → 显示陈昊 sample(评委直接访问 demo 友好)
 *
 * 18REST-2 适配:
 *   - scores 范围 0-15(原 0-10)
 *   - positive 加 match_percentage 百分比进度条
 *   - 新增 6 维详细描述展开(基于 Holland 经典 + 论文修订)
 *
 * plan §8.16 §D-§K lock + §8.17 升级层(部分)
 */

type PositiveItem = {
  industry: string;
  role_type: string;
  why_fit: string;
  match: string;
  match_percentage?: number; // 18REST-2 升级:0-100 百分比
};

type Scores = [number, number, number, number, number, number];

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
  answers?: Record<number, number | string[]>;
};

const DIMS: Dimension[] = ["R", "I", "A", "S", "E", "C"];

const SAMPLE: RecommendResult & { isSample: true; sampleMeta: { background: string; emoji: string; tags: string[]; experiences: string[] } } = {
  isSample: true,
  sampleMeta: {
    background: "CS 大四 · 1 段字节实习 · 做过 AI 学习助手项目",
    emoji: "💻",
    tags: ["数据 & AI", "内容创作"],
    experiences: ["字节用户增长实习", "AI 学习助手(B 端用户 30+)", "Python 数据分析"],
  },
  scores: [5, 13, 8, 10, 14, 6],
  code: "E14 I13 S10 A8 C6 R5",
  confidence: "high",
  positive: [
    {
      industry: "互联网",
      role_type: "AI / 增长产品经理",
      why_fit:
        "E 14 + I 13 → 你既爱推动事情发生,又重逻辑分析,跟 PM 高度契合",
      match: "高",
      match_percentage: 92,
    },
    {
      industry: "创业 / 自由职业",
      role_type: "0-1 产品创始人 / 联创",
      why_fit:
        "E 14(企业型最高)+ 已经做过 AI 学习助手 → 你不只是想'打工',更想'主导一件事'",
      match: "高",
      match_percentage: 89,
    },
    {
      industry: "互联网",
      role_type: "数据分析师 / 增长分析",
      why_fit: "I 13 + C 6 → 你重数据推理,愿意系统化拆解,适合用数字说话的角色",
      match: "高",
      match_percentage: 86,
    },
    {
      industry: "互联网",
      role_type: "用户研究员",
      why_fit: "I 13 + S 10 → 你愿意挖背后原理,又能跟人聊,适合做用户洞察",
      match: "中",
      match_percentage: 78,
    },
    {
      industry: "互联网",
      role_type: "内容运营",
      why_fit:
        "选了内容创作兴趣 + S 10 → 你能持续表达 + 跟用户互动,适合做内容驱动的运营",
      match: "中",
      match_percentage: 71,
    },
  ],
  negative: [
    {
      industry: "传统行政",
      role_type: "档案管理 / 资料录入",
      why_consuming:
        "这类岗位 80% 时间在重复处理标准化流程,你的 E + I 表达欲会被压抑",
    },
    {
      industry: "销售商务",
      role_type: "电话销售 / 地推",
      why_consuming:
        "你的 I 13 偏好深度思考,纯转化型销售对'快节奏 + 浅交互'的要求会让你疲倦",
    },
    {
      industry: "制造业",
      role_type: "质量管理 / 品控",
      why_consuming:
        "C 6 + R 5 都不算高,这类岗位长期靠流程 + 标准化,你的创造性会找不到出口",
    },
  ],
  refine_chips: ["去掉销售类岗位", "想要更稳定的方向", "加技术深度", "偏内容创作"],
  disclaimer:
    "本次推荐基于测评 + 兴趣 — 没看你的真实经历。投递前请先用『简历整理』模块结合 JD 确认能力对齐。",
  completedAt: new Date().toISOString(),
  refineCount: 0,
};

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

export default function Module1ResultPage() {
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("riasec_result");
      if (raw) {
        const parsed = JSON.parse(raw) as RecommendResult;
        // 真用户数据要含 positive 数组才算有效
        if (parsed.positive && Array.isArray(parsed.positive) && parsed.positive.length > 0) {
          setResult(parsed);
          setIsSample(false);
          setLoaded(true);
          return;
        }
      }
    } catch (e) {
      console.warn("riasec_result parse failed:", e);
    }
    // fallback → sample
    setResult(SAMPLE);
    setIsSample(true);
    setLoaded(true);
  }, []);

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

  // 答得太少 — 提示重答
  if (result.confidence === "none") {
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
            <Link
              href="/m1/quiz"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              重新答题 →
            </Link>
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
              基于 18REST-2 学术量表(18 题)+ 兴趣 tag 综合判断
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

        {/* 自我探索 — 6 维深度解读(基于 Holland 1997 经典 + 18REST-2 修订) */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              Know yourself first
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              你是怎样的人 · 6 维深度解读
            </h2>
            <p className="text-sm text-ink-soft mb-8 max-w-2xl">
              基于霍兰德经典 6 维 + 18REST-2 修订项 — 不只是"推荐"标签,先理解你自己。
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

        {/* 5 正向方向 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              {result.positive.length} directions for you
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              {result.positive.length} 个推荐方向(按贴合度排)
            </h2>
            <p className="text-sm text-ink-soft mb-10 max-w-2xl">
              下面方向是基于你的测评 + 兴趣的双维度判断 — 拿着方向去看具体岗位 / 整理简历都更聚焦。
            </p>

            <div className="space-y-5">
              {result.positive.map((r, idx) => (
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
              测评基于 <span className="font-medium">18REST-2</span> 学术量表
              (Martins et al., 2024, <em>J. Career Assessment</em> 33(1)),
              <br />
              结合霍兰德 RIASEC 经典 6 维理论(Holland, 1997)
            </p>
          </div>
        </footer>

        <BuerFloatingButton />
      </main>
    </>
  );
}
