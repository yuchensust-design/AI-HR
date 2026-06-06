"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import {
  EMPTY_EVIDENCE,
  submitM1Recommendation,
} from "@/lib/m1-recommend-submit";

/**
 * 模块 1 补充信息入口
 * 路由 /m1/evidence
 *
 * 流程位置:测评 ✓ → 【补充信息】→ 推荐
 *
 * 三选一:
 *   A. 上传简历 → /m1/evidence/upload
 *   B. 简单聊聊 → /m1/evidence/chat
 *   C. 跳过 → 调 recommend(无 evidence) → /m1/result
 *
 * 补充信息会跟 RIASEC 测评 + 兴趣 tag 一起做三段融合,
 * 让推荐更贴用户实际经历和方向倾向。
 */

const OPTIONS = [
  {
    key: "upload",
    href: "/m1/evidence/upload",
    emoji: "📄",
    title: "上传简历",
    desc: "PDF / Word / Markdown — 让我们快速看到你做过什么",
    detail:
      "本地解析(不传账号),提取后会摘成 1-2 段 + 关键字喂给推荐 LLM。",
    cta: "选这个 →",
    forWho: "已有简历的同学",
  },
  {
    key: "chat",
    href: "/m1/evidence/chat",
    emoji: "💬",
    title: "简单聊聊",
    desc: "随便说说方向倾向、忌讳、想法 — 1-2 句就够",
    detail:
      "比如「我倾向硬件」「不想 996」「想去稳定的国企」,我们会把你的话喂给推荐 LLM。",
    cta: "选这个 →",
    forWho: "暂时没简历 / 想补倾向的同学",
  },
];

type SkipState = "idle" | "submitting";

export default function M1EvidenceEntryPage() {
  const router = useRouter();
  const [hasAnswers, setHasAnswers] = useState<boolean | null>(null);
  const [skipState, setSkipState] = useState<SkipState>("idle");
  const [skipError, setSkipError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("m1_quiz_answers");
      setHasAnswers(Boolean(raw));
    } catch {
      setHasAnswers(false);
    }
  }, []);

  const handleSkip = async () => {
    setSkipState("submitting");
    setSkipError(null);
    const result = await submitM1Recommendation({
      evidence: {
        ...EMPTY_EVIDENCE,
        createdAt: new Date().toISOString(),
      },
    });
    if (result.ok) {
      router.push("/m1/result");
      return;
    }
    if (result.fellBackToSample) {
      // 失败但已写 sample,正常跳 result 显示 fallback banner
      router.push("/m1/result");
      return;
    }
    setSkipState("idle");
    setSkipError(result.error);
  };

  if (hasAnswers === null) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <p className="text-sm text-ink-muted font-display italic">加载中…</p>
        </main>
      </>
    );
  }

  if (!hasAnswers) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg pt-32 px-6">
          <div className="max-w-md mx-auto text-center">
            <p className="text-6xl mb-6">🧭</p>
            <h2 className="text-2xl font-bold text-ink mb-3">先做测评</h2>
            <p className="text-sm text-ink-soft mb-8 leading-relaxed">
              这一步需要先有 RIASEC 测评结果才能继续 —
              <br />
              到 /m1/quiz 答完 19 题再回来。
            </p>
            <Link
              href="/m1/quiz"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              去做测评 →
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

        {/* 顶部进度三段 */}
        <section className="border-b border-border bg-card">
          <div className="max-w-[1100px] mx-auto px-6 py-5">
            <div className="flex items-center gap-3 flex-wrap justify-between">
              <Link
                href="/"
                className="text-xs text-ink-soft hover:text-esther-blue transition-colors"
              >
                ← 回首页
              </Link>
              <div className="flex items-center gap-2 text-xs font-display italic">
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-blue/10 text-esther-blue font-medium">
                  ✓ 测评
                </span>
                <span className="text-ink-muted">›</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-yellow text-ink font-bold">
                  补充信息
                </span>
                <span className="text-ink-muted">›</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-warm-bg-deep text-ink-muted">
                  推荐
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Hero */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-10">
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-3 leading-tight">
              想让推荐更准的话,给我们点补充信息
            </h1>
            <p className="text-base text-ink-soft leading-relaxed max-w-2xl">
              测评只看出你的「兴趣倾向」,但你做过什么 / 想去什么方向 —
              这些只有你自己知道。下面三选一,
              <span className="font-medium text-ink mx-1">不补也行</span>
              ,直接看推荐 →
            </p>
            <p className="text-xs text-ink-muted mt-4 font-display italic">
              三段融合 · RIASEC + 兴趣 tag + 补充信息 → 推荐 + 可解释依据
            </p>
          </div>
        </section>

        {/* 两张主卡 + 跳过卡 */}
        <section className="border-b border-border bg-warm-bg-deep/40">
          <div className="max-w-[1100px] mx-auto px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
              {OPTIONS.map((opt) => (
                <Link key={opt.key} href={opt.href} className="group block">
                  <Card className="h-full p-7 border-2 border-border hover:border-esther-blue hover:shadow-md transition-all bg-card">
                    <div className="flex items-start gap-4 mb-3">
                      <span className="text-4xl flex-shrink-0 leading-none">
                        {opt.emoji}
                      </span>
                      <div className="flex-1">
                        <p className="text-[11px] text-ink-muted mb-0.5 font-display italic">
                          {opt.forWho}
                        </p>
                        <h3 className="text-xl font-bold text-ink mb-2 leading-snug">
                          {opt.title}
                        </h3>
                        <p className="text-sm text-ink leading-relaxed mb-3">
                          {opt.desc}
                        </p>
                        <p className="text-xs text-ink-soft leading-relaxed">
                          {opt.detail}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-medium text-esther-blue mt-4 group-hover:translate-x-1 transition-transform">
                      {opt.cta}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>

            {/* 跳过卡 */}
            <Card className="p-6 border-2 border-dashed border-border bg-warm-bg/50">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3">
                  <span className="text-2xl flex-shrink-0">⏭</span>
                  <div>
                    <h3 className="text-base font-semibold text-ink mb-1">
                      直接看推荐(跳过)
                    </h3>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      没简历 + 暂时不想聊也 OK,推荐会偏抽象一点 —
                      以后想补,从结果页右下角随时回来。
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSkip}
                  disabled={skipState === "submitting"}
                  className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-5 py-2 text-sm font-medium hover:border-esther-blue transition-colors disabled:opacity-50"
                >
                  {skipState === "submitting" ? "分析中…" : "跳过 → 看推荐"}
                </button>
              </div>
              {skipError && (
                <p className="text-xs text-esther-red mt-3">
                  ⚠️ {skipError}(已切到 sample 让你能往下走)
                </p>
              )}
            </Card>
          </div>
        </section>

        {/* 隐私说明 */}
        <footer className="bg-warm-bg">
          <div className="max-w-[1100px] mx-auto px-6 py-10 text-center">
            <p className="text-xs text-ink-muted leading-relaxed font-display italic">
              🔒 简历在浏览器本地解析,不上传账号 · 摘要 + 关键字会发给推荐 LLM,
              <br />
              不做账号级持久化 · 测评 / 简历内容存浏览器 localStorage,可随时清除
            </p>
          </div>
        </footer>
      </main>
    </>
  );
}
