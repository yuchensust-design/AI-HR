import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * 模块 5 · 模拟面试 复盘报告
 * 路由 /m5/debrief
 * 4 维评分(逻辑/具体/清晰/口水话)+ 双向闭环 inline 卡片(创新点 ★)
 */

const SCORES = [
  {
    dim: "逻辑性",
    score: 4,
    evidence:
      "你的 STAR 结构清晰(背景 → 任务 → 行动 → 结果),但「行动」部分缺少 trade-off 解释(Q3:为什么选 Claude 而不是 GPT-4 没说完整)。",
  },
  {
    dim: "具体性",
    score: 3,
    evidence:
      "整体偏抽象 — 全程出现 3 次「很多用户」「挺好的」等模糊话术。Q3 答案里只出现 1 个数字(3 个月),没有 DAU / 留存 / 反馈 等关键指标。",
  },
  {
    dim: "应答清晰度",
    score: 4,
    evidence: "句子结构完整,层次分明,听众能跟得上。Q5 有 1 次卡顿 + 重启,其余流畅。",
  },
  {
    dim: "口水话频次",
    score: 3,
    evidence:
      "全程出现 12 次「嗯」「就是」「那个」等填充词(占用词 3.2%),Q1 最多(5 次)。",
  },
];

const HIGHLIGHTS = [
  {
    question: "Q3 — 讲讲你做过的 AI 学习助手项目",
    excerpt:
      "我最关键的设计决策是,我选了 Claude API 而不是 GPT-4,因为成本更低 + 中文理解更好。我做了 10 个 case 对比测试...",
    why: "出现新量化(10 个 case)+ 体现 trade-off 思考 — 你简历没写这个测试细节,建议加进简历",
    suggestedBullet:
      "AI 学习助手:基于 Claude API 开发,通过 10 个真实 case 对比 GPT-4 验证选型,选 Claude 节省 60% 成本",
  },
  {
    question: "Q7 — 你怎么衡量产品成功?",
    excerpt:
      "用户回到产品至少 3 次 + 主动反馈想要新功能 + 推荐给朋友 — 这 3 件事都做了,我才觉得算成功",
    why: "用户视角清晰,3 个具体衡量标准 — 简历缺少这类「PM 思维」表达,可以提炼一句加到「自我评价」",
    suggestedBullet:
      "PM 思维:产品衡量不只看 DAU,看用户「回到 + 反馈 + 推荐」3 件事是否同时发生",
  },
];

const TRANSCRIPT_SAMPLES = [
  {
    no: 1,
    q: "先做个 30 秒自我介绍",
    summary: "陈昊,CS 大四,字节用户增长实习,自己做了 AI 学习助手",
    score: "4",
  },
  {
    no: 2,
    q: "为什么投 AI PM 不是技术岗?",
    summary: "想做创造价值的事,技术只是工具,更关心用户问题",
    score: "4",
  },
  {
    no: 3,
    q: "讲讲 AI 学习助手项目 — 关键设计决策",
    summary: "选型 Claude / 30 个真实用户访谈 / 推 5000+ 阅读",
    score: "5",
    hasHighlight: true,
  },
  {
    no: 4,
    q: "字节实习里你 own 了什么?",
    summary: "用户留存漏斗分析 + 自动化日报 + 4 篇分析报告",
    score: "4",
  },
  {
    no: 5,
    q: "如果产品 DAU 突然降 20%,你会怎么排查?",
    summary: "三层拆解 → 流量来源 / 转化 / 留存 → 找异常点",
    score: "3",
  },
];

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <div
          key={n}
          className={`w-6 h-2 rounded-full ${
            n <= score ? "bg-esther-blue" : "bg-warm-bg-deep border border-border"
          }`}
        />
      ))}
      <span className="ml-2 text-sm font-bold text-esther-blue font-display italic">
        {score}/5
      </span>
    </div>
  );
}

export default function Module5DebriefPage() {
  const avgScore = (SCORES.reduce((s, x) => s + x.score, 0) / SCORES.length).toFixed(1);

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/m5"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回到模拟面试入口
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 05 · 复盘报告
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              这一场,你做得怎么样
            </h1>
            <p className="text-ink-soft text-sm">
              半结构化 · 亲切姐姐 · 10 题 · 实际用时 28 分钟 · 2026-06-01
            </p>
          </div>
        </section>

        {/* 4 维评分(摘要) */}
        <section className="border-b border-border bg-warm-bg-deep/30">
          <div className="max-w-[1100px] mx-auto px-6 py-10">
            <div className="flex items-baseline justify-between flex-wrap gap-4 mb-6">
              <div>
                <p className="font-display italic text-xs text-esther-blue mb-1">
                  4-dim assessment
                </p>
                <h2 className="text-xl md:text-2xl font-bold text-ink">
                  4 维评分(含 transcript 证据)
                </h2>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-ink-muted font-display italic">
                  Average
                </p>
                <p className="text-3xl font-display italic font-bold text-esther-blue">
                  {avgScore}
                  <span className="text-base text-ink-muted">/5</span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SCORES.map((s) => (
                <Card key={s.dim} className="p-5 border-2 border-border">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-ink">{s.dim}</h3>
                    <ScoreBar score={s.score} />
                  </div>
                  <div className="bg-warm-bg-deep/50 rounded-lg p-3">
                    <p className="text-[10px] uppercase tracking-wider text-ink-muted font-display italic mb-1.5">
                      Evidence
                    </p>
                    <p className="text-xs text-ink leading-relaxed">{s.evidence}</p>
                  </div>
                </Card>
              ))}
            </div>

            <p className="text-[11px] text-ink-muted mt-5 leading-relaxed">
              评分依赖 STT 转写,允许 ±20% 误差;STT 误识别不算用户失误。
            </p>
          </div>
        </section>

        {/* 双向闭环:反哺简历建议 ★ 核心创新 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-12">
            <div className="mb-8">
              <p className="font-display italic text-xs text-esther-blue mb-1">
                Cross-module loop ★
              </p>
              <h2 className="text-xl md:text-2xl font-bold text-ink mb-2">
                💡 这 2 段你答得特别好 — 要不要加到简历?
              </h2>
              <p className="text-sm text-ink-soft">
                AI 从你的 transcript 里识别出可以反哺到简历的高价值答案 — 一键采纳就跳转简历优化
              </p>
            </div>

            <div className="space-y-5">
              {HIGHLIGHTS.map((h, idx) => (
                <Card
                  key={idx}
                  className="p-6 border-2 border-esther-yellow bg-esther-yellow/10"
                >
                  <p className="text-[11px] font-display italic text-esther-blue mb-2">
                    From {h.question}
                  </p>

                  <div className="bg-card border-l-4 border-esther-blue p-4 rounded-r-lg mb-4">
                    <p className="text-xs text-ink-muted mb-1.5 font-display italic">
                      你说过的话:
                    </p>
                    <p className="text-sm text-ink leading-relaxed italic">
                      “{h.excerpt}”
                    </p>
                  </div>

                  <div className="bg-warm-bg-deep/40 rounded-lg p-4 mb-4">
                    <p className="text-xs text-ink-muted mb-1.5 font-display italic">
                      为什么值得加到简历:
                    </p>
                    <p className="text-sm text-ink leading-relaxed">{h.why}</p>
                  </div>

                  <div className="bg-card border border-border rounded-lg p-4 mb-4">
                    <p className="text-xs text-ink-muted mb-1.5 font-display italic">
                      AI 替你拟的 bullet 草稿:
                    </p>
                    <p className="text-sm text-ink leading-relaxed font-medium">
                      “{h.suggestedBullet}”
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/m3?from=debrief"
                      className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
                    >
                      ✓ 采纳 → 跳简历优化
                    </Link>
                    <button className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-5 py-2 text-sm hover:border-esther-blue transition-colors">
                      ✗ 不采纳
                    </button>
                    <p className="text-[11px] text-ink-muted ml-auto">
                      简历优化页顶部有「← 返回复盘」按钮
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* 全部 10 题 摘要 */}
        <section className="border-b border-border bg-warm-bg-deep/30">
          <div className="max-w-[1100px] mx-auto px-6 py-10">
            <h2 className="text-xl md:text-2xl font-bold text-ink mb-2">
              10 题完整摘要
            </h2>
            <p className="text-sm text-ink-soft mb-6">
              每题展示问题 + 你答的核心点 + 该题得分。点开看完整 transcript
            </p>

            <Card className="border-2 border-border divide-y divide-border overflow-hidden">
              {TRANSCRIPT_SAMPLES.map((t) => (
                <div
                  key={t.no}
                  className="p-4 flex items-start gap-4 hover:bg-warm-bg-deep/30 transition-colors"
                >
                  <span className="font-display italic text-lg font-bold text-esther-blue/60 flex-shrink-0 w-6">
                    {t.no}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
                      <p className="text-sm font-medium text-ink leading-snug">
                        {t.q}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {t.hasHighlight && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-esther-yellow text-ink">
                            💡 反哺
                          </span>
                        )}
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-esther-blue/15 text-esther-blue">
                          {t.score}/5
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      {t.summary}
                    </p>
                  </div>
                </div>
              ))}
              {/* 折叠提示 */}
              <div className="p-3 bg-warm-bg-deep/40 text-center">
                <button className="text-xs text-esther-blue hover:underline">
                  展开看 Q6-Q10 →
                </button>
              </div>
            </Card>
          </div>
        </section>

        {/* 下一步 + footer */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-12">
            <p className="font-display italic text-xs text-esther-blue mb-1">
              Next steps
            </p>
            <h2 className="text-xl md:text-2xl font-bold text-ink mb-6">
              接下来想做什么?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link href="/m5/live" className="block">
                <Card className="h-full p-5 border-2 border-border hover:border-esther-blue transition-colors">
                  <p className="text-base font-semibold text-ink mb-1">
                    🔁 重新面试 →
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    用同样的配置再练一场,题目不换,看你这次能不能改进
                  </p>
                </Card>
              </Link>
              <Link href="/m3" className="block">
                <Card className="h-full p-5 border-2 border-border hover:border-esther-blue transition-colors">
                  <p className="text-base font-semibold text-ink mb-1">
                    📝 优化简历 →
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    把上面 2 段亮点采纳到简历(或者更多手动改)
                  </p>
                </Card>
              </Link>
              <Link href="/m5" className="block">
                <Card className="h-full p-5 border-2 border-border hover:border-esther-blue transition-colors">
                  <p className="text-base font-semibold text-ink mb-1">
                    🎤 换性格再试 →
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    试试「严厉压力」面试官,看你 under pressure 怎么答
                  </p>
                </Card>
              </Link>
            </div>
          </div>
        </section>

        <BuerFloatingButton />
      </main>
    </>
  );
}
