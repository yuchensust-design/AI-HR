"use client";

import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";
import { DiaryMiningCard } from "@/components/DiaryMiningCard";
import { useM3Data } from "@/lib/sync/useM3Data";
import { useUser } from "@/lib/auth/useUser";

/**
 * 模块 3 · 简历整理 — 多会话版(plan §8.24)
 *
 * Layout: 左 ConversationSwitcher sidebar + 右主内容
 * 数据隔离:
 *   - 游客:localStorage 单轨(沿用)
 *   - 登录 + 有 convId:从 m3_resumes 表读(按 conversation_id + RLS 防越权)
 *   - 登录 + 没 convId:提示"选左侧会话或新建"
 */

export default function Module3Page() {
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
      <Module3Content />
    </Suspense>
  );
}

function Module3Content() {
  const sp = useSearchParams();
  const convId = sp.get("c");
  const { user, loading: userLoading } = useUser();
  const { data, loading: dataLoading, isGuest, hasConv } = useM3Data(convId);

  const [hydrated, setHydrated] = useState(false);
  const [fromDebrief, setFromDebrief] = useState(false);
  useEffect(() => {
    setHydrated(true);
    setFromDebrief(
      new URLSearchParams(window.location.search).get("from") === "debrief",
    );
  }, []);

  const parsedResume = data.parsed;
  const jdContext = data.jd;
  const hiddenExperiences = data.hidden;
  const finalResume = data.final;

  const hasParsed = !!parsedResume?.basic;
  const hasJd = !!jdContext?.jd_summary;
  const isQuickMode = jdContext?.meta?.mode === "quick";
  const hasHidden = Array.isArray(hiddenExperiences) && hiddenExperiences.length > 0;
  const hasFinal = !!finalResume?.markdown;

  const phaseStatus: ("done" | "current" | "pending")[] = [
    hasParsed ? "done" : "current",
    hasJd ? "done" : hasParsed ? "current" : "pending",
    isQuickMode ? "done" : hasHidden ? "done" : hasJd ? "current" : "pending",
    "pending",
    hasFinal ? "done" : hasJd && (hasHidden || isQuickMode) ? "current" : "pending",
  ];

  type Cta = { label: string; href: string };
  const convQs = convId ? `?c=${convId}` : "";
  let mainCta: Cta;
  let secondaryCta: Cta | null = null;

  if (!hasParsed) {
    mainCta = { label: "开始 → 上传 / 粘贴简历", href: `/m3/upload${convQs}` };
  } else if (!hasJd) {
    mainCta = { label: "继续 → Phase 2 JD 匹配", href: `/m3/jd${convQs}` };
    secondaryCta = { label: "回去改简历", href: `/m3/upload${convQs}` };
  } else if (!isQuickMode && !hasHidden) {
    mainCta = { label: "继续 → Phase 3 隐藏经验挖掘", href: `/m3/excavate${convQs}` };
    secondaryCta = { label: "改 JD", href: `/m3/jd${convQs}` };
  } else if (!hasFinal) {
    mainCta = { label: "Phase 5 → 看 AI 改动建议 + 下载 Word", href: `/m3/result${convQs}` };
    secondaryCta = isQuickMode
      ? { label: "想加 JD?", href: `/m3/jd${convQs}` }
      : { label: "再挖几个经验", href: `/m3/excavate${convQs}` };
  } else {
    mainCta = { label: "查看你的简历 + 下载 Word", href: `/m3/result${convQs}` };
    secondaryCta = { label: "重新走一遍", href: `/m3/upload${convQs}` };
  }

  const phaseLabels = [
    { no: "1", title: "简历解析", desc: "PDF/Word/MD 自动结构化,AI 推测处标记给你确认" },
    { no: "2", title: "JD 匹配", desc: "拆 JD · 找你已有的亮点 · 列差距" },
    { no: "3", title: "挖隐藏经验", desc: "选择题挖你简历没写的素材 + 真实性追问" },
    { no: "4", title: "学习计划", desc: "(按需展开,补差距用)" },
    { no: "5", title: "整理 + 下载", desc: "逐条 accept/reject + 跟原版对比 + 下载 Word" },
  ];

  // 登录但没选 conv → 空状态
  const needPickConv = !userLoading && !!user && !hasConv;
  const isLoadingAll = userLoading || (!isGuest && hasConv && dataLoading);

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {fromDebrief && (
          <section className="bg-esther-yellow/40 border-b-2 border-esther-yellow">
            <div className="max-w-[1300px] mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
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

        <div className="flex">
          <ConversationSwitcher module="m3" basePath="/m3" defaultTitle="简历" />

          <div className="flex-1 min-w-0">
            {/* 模块顶部 */}
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

            {/* 主内容 */}
            {needPickConv ? (
              <div className="max-w-[1100px] mx-auto px-6 py-20 text-center">
                <p className="font-display italic text-esther-blue text-sm mb-3">
                  Pick a conversation
                </p>
                <h2 className="text-2xl font-bold text-ink mb-3">
                  选择左侧会话,或新建一份简历
                </h2>
                <p className="text-sm text-ink-soft max-w-md mx-auto leading-relaxed">
                  每份简历独立保存,数据互不影响。
                  <br />
                  你可以同时投不同公司、不同岗位,各自调整。
                </p>
              </div>
            ) : isLoadingAll ? (
              <div className="max-w-[1100px] mx-auto px-6 py-20 text-center text-ink-muted">
                加载中…
              </div>
            ) : (
              <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8">
                {/* 左:主 CTA + 5 phase 进度 */}
                <div className="space-y-6">
                  <Card className="p-6 border-2 border-esther-blue bg-esther-blue/5">
                    <p className="font-display italic text-xs text-esther-blue mb-2">Next step</p>
                    {!hydrated ? (
                      <p className="text-sm text-ink-soft">加载中...</p>
                    ) : (
                      <>
                        <h2 className="text-xl font-semibold text-ink mb-2">
                          {hasParsed ? (
                            <>
                              ✓ 我从你简历读到{" "}
                              <span className="text-esther-blue">
                                {parsedResume?.basic?.name ?? "?"} ·{" "}
                                {parsedResume?.basic?.major ?? "?"}
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

                  <DiaryMiningCard
                    targetRole={jdContext?.jd_summary ?? null}
                    jdSummary={jdContext?.jd_summary ?? null}
                  />

                  <Card className="p-5 border-2 border-border">
                    <p className="font-display italic text-xs text-esther-blue mb-3">Process</p>
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
                    <p className="font-display italic text-xs text-esther-blue mb-2">为什么这次改的简历可靠</p>
                    <ul className="text-xs text-ink-soft space-y-2 leading-relaxed">
                      <li>
                        <strong className="text-ink">AI 推测的会标出来</strong>
                        <br />
                        如果是 AI 推测的内容,会标"待你确认",不会偷偷塞进最终简历
                      </li>
                      <li>
                        <strong className="text-ink">每条建议你来拍板</strong>
                        <br />
                        AI 给 N 条建议,你逐条 ✓ 采纳 / ✗ 跳过 / ↻ 重生 — 不替你决定
                      </li>
                      <li>
                        <strong className="text-ink">改完跟原版对比</strong>
                        <br />
                        JD 关键词命中数 / 量化 bullet 数 / 字数 实时显示,看进步
                      </li>
                      <li>
                        <strong className="text-ink">根据你的目标推内容</strong>
                        <br />
                        不是套模板 — 按你的 JD / 经历组合给针对性建议
                      </li>
                    </ul>
                    <details className="mt-3">
                      <summary className="text-[10px] text-ink-muted cursor-pointer hover:text-ink-soft">
                        ▸ 技术细节(给评委看)
                      </summary>
                      <ul className="text-[10px] text-ink-muted space-y-1 mt-2 pl-3">
                        <li>· Anti-fabrication 3 层:prompt 硬约束 + normalize 校验 + UI 标 evidence_source</li>
                        <li>· Live Diff 6 维表:4 维规则实时计算 + 2 维 LLM 评估</li>
                        <li>· 动态 skill routing:按 persona / role / state 路由 1-3 段补充 skill</li>
                      </ul>
                    </details>
                  </Card>

                  <Card className="p-5 border-2 border-border">
                    <p className="font-display italic text-xs text-esther-blue mb-2">Next 模块</p>
                    <h3 className="text-sm font-semibold text-ink mb-3">改完之后...</h3>
                    <Link
                      href="/m5"
                      className="block p-3 rounded-lg bg-warm-bg-deep/30 border border-border hover:border-esther-blue transition-colors mb-2"
                    >
                      <p className="text-sm font-medium text-esther-blue">练一场模拟面试 →</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        用同一份 JD 跑 1 场,看能不能讲清楚
                      </p>
                    </Link>
                    <Link
                      href="/m4"
                      className="block p-3 rounded-lg bg-warm-bg-deep/30 border border-border hover:border-esther-blue transition-colors"
                    >
                      <p className="text-sm font-medium text-esther-blue">补一段项目 →</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        gap 难补 ≥ 3 月?2-4 周做一个项目
                      </p>
                    </Link>
                  </Card>
                </aside>
              </div>
            )}
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
