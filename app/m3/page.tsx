"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { DiaryMiningCard } from "@/components/DiaryMiningCard";

/**
 * 模块 3 · 简历整理 — 5-phase router(2026-06-04 Phase 0 改写)
 *
 * 根据 localStorage 状态决定:
 *   - 没 parsed_resume → 大 CTA「开始上传简历 →」
 *   - 有 parsed_resume,没 jd_context → 「继续 Phase 2 JD 匹配 →」
 *   - 有 jd_context,没 hidden_experiences(且非快速模式)→ 「继续 Phase 3 隐藏经验挖掘 →」
 *   - 有 hidden_experiences 或 快速模式 → 「Phase 5 整理 + 下载 Word →」
 *   - 有 final_resume → 「查看简历 + 下载 Word →」
 *
 * 双向闭环:保留 `?from=debrief` banner(从模拟面试复盘跳回时显示)
 */

type ParsedResume = {
  basic?: { name?: string | null; major?: string | null; year_level?: string | null };
  experience?: unknown[];
  projects?: unknown[];
  meta?: { parse_quality?: string };
} | null;

type JdCtx = {
  jd_summary?: string;
  priority_score?: number;
  meta?: { mode?: string };
} | null;

type HiddenList = unknown[];

type FinalResume = {
  markdown?: string;
  lastUpdated?: string;
} | null;

export default function Module3Page() {
  const [parsedResume] = useLocalState<ParsedResume>(STORAGE_KEYS.PARSED_RESUME, null);
  const [jdContext] = useLocalState<JdCtx>(STORAGE_KEYS.JD_CONTEXT, null);
  const [hiddenExperiences] = useLocalState<HiddenList>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);
  const [finalResume] = useLocalState<FinalResume>(STORAGE_KEYS.FINAL_RESUME, null);

  const [hydrated, setHydrated] = useState(false);
  const [fromDebrief, setFromDebrief] = useState(false);
  useEffect(() => {
    setHydrated(true);
    setFromDebrief(
      new URLSearchParams(window.location.search).get("from") === "debrief"
    );
  }, []);

  // 计算当前进度
  const hasParsed = !!parsedResume?.basic;
  const hasJd = !!jdContext?.jd_summary;
  const isQuickMode = jdContext?.meta?.mode === "quick";
  const hasHidden = Array.isArray(hiddenExperiences) && hiddenExperiences.length > 0;
  const hasFinal = !!finalResume?.markdown;

  // 5 phase 状态
  const phaseStatus: ("done" | "current" | "pending")[] = [
    hasParsed ? "done" : "current", // Phase 1
    hasJd ? "done" : hasParsed ? "current" : "pending", // Phase 2
    isQuickMode ? "done" : hasHidden ? "done" : hasJd ? "current" : "pending", // Phase 3
    "pending", // Phase 4 学习计划(按需 unlock)
    hasFinal ? "done" : hasJd && (hasHidden || isQuickMode) ? "current" : "pending", // Phase 5
  ];

  // 主 CTA
  type Cta = { label: string; href: string };
  let mainCta: Cta;
  let secondaryCta: Cta | null = null;

  if (!hasParsed) {
    mainCta = { label: "开始 → 上传 / 粘贴简历", href: "/m3/upload" };
  } else if (!hasJd) {
    mainCta = { label: "继续 → Phase 2 JD 匹配", href: "/m3/jd" };
    secondaryCta = { label: "回去改简历", href: "/m3/upload" };
  } else if (!isQuickMode && !hasHidden) {
    mainCta = { label: "继续 → Phase 3 隐藏经验挖掘", href: "/m3/excavate" };
    secondaryCta = { label: "改 JD", href: "/m3/jd" };
  } else if (!hasFinal) {
    mainCta = { label: "Phase 5 → 看 AI 改动建议 + 下载 Word", href: "/m3/result" };
    secondaryCta = isQuickMode
      ? { label: "想加 JD?", href: "/m3/jd" }
      : { label: "再挖几个经验", href: "/m3/excavate" };
  } else {
    mainCta = { label: "查看你的简历 + 下载 Word", href: "/m3/result" };
    secondaryCta = { label: "重新走一遍", href: "/m3/upload" };
  }

  const phaseLabels = [
    { no: "1", title: "简历解析", desc: "PDF/Word/MD 转结构化 + Anti-fab 诊断" },
    { no: "2", title: "JD 匹配", desc: "拆 JD + 找命中亮点 + gaps" },
    { no: "3", title: "隐藏经验挖掘", desc: "选择题挖你没写的素材 + R1 Skeptical 评估" },
    { no: "4", title: "学习计划", desc: "(按需 unlock,可选)" },
    { no: "5", title: "整理 + 下载", desc: "逐条确认改动 + Live Diff 6 维表 + Word" },
  ];

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* 从复盘跳来时:顶部固定的返回 banner(双向闭环) */}
        {fromDebrief && (
          <section className="bg-esther-yellow/40 border-b-2 border-esther-yellow">
            <div className="max-w-[1100px] mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-ink flex items-center gap-2">
                <span className="text-base">↩️</span>
                你刚刚从「模拟面试复盘」跳过来 — 改完简历可以回去继续看
              </p>
              <Link
                href="/m5/debrief"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm whitespace-nowrap"
              >
                ← 返回复盘
              </Link>
            </div>
          </section>
        )}

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 03 · 简历整理
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              把简历改成能过筛的版本
            </h1>
            <p className="text-ink-soft text-sm">
              5 phase:解析 → JD 匹配 → 挖隐藏经验 → 学习计划(选) → 逐条确认 + Word 下载
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
          {/* 左:主 CTA + 5 phase 进度 */}
          <div className="space-y-6">
            {/* 主 CTA 卡 */}
            <Card className="p-6 border-2 border-esther-blue bg-esther-blue/5">
              <p className="font-display italic text-xs text-esther-blue mb-2">
                Next step
              </p>
              {!hydrated ? (
                <p className="text-sm text-ink-soft">加载中...</p>
              ) : (
                <>
                  <h2 className="text-xl font-semibold text-ink mb-2">
                    {hasParsed ? (
                      <>
                        ✓ 我从你简历读到{" "}
                        <span className="text-esther-blue">
                          {parsedResume?.basic?.name ?? "?"} · {parsedResume?.basic?.major ?? "?"}
                          {parsedResume?.basic?.year_level
                            ? ` · ${parsedResume.basic.year_level}`
                            : ""}
                        </span>
                      </>
                    ) : (
                      "你还没上传简历"
                    )}
                  </h2>
                  {hasJd && (
                    <p className="text-sm text-ink-soft mb-3">
                      目标:{jdContext?.jd_summary ?? ""}
                      {jdContext?.priority_score
                        ? ` · 匹配 ${jdContext.priority_score}/5`
                        : ""}
                      {isQuickMode && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-esther-yellow text-ink text-[10px]">
                          快速模式
                        </span>
                      )}
                    </p>
                  )}
                  {hasHidden && (
                    <p className="text-sm text-ink-soft mb-3">
                      Phase 3 挖到 {hiddenExperiences.length} 个隐藏经验
                    </p>
                  )}
                  <div className="flex items-center gap-3 flex-wrap mt-4">
                    <Link
                      href={mainCta.href}
                      className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
                    >
                      {mainCta.label} →
                    </Link>
                    {secondaryCta && (
                      <Link
                        href={secondaryCta.href}
                        className="text-xs text-ink-muted hover:text-esther-blue transition-colors px-2"
                      >
                        {secondaryCta.label}
                      </Link>
                    )}
                  </div>
                </>
              )}
            </Card>

            {/* 📔 从日记挖素材(plan §8.19 §B.4)— 辅助流程,主流程无依赖 */}
            <DiaryMiningCard
              targetRole={jdContext?.jd_summary ?? null}
              jdSummary={jdContext?.jd_summary ?? null}
            />

            {/* 5 phase 进度 */}
            <Card className="p-5 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Process
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">5 个 phase 进度</h3>
              <ul className="space-y-3">
                {phaseLabels.map((p, idx) => {
                  const status = phaseStatus[idx];
                  return (
                    <li key={p.no} className="flex items-start gap-3">
                      <span
                        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          status === "current"
                            ? "bg-esther-blue text-white animate-pulse"
                            : status === "done"
                            ? "bg-esther-yellow text-ink"
                            : "bg-warm-bg-deep text-ink-muted border border-border"
                        }`}
                      >
                        {status === "done" ? "✓" : p.no}
                      </span>
                      <div className="flex-1 pt-1">
                        <p
                          className={`text-sm font-medium leading-snug ${
                            status === "current"
                              ? "text-esther-blue"
                              : status === "done"
                              ? "text-ink"
                              : "text-ink-muted"
                          }`}
                        >
                          {p.title}
                        </p>
                        <p className="text-xs text-ink-soft mt-0.5">{p.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          {/* 右:特性 + 下一模块跳转 */}
          <aside className="space-y-5">
            <Card className="p-5 border-2 border-esther-yellow/40 bg-esther-yellow/10">
              <p className="font-display italic text-xs text-esther-blue mb-2">
                How AI helps
              </p>
              <ul className="text-xs text-ink-soft space-y-2 leading-relaxed">
                <li>
                  <strong className="text-ink">Anti-fabrication 3 层防御</strong>
                  <br />
                  prompt 硬约束 + normalize 校验 + UI 显示 evidence_source
                </li>
                <li>
                  <strong className="text-ink">动态 skill routing</strong>
                  <br />
                  按 persona / role / state 路由 1-3 段补充 skill(经 A/B 实验验证 C &gt; B &gt; A)
                </li>
                <li>
                  <strong className="text-ink">Live Diff 6 维客观差异表</strong>
                  <br />
                  顶部永久区,4 维实时 + 2 维 LLM,用户可 audit
                </li>
                <li>
                  <strong className="text-ink">逐条确认改动</strong>
                  <br />
                  AI 出 N 条建议,你 accept/reject/regen,不替你决定
                </li>
              </ul>
            </Card>

            <Card className="p-5 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-2">
                Next 模块
              </p>
              <h3 className="text-sm font-semibold text-ink mb-3">改完之后...</h3>
              <Link
                href="/m5"
                className="block p-3 rounded-lg bg-warm-bg-deep/30 border border-border hover:border-esther-blue transition-colors mb-2"
              >
                <p className="text-sm font-medium text-esther-blue">
                  练一场模拟面试 →
                </p>
                <p className="text-xs text-ink-soft mt-0.5">
                  用同一份 JD 跑 1 场,看能不能讲清楚
                </p>
              </Link>
              <Link
                href="/m4"
                className="block p-3 rounded-lg bg-warm-bg-deep/30 border border-border hover:border-esther-blue transition-colors"
              >
                <p className="text-sm font-medium text-esther-blue">
                  补一段项目 →
                </p>
                <p className="text-xs text-ink-soft mt-0.5">
                  gap 难补 ≥ 3 月?2-4 周做一个项目
                </p>
              </Link>
            </Card>
          </aside>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
