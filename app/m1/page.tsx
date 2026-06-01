import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { RIASECRadar } from "@/components/RIASECRadar";

/**
 * 模块 1 · 兴趣岗位发现 - 测评结果页(sample case 陈昊)
 * 路由 /m1
 * PRD §3.2.5: 永不推具体公司名 + 每条推荐必给"为什么"(测评 + 经历 双维度)
 */

// 陈昊 sample 数据
const SAMPLE = {
  background: "CS 大四 · 1 段字节实习 · 做过 AI 学习助手项目",
  emoji: "💻",
  riasec: [5, 8, 4, 6, 9, 5] as [number, number, number, number, number, number],
  // [R 实用, I 研究, A 艺术, S 社交, E 企业, C 常规]
  riasecCode: "E9 I8 S6 R5 C5 A4",
  interestTags: ["数据 & AI", "内容创作"],
  experiences: ["字节用户增长实习", "AI 学习助手(B 端用户 30+)", "Python 数据分析"],
};

const RECOMMENDATIONS = [
  {
    no: "01",
    direction: "AI / 互联网 产品经理",
    type: "AI PM / 增长 PM / 产品分析",
    why: [
      {
        from: "测评",
        text: "E 9 + I 8 → 你既爱推动事情发生(企业型),又重逻辑分析(研究型)— 是 PM 最契合的组合",
      },
      {
        from: "经历",
        text: "你在字节做过用户增长 + 自己做过 AI 学习助手 + Python 数据基础,跟 AI PM 招聘要求重合度高",
      },
    ],
    chips: ["E 主导", "技术理解", "数据驱动"],
  },
  {
    no: "02",
    direction: "数据分析 / 增长策略",
    type: "数据分析师 / 增长分析 / BI",
    why: [
      {
        from: "测评",
        text: "I 8 + C 5 → 你重数据推理,愿意系统化拆解问题,适合用数字说话的岗位",
      },
      {
        from: "经历",
        text: "你做过 Python 数据分析,理解 AI 业务,可以做面向产品的数据角色而不只是写 SQL",
      },
    ],
    chips: ["I 主导", "Python 基础", "业务理解"],
  },
  {
    no: "03",
    direction: "互联网 / AI 创业方向",
    type: "早期项目 PM / 0→1 产品 / 独立 IP",
    why: [
      {
        from: "测评",
        text: "E 9(企业型最高)+ A 4(不抗拒创意性工作)→ 你不只是想'打工',更想'主导一件事'",
      },
      {
        from: "经历",
        text: "你自己做了 AI 学习助手(30+ 真实用户)— 这是已经在做 0→1 的人,适合早期项目而不是大厂螺丝钉",
      },
    ],
    chips: ["E 极高", "0→1 经历", "高自驱"],
  },
];

const NEXT_STEPS = [
  {
    title: "整理简历",
    desc: "基于这 3 个方向调整简历,让你的字节实习和 AI 项目更聚焦",
    href: "/m3",
    color: "blue",
  },
  {
    title: "补 gap 项目",
    desc: "AI PM 招人偏好「真用户研究」,可以设计 2-4 周项目补强",
    href: "/m4",
    color: "yellow",
  },
  {
    title: "练一场模拟面试",
    desc: "用 AI PM JD 跑一场,看「具体性」「逻辑性」是否到位",
    href: "/m5",
    color: "red",
  },
];

export default function Module1ResultPage() {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        {/* 顶部 spacing for fixed nav */}
        <div className="h-20" />

        {/* ==========================================================
            页面标题
            ========================================================== */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-10">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-6"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 01 · 兴趣岗位发现
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              我们觉得你可能适合的方向
            </h1>
            <p className="text-ink-soft text-sm">
              基于霍兰德 RIASEC 测评(18 题)+ 兴趣 tag + 你跟我说的经历 综合判断
            </p>
          </div>
        </section>

        {/* ==========================================================
            用户身份 + 雷达图
            ========================================================== */}
        <section className="border-b border-border bg-warm-bg-deep/40">
          <div className="max-w-[1100px] mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-10 items-center">
            {/* 左:雷达图 */}
            <div className="bg-card rounded-3xl p-6 border border-border shadow-sm">
              <p className="font-display italic text-xs text-esther-blue mb-1 text-center">
                Your RIASEC Code
              </p>
              <p className="text-center text-lg font-bold text-ink mb-4 font-display italic">
                {SAMPLE.riasecCode}
              </p>
              <RIASECRadar scores={SAMPLE.riasec} />
              <p className="text-[11px] text-ink-muted text-center mt-3 leading-relaxed">
                每维 0-10 分。数值越高表示你在该维度的倾向越强。
              </p>
            </div>

            {/* 右:用户身份摘要 */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-esther-blue/15 border-2 border-esther-blue/40 flex items-center justify-center text-2xl">
                  {SAMPLE.emoji}
                </div>
                <div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border mb-1">
                    sample case
                  </span>
                  <p className="text-sm text-ink leading-relaxed">
                    {SAMPLE.background}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-ink-muted uppercase tracking-wider mb-1.5 font-display italic">
                    Interest tags
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SAMPLE.interestTags.map((t) => (
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
                    {SAMPLE.experiences.map((e) => (
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
              </div>
            </div>
          </div>
        </section>

        {/* ==========================================================
            3 个推荐方向
            ========================================================== */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-14">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              3 directions for you
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3">
              3 个推荐方向(按贴合度排)
            </h2>
            <p className="text-sm text-ink-soft mb-10 max-w-2xl">
              我们只推
              <span className="bg-esther-yellow/40" style={{ padding: "0 0.15em" }}>
                行业方向 + 职位类型
              </span>
              ,不绑具体公司名 — 你拿着这个方向,自己去 BOSS / 拉勾筛公司更合理。
            </p>

            <div className="space-y-5">
              {RECOMMENDATIONS.map((r) => (
                <Card
                  key={r.no}
                  className="p-7 border-2 border-border hover:border-esther-blue transition-colors"
                >
                  <div className="flex items-start gap-5 mb-5">
                    <span className="font-display italic text-4xl font-bold text-esther-blue/40 leading-none flex-shrink-0">
                      {r.no}
                    </span>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-ink mb-1 leading-snug">
                        🎯 {r.direction}
                      </h3>
                      <p className="text-sm text-ink-soft mb-3">
                        具体职位:{r.type}
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

                  <div className="space-y-3 pl-12">
                    {r.why.map((w, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-lg bg-warm-bg-deep/50"
                      >
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-esther-yellow text-ink flex-shrink-0">
                          {w.from}
                        </span>
                        <p className="text-sm text-ink leading-relaxed">
                          {w.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* ==========================================================
            下一步 CTA
            ========================================================== */}
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
                <Link
                  key={s.href}
                  href={s.href}
                  className="group block"
                >
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
              <p className="text-xs text-ink-muted">
                也可以选择 →
                <button className="ml-2 underline text-ink-soft hover:text-esther-blue">
                  重新做一次测评
                </button>
                <span className="mx-2 text-ink-muted/40">/</span>
                <button className="underline text-ink-soft hover:text-esther-blue">
                  导出推荐为 PDF
                </button>
              </p>
            </div>
          </div>
        </section>

        {/* ==========================================================
            Footer disclaimer
            ========================================================== */}
        <footer className="bg-warm-bg">
          <div className="max-w-[1100px] mx-auto px-6 py-12 text-center">
            <p className="text-sm text-ink-muted font-display italic">
              ℹ️ 测评仅供参考,愿你的热爱与擅长终在某处相逢
            </p>
            <p className="text-xs text-ink-muted mt-3">
              基于霍兰德 RIASEC 职业兴趣理论 · 推荐永不绑定具体公司名
            </p>
          </div>
        </footer>

        <BuerFloatingButton />
      </main>
    </>
  );
}
