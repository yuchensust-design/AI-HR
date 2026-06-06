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

// 测评特点
const FEATURES = [
  {
    emoji: "⏱️",
    title: "3-4 分钟做完",
    desc: "19 题 · 每题 4 选项 · 可跳过 · 零打字,不耽误你时间",
  },
  {
    emoji: "🧭",
    title: "霍兰德 RIASEC",
    desc: "国际经典职业兴趣理论 · 6 维度科学拆解 · 不是网上随便凑的题",
  },
  {
    emoji: "🎯",
    title: "测评 + 经历 双信号",
    desc: "不只看测评 — 也问你做过什么、喜不喜欢做,两个信号交叉判断更准",
  },
  {
    emoji: "💬",
    title: "永远说人话",
    desc: "每条推荐都给「为什么觉得你可能适合」,不当 black box,你能判断对不对",
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
    why: "E 9 + I 8 → 你既爱推动事情发生(企业型),又重逻辑分析(研究型);加上字节实习 + AI 项目,跟 AI PM 重合度高。",
    chips: ["E 主导", "技术理解", "数据驱动"],
  },
  {
    no: "02",
    direction: "数据分析 / 增长策略",
    why: "I 8 + Python 数据基础 → 你重数据推理,适合面向产品的数据角色。",
    chips: ["I 主导", "数据"],
  },
  {
    no: "03",
    direction: "互联网 / AI 创业方向",
    why: "E 9(企业型最高)+ 你已经在做 0→1(AI 学习助手 30+ 用户) → 适合早期项目。",
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
          <div className="max-w-[1100px] mx-auto px-6 py-12">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-6"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-4 px-3 py-1 text-xs font-medium">
              模块 01 · 兴趣岗位发现
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold text-ink mb-4 leading-tight">
              先让我了解一下你
            </h1>
            <p className="text-base md:text-lg text-ink-soft leading-relaxed mb-8 max-w-2xl">
              18 题职业兴趣测评 + 1 题兴趣选择 · 3-4 分钟做完 · 然后给你
              <span
                className="bg-esther-yellow/40 mx-1"
                style={{ padding: "0 0.15em" }}
              >
                3-5 个可能适合的方向
              </span>
              + 每条都告诉你「为什么」。
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/m1/quiz"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-8 py-4 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
              >
                开始测评 →
              </Link>
              <a
                href="#sample"
                className="inline-flex items-center justify-center px-5 py-3 text-sm font-medium text-ink-soft hover:text-esther-blue transition-colors"
              >
                先往下看看结果长什么样 ↓
              </a>
            </div>
          </div>
        </section>

        {/* ==========================================================
            Section 2: 测评特点
            ========================================================== */}
        <section className="bg-warm-bg-deep/40 border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <h2 className="text-xl md:text-2xl font-semibold text-ink mb-8">
              4 件事让结果不只是性格 quiz
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {FEATURES.map((f, i) => (
                <Card
                  key={i}
                  className="p-6 border-2 border-border bg-card hover:border-esther-blue transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <span className="text-3xl flex-shrink-0">{f.emoji}</span>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-ink mb-2 leading-snug">
                        {f.title}
                      </h3>
                      <p className="text-sm text-ink-soft leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
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

          <div className="max-w-[1100px] mx-auto px-6 py-16 relative">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              See it in action
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              测评结果长这样 👀
            </h2>
            <p className="text-sm text-ink-soft mb-10 max-w-2xl">
              下面是一个 <span className="font-medium text-ink">陈昊</span>(CS 大四,冲字节 AI PM 实习)
              的 sample 结果 — 你看完大概就知道自己测完会拿到什么。
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
              准备好开始你自己的测评了吗?
            </h2>
            <p className="text-sm text-ink-soft mb-8 max-w-md mx-auto">
              3-4 分钟 · 完成后给你 3-5 个推荐方向 · 仅辅助探索方向,不作为筛选标准
            </p>
            <Link
              href="/m1/quiz"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-10 py-4 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
            >
              开始测评 → 看你自己的结果
            </Link>
            <p className="text-xs text-ink-muted mt-6 font-display italic">
              🔒 答题本地保存 · 仅辅助探索方向
            </p>
          </div>
        </section>

        <BuerFloatingButton />
      </main>
    </>
  );
}
