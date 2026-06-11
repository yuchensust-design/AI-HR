"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { RIASECRadar } from "@/components/RIASECRadar";

/**
 * 模块 1 入口页
 * 路由 /m1
 * 逻辑:
 *   - localStorage 有 riasec_result → 自动 redirect /m1/result
 *   - 无 → 显示 entry 长页(入口 + 测评特点 + sample inline 案例 + 二次 CTA)
 */

// 测评特点 — 为什么这个结果值得参考(全部正向陈述,不贬低任何同类工具)
const FEATURES = [
  {
    emoji: "🧭",
    title: "霍兰德 RIASEC · 50 年学术理论",
    desc: "由美国心理学家 Holland 于 1959 年提出,被 O*NET 等国际职业指导系统采用至今 · 6 维度(实用/研究/艺术/社交/企业/常规)从职业兴趣偏好层面拆解你",
  },
  {
    emoji: "🎯",
    title: "测评 + 你的经历 交叉验证",
    desc: "单一测评容易判断片面 — 我们让你同时补一段简历或经历;两个信号交叉,推荐更贴你做过什么、喜不喜欢做",
  },
  {
    emoji: "💬",
    title: "每条推荐都给「为什么」",
    desc: "每个方向都会告诉你 RIASEC 哪几维支撑 + 哪段经历呼应 · 你可以拒绝任何一条,可以随时重测",
  },
];

// Sample 数据(跟 /m1/result 一致)
const SAMPLE = {
  background: "CS 大四 · 1 段字节实习 · 做过 AI 学习助手项目",
  emoji: "💻",
  riasec: [5, 8, 4, 6, 9, 5] as [number, number, number, number, number, number],
  riasecCode: "E9 I8 S6 R5 C5 A4",
};

const SAMPLE_RECOMMENDATIONS = [
  {
    no: "01",
    direction: "AI / 互联网 产品经理",
    why: "E 9 + I 8 → 你既爱推动事情发生(企业型),又重逻辑分析(研究型);加上字节实习 + AI 项目,跟 AI PM 重合度高",
    chips: ["E 主导", "技术理解", "数据驱动"],
  },
  {
    no: "02",
    direction: "数据分析 / 增长策略",
    why: "I 8 + Python 数据基础 → 你重数据推理,适合面向产品的数据角色",
    chips: ["I 主导", "数据"],
  },
  {
    no: "03",
    direction: "互联网 / AI 创业方向",
    why: "E 9(企业型最高)+ 你已经在做 0→1(AI 学习助手 30+ 用户) → 适合早期项目",
    chips: ["E 极高", "0→1 经历"],
  },
];

export default function Module1EntryPage() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // 检查 localStorage 是否有测评结果
    const result = localStorage.getItem("riasec_result");
    if (result) {
      router.replace("/m1/result");
    } else {
      setChecked(true);
    }
  }, [router]);

  if (!checked) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <p className="text-sm text-ink-muted font-display italic">加载中...</p>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* ==========================================================
            Section 1: Hero / 测评入口
            ========================================================== */}
        <section className="border-b border-border">
          <div className="max-w-[1300px] mx-auto px-6 py-12">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-6"
            >
              ← 回首页
            </Link>
            <h1 className="text-3xl md:text-5xl font-bold text-ink mb-4 leading-tight">
              先让我了解一下你
            </h1>
            <p className="text-base md:text-lg text-ink-soft leading-relaxed mb-8 max-w-2xl">
              这是一次轻松的{" "}
              <span
                className="bg-esther-yellow/40"
                style={{ padding: "0 0.15em" }}
              >
                自我对话
              </span>{" "}
              — 愿你的热爱与擅长终在某处相逢
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/m1/quiz"
                className="inline-flex flex-col items-center justify-center rounded-2xl bg-esther-blue text-white px-7 py-3.5 hover:bg-esther-blue-dark transition-colors shadow-md"
              >
                <span className="text-base font-medium">快速测评 →</span>
                <span className="text-[11px] opacity-80 font-display italic">18 题 · 约 3 分钟</span>
              </Link>
              <Link
                href="/m1/quiz?v=full"
                className="inline-flex flex-col items-center justify-center rounded-2xl border-2 border-esther-blue text-esther-blue px-7 py-3.5 hover:bg-esther-blue/5 transition-colors"
              >
                <span className="text-base font-medium">完整版 →</span>
                <span className="text-[11px] opacity-80 font-display italic">60 题 · 更准 · 约 8 分钟</span>
              </Link>
            </div>
            <a
              href="#sample"
              className="inline-flex items-center mt-3 text-sm font-medium text-ink-soft hover:text-esther-blue transition-colors"
            >
              先往下看看结果长什么样 ↓
            </a>
          </div>
        </section>

        {/* ==========================================================
            Section 1.5: 你会拿到什么 + How it works (借鉴原型布局)
            ========================================================== */}
        {/* ==========================================================
            Section 2: 流程图 — 测评 + 经历 → 推荐方向(体现融合 + 创新)
            ========================================================== */}
        <section className="bg-warm-bg-deep/40 border-b border-border">
          <div className="max-w-[1300px] mx-auto px-6 py-16">
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3 text-center">
              测评 + 经历 → 推荐方向
            </h2>
            <p className="text-center text-ink-soft text-base leading-relaxed mb-10">
              你做过什么，决定你现在能去哪里<br />
              你热爱什么，照亮你最终该去哪里
            </p>

            <FusionDiagram />
          </div>
        </section>

        {/* ==========================================================
            Section 3: Sample 案例 inline 展示
            ========================================================== */}
        <section id="sample" className="border-b border-border relative overflow-hidden">
          {/* 装饰 */}
          <div className="pointer-events-none absolute -right-4 top-8 select-none leading-none font-display italic font-bold text-[clamp(5rem,10vw,9rem)] text-esther-yellow/20">
            Sample
          </div>

          <div className="max-w-[1300px] mx-auto px-6 py-16 relative">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              See it in action
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              测评结果长这样 👀
            </h2>
            <p className="text-sm text-ink-soft mb-10 max-w-2xl">
              下面是一个 <span className="font-medium text-ink">陈昊</span>(CS 大四,冲字节 AI PM 实习)
              的 sample 结果 — 你看完大概就知道自己测完会拿到什么
            </p>

            {/* 雷达图 + 身份 */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8 items-center mb-10">
              {/* 左:雷达图 */}
              <div className="bg-card rounded-3xl p-6 border-2 border-border shadow-sm">
                <p className="font-display italic text-xs text-esther-blue mb-1 text-center">
                  你的职业兴趣画像
                </p>
                <p className="text-center text-xs text-ink-muted mb-3">
                  <span className="font-mono">{SAMPLE.riasecCode}</span>
                </p>
                <RIASECRadar scores={SAMPLE.riasec} />
                <p className="text-[11px] text-ink-muted text-center mt-2">
                  示意 demo · 实际每维 3-15 分,数值越高倾向越强
                </p>
              </div>

              {/* 右:身份 */}
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-esther-blue/15 border-2 border-esther-blue/40 flex items-center justify-center text-2xl">
                    {SAMPLE.emoji}
                  </div>
                  <div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border mb-1">
                      sample
                    </span>
                    <p className="text-sm text-ink">{SAMPLE.background}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-warm-bg-deep/50 border border-border">
                    <p className="text-xs font-semibold text-ink mb-1.5">
                      📊 测评层
                    </p>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      RIASEC 编码主导 <strong className="text-esther-blue">E 9 + I 8</strong>(企业型 + 研究型)
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-warm-bg-deep/50 border border-border">
                    <p className="text-xs font-semibold text-ink mb-1.5">
                      💼 经历层
                    </p>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      字节用户增长实习 · AI 学习助手项目(30+ 用户)· Python 数据分析
                    </p>
                  </div>
                  <p className="text-[11px] text-ink-muted font-display italic">
                    ↓ 两个信号交叉,得出下面 3 个方向
                  </p>
                </div>
              </div>
            </div>

            {/* 3 推荐方向(简化) */}
            <div className="space-y-3">
              {SAMPLE_RECOMMENDATIONS.map((r) => (
                <Card
                  key={r.no}
                  className="p-5 border-2 border-border bg-card"
                >
                  <div className="flex items-start gap-4">
                    <span className="font-display italic text-3xl font-bold text-esther-blue/40 leading-none flex-shrink-0">
                      {r.no}
                    </span>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-ink mb-1.5 leading-snug">
                        🎯 {r.direction}
                      </h3>
                      <p className="text-xs text-ink-soft leading-relaxed mb-2">
                        {r.why}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {r.chips.map((c) => (
                          <span
                            key={c}
                            className="inline-flex items-center px-2 py-0.5 rounded-md bg-esther-blue/10 text-esther-blue text-[11px] font-medium"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <p className="text-xs text-ink-muted text-center mt-6 font-display italic">
              ↑ 这是 sample · 你自己的测评结果会基于你的真实答案 + 经历
            </p>
          </div>
        </section>

        {/* ==========================================================
            Section 4: 二次 CTA
            ========================================================== */}
        <section className="bg-warm-bg">
          <div className="max-w-[800px] mx-auto px-6 py-16 text-center">
            <p className="font-display italic text-sm text-esther-blue mb-3">
              Your turn
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              花 3 分钟，认识一个更完整的自己
            </h2>
            <p className="text-sm text-ink-soft mb-8 max-w-md mx-auto leading-relaxed">
              没有标准答案，也没有好坏之分<br />
              只是想帮你看清楚，你真正对什么感兴趣、在哪里能发光
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/m1/quiz"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-8 py-4 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
              >
                快速测评(18 题)→
              </Link>
              <Link
                href="/m1/quiz?v=full"
                className="inline-flex items-center justify-center rounded-full border-2 border-esther-blue text-esther-blue px-8 py-4 text-base font-medium hover:bg-esther-blue/5 transition-colors"
              >
                完整版(60 题·更准)→
              </Link>
            </div>
          </div>
        </section>

        <BuerFloatingButton />
      </main>
    </>
  );
}

/**
 * FusionDiagram — 测评 + 经历 → 推荐方向 融合示意图
 * 用 SVG + Tailwind 实现:
 *   左上 信号 A:RIASEC 测评(blue)
 *   左下 信号 B:你做过的事(yellow)
 *   中 汇流 SVG 弧线
 *   右 输出:3 类推荐方向 + 配「为什么」(card)
 */
function FusionDiagram() {
  return (
    <div className="relative">
      {/* Desktop: 3 列布局 */}
      <div className="hidden md:grid grid-cols-[1fr_auto_1.2fr] items-center gap-6 lg:gap-10">
        {/* 左:2 个信号源 — 白底 + 左侧 accent bar */}
        <div className="space-y-5">
          {/* 信号 A */}
          <div className="group relative rounded-3xl bg-card border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-esther-blue" />
            <div className="flex items-center gap-3 mb-2 pl-2">
              <span className="text-2xl">🧭</span>
              <p className="text-sm font-semibold text-ink leading-snug">
                信号 A · 霍兰德 RIASEC · 50 年学术理论
              </p>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed pl-2">
              <span className="font-semibold text-ink">国际职业指导通用框架</span>,6 维(R/I/A/S/E/C)拆解你的兴趣偏好
            </p>
          </div>

          {/* 信号 B */}
          <div className="group relative rounded-3xl bg-card border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all p-5 overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-esther-yellow" />
            <div className="flex items-center gap-3 mb-2 pl-2">
              <span className="text-2xl">🎯</span>
              <p className="text-sm font-semibold text-ink leading-snug">
                信号 B · 你真做过的事
              </p>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed pl-2">
              上传简历或聊 1-2 段经历,看你实际<span className="font-medium text-ink">做过什么</span>、做得<span className="font-medium text-ink">喜不喜欢</span>
            </p>
          </div>
        </div>

        {/* 中:汇流 SVG — 优雅曲线 + 双色渐变光晕 */}
        <div className="flex items-center justify-center" aria-hidden>
          <svg width="140" height="180" viewBox="0 0 140 180">
            <defs>
              {/* 中心光晕渐变 */}
              <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="rgb(43,127,216)" stopOpacity="0.35" />
                <stop offset="60%" stopColor="rgb(218,180,56)" stopOpacity="0.15" />
                <stop offset="100%" stopColor="rgb(218,180,56)" stopOpacity="0" />
              </radialGradient>
              {/* 蓝线渐变 */}
              <linearGradient id="blueLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(43,127,216)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="rgb(43,127,216)" stopOpacity="0.9" />
              </linearGradient>
              {/* 黄线渐变 */}
              <linearGradient id="yellowLine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgb(218,180,56)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="rgb(218,180,56)" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* 中心光晕 */}
            <circle cx="80" cy="90" r="32" fill="url(#centerGlow)" />

            {/* 上半曲线(blue) — 优雅 Bezier */}
            <path
              d="M 0 30 C 40 30, 55 60, 78 86"
              fill="none"
              stroke="url(#blueLine)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {/* 下半曲线(yellow) */}
            <path
              d="M 0 150 C 40 150, 55 120, 78 94"
              fill="none"
              stroke="url(#yellowLine)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            {/* 中心汇合点 — 双层圆 */}
            <circle
              cx="80"
              cy="90"
              r="9"
              fill="white"
              stroke="rgb(43,127,216)"
              strokeWidth="1.5"
            />
            <circle cx="80" cy="90" r="3.5" fill="rgb(43,127,216)" />

            {/* 出口曲线 + 三角箭头 */}
            <path
              d="M 89 90 C 105 90, 115 90, 126 90"
              fill="none"
              stroke="rgb(43,127,216)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <polygon
              points="126,86 134,90 126,94"
              fill="rgb(43,127,216)"
            />
          </svg>
        </div>

        {/* 右:推荐方向 — 白底 + esther-blue 装饰角 */}
        <div className="relative rounded-3xl bg-card border border-border shadow-sm p-6 md:p-7 overflow-hidden">
          {/* 角落装饰大字 */}
          <div className="pointer-events-none absolute -right-2 -bottom-2 select-none leading-none font-display italic text-[clamp(4rem,7vw,6rem)] text-esther-blue/[0.06] font-bold">
            3
          </div>
          <ul className="space-y-4 relative">
            <li className="flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-esther-blue/[0.08] text-esther-blue border border-esther-blue/25 flex-shrink-0 whitespace-nowrap">
                现在可以投
              </span>
              <span className="text-sm text-ink">
                2-3 个本季可投的实习 / 校招方向
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-esther-yellow/[0.18] text-ink border border-esther-yellow/50 flex-shrink-0 whitespace-nowrap">
                值得去探索
              </span>
              <span className="text-sm text-ink">
                值得花半年试一试的方向
              </span>
            </li>
            <li className="flex items-center gap-3">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-esther-red/[0.08] text-esther-red border border-esther-red/25 flex-shrink-0 whitespace-nowrap">
                长期可培养
              </span>
              <span className="text-sm text-ink">
                需要补能力、但跟你性格匹配的方向
              </span>
            </li>
          </ul>
        </div>
      </div>

      {/* Mobile: 纵向 */}
      <div className="md:hidden space-y-4">
        <div className="rounded-2xl border-2 border-esther-blue/40 bg-esther-blue/[0.06] p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xl">🧭</span>
            <p className="text-sm font-semibold text-ink">信号 A · RIASEC 测评</p>
          </div>
          <p className="text-xs text-ink-soft">19 题量化职业兴趣 → 6 维分布</p>
        </div>
        <p className="text-center text-esther-blue/60 text-xl leading-none">+</p>
        <div className="rounded-2xl border-2 border-esther-yellow/60 bg-esther-yellow/[0.12] p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xl">🎯</span>
            <p className="text-sm font-semibold text-ink">信号 B · 你真做过的事</p>
          </div>
          <p className="text-xs text-ink-soft">上传简历或聊经历 → 看你做过什么</p>
        </div>
        <p className="text-center text-esther-blue/60 text-xl leading-none">↓ 交叉验证</p>
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-esther-blue/[0.08] text-esther-blue border border-esther-blue/25 whitespace-nowrap">
              现在可以投
            </span>
            <span className="text-xs text-ink">本季实习 / 校招方向</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-esther-yellow/[0.18] text-ink border border-esther-yellow/50 whitespace-nowrap">
              值得去探索
            </span>
            <span className="text-xs text-ink">值得花半年试一试</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-esther-red/[0.08] text-esther-red border border-esther-red/25 whitespace-nowrap">
              长期可培养
            </span>
            <span className="text-xs text-ink">性格匹配但要补能力</span>
          </div>
        </div>
      </div>
    </div>
  );
}
