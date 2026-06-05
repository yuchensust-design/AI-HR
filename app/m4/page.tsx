import { Suspense } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";

/**
 * 模块 4 · 项目设计 + 学习卡组(P1 stub)
 * 路由 /m4
 *
 * v1.5(plan §8.24):加左侧 ConversationSwitcher sidebar。
 * 数据隔离仍是 P1 stub(WEEK1_TASKS hardcode),v2 接 m4_projects 表实做多会话。
 */

const PROJECT = {
  title: "AI 工具用户行为研究",
  why: "陈昊投 AI PM 缺「真实用户研究」证据 — 这个项目可以补",
  weeks: 4,
  status: "PROPOSED · 未开始",
};

const WEEK1_TASKS = [
  { day: "Day 1", task: "读完 Cursor 文档 + 写 1 个 demo", hours: "2h", done: true },
  { day: "Day 2", task: "实现 chat UI 雏形(Next.js + Tailwind)", hours: "3h", done: true },
  { day: "Day 3", task: "实现保存对话历史功能", hours: "2h", done: true },
  { day: "Day 4", task: "找 3 个测试用户(LinkedIn / 同学群)", hours: "1h", done: true },
  { day: "Day 5", task: "第一轮访谈(3 个用户 × 30 分钟)", hours: "2h", done: false, today: true },
  { day: "Day 6", task: "总结反馈 + 列改进点", hours: "2h", done: false },
  { day: "Day 7", task: "休息 + 整理 Week 2 重点", hours: "0", done: false },
];

const RESOURCES = [
  { type: "📖", title: "《用户访谈实战手册》", source: "知乎专栏" },
  { type: "🎬", title: "「如何做用户访谈」", source: "B 站 / 30 分钟" },
  { type: "📄", title: "Jobs-to-be-Done 框架入门", source: "Medium" },
];

export default function Module4Page() {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <div className="flex">
          <Suspense fallback={<aside className="w-60 flex-shrink-0" />}>
            <ConversationSwitcher module="m4" basePath="/m4" defaultTitle="项目" />
          </Suspense>
          <div className="flex-1 min-w-0">

        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 04 · 项目设计 + 学习卡组
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              补一段能写进简历的项目
            </h1>
            <p className="text-ink-soft text-sm">
              AI 设计 + Skeptical Recruiter 审过的 brief · 每日 task 卡组陪你做完 · 完成自动转 STAR bullet 进简历
            </p>
          </div>
        </section>

        {/* 项目 brief */}
        <section className="border-b border-border bg-warm-bg-deep/30">
          <div className="max-w-[1100px] mx-auto px-6 py-10">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div>
                <p className="font-display italic text-xs text-esther-blue mb-1">
                  Current project
                </p>
                <h2 className="text-2xl font-bold text-ink mb-2">
                  🎯 {PROJECT.title}
                </h2>
                <p className="text-sm text-ink-soft max-w-2xl">{PROJECT.why}</p>
              </div>
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <span className="inline-flex items-center px-3 py-1 rounded-full bg-esther-yellow/40 border border-esther-yellow text-ink text-xs font-bold">
                  {PROJECT.status}
                </span>
                <span className="text-xs text-ink-muted font-display italic">
                  {PROJECT.weeks} 周计划 · 已开工 Day 5
                </span>
              </div>
            </div>

            <Card className="p-4 border-2 border-esther-red/30 bg-esther-red/5 mt-4">
              <p className="text-xs text-ink leading-relaxed">
                <span className="font-bold text-esther-red">⚠️ Anti-fabrication 纪律:</span>
                {" "}项目永远标 PROPOSED,只有真 ship 之后才能加到简历。
                Phase 4.6 时 Skeptical Recruiter 已经审过 brief,
                提了 3 个尖锐问题(eg「10 个陌生人怎么找?面试官追问真实性怎么答?」)。
              </p>
            </Card>
          </div>
        </section>

        {/* 学习卡组 + 资源 */}
        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
          {/* 左:Week 1 task 卡组 */}
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-lg font-semibold text-ink">
                📅 Week 1 学习卡组
              </h3>
              <span className="text-xs text-ink-soft">
                已完成 {WEEK1_TASKS.filter((t) => t.done).length} /{" "}
                {WEEK1_TASKS.length}
              </span>
            </div>

            <Card className="border-2 border-border divide-y divide-border overflow-hidden">
              {WEEK1_TASKS.map((t, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-4 p-4 ${
                    t.today
                      ? "bg-esther-blue/5 border-l-4 border-l-esther-blue"
                      : t.done
                      ? "bg-warm-bg-deep/30"
                      : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    defaultChecked={t.done}
                    className="w-5 h-5 accent-esther-blue flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-display italic text-sm font-bold text-esther-blue">
                        {t.day}
                      </span>
                      {t.today && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-esther-blue text-white">
                          今日
                        </span>
                      )}
                      <span className="text-[11px] text-ink-muted ml-auto">
                        {t.hours}
                      </span>
                    </div>
                    <p
                      className={`text-sm leading-snug ${
                        t.done ? "text-ink-muted line-through" : "text-ink"
                      }`}
                    >
                      {t.task}
                    </p>
                  </div>
                </div>
              ))}

              {/* Week 2-4 折叠占位 */}
              <div className="p-4 bg-warm-bg-deep/40 text-center">
                <button className="text-xs text-esther-blue hover:underline">
                  展开 Week 2-4 →
                </button>
              </div>
            </Card>

            {/* ASK AI 框 */}
            <Card className="mt-5 p-5 border-2 border-esther-yellow bg-esther-yellow/10">
              <p className="text-sm font-semibold text-ink mb-2">
                💬 Ask AI · 卡住了就问
              </p>
              <p className="text-xs text-ink-soft mb-3 leading-relaxed">
                例:「我访谈时用户答得很笼统,怎么挖深?」AI 会基于项目 context 给建议
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="今天遇到什么问题?"
                  className="flex-1 px-4 py-2.5 rounded-full border border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue"
                />
                <button className="px-5 py-2.5 rounded-full bg-esther-blue text-white text-sm font-medium hover:bg-esther-blue-dark transition-colors">
                  问
                </button>
              </div>
            </Card>
          </div>

          {/* 右:学习资源 + 完成后操作 */}
          <aside className="space-y-5">
            <Card className="p-5 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Learning resources
              </p>
              <h3 className="text-base font-semibold text-ink mb-3">
                这周推荐资源
              </h3>
              <ul className="space-y-3">
                {RESOURCES.map((r, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-base flex-shrink-0">{r.type}</span>
                    <div className="flex-1">
                      <p className="text-sm text-ink leading-snug">{r.title}</p>
                      <p className="text-[11px] text-ink-muted mt-0.5">
                        {r.source}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-ink-muted mt-3 leading-relaxed">
                * 资源都经 WebSearch 实探验证存在,不编造书名 / 课程
              </p>
            </Card>

            <Card className="p-5 border-2 border-esther-blue/30 bg-esther-blue/5">
              <p className="text-sm font-semibold text-ink mb-2">
                🎯 项目完成后
              </p>
              <p className="text-xs text-ink-soft mb-3 leading-relaxed">
                4 周做完 → AI 把你的成果转成 STAR bullet → 一键加到简历(模块 03)
              </p>
              <Link
                href="/m3"
                className="inline-flex items-center gap-1 text-sm font-medium text-esther-blue hover:underline"
              >
                看简历模块 →
              </Link>
            </Card>

            <p className="text-[11px] text-ink-muted text-center font-display italic">
              v1 P1 stub · 完整卡组(Week 2-4 / 自动 reminder)v2 上线
            </p>
          </aside>
        </div>

          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
