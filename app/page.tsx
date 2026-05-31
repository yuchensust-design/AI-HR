import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { PersonaSelector } from "@/components/PersonaSelector";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * Landing 首页 v4 — Offer 捕手学生求职智能体
 * 修订 §8.15:
 *   ① Pull Quote bug 修 + 紧凑
 *   ② Modules → 横向 step flow + 闭环箭头
 *   ③ 案例区改 carousel(可左右滑)
 *   ④ 加顶部 sticky 导航栏
 */

const MODULES = [
  {
    no: "01",
    title: "先找到适合你的方向",
    helper: "测一测 + 聊聊经历,推 3-5 个方向",
    chip: "霍兰德 RIASEC",
    href: "/m1",
  },
  {
    no: "02",
    title: "把零散经历讲明白",
    helper: "课程 / 实习 / 项目 整理成完整 STAR 故事",
    chip: "Skeptical Recruiter",
    href: "/m2",
  },
  {
    no: "03",
    title: "把简历改成能过筛的版本",
    helper: "基于目标 JD 调整,产出 Word 直接投递",
    chip: "WebSearch 实时 JD",
    href: "/m3",
  },
  {
    no: "04",
    title: "补一段能写进简历的项目",
    helper: "2-4 周 ship · 每日 task 卡组陪你做完",
    chip: "每日 task 卡组",
    href: "/m4",
  },
  {
    no: "05",
    title: "练一场,再拿到具体反馈",
    helper: "4 维评分 + 复盘亮点反哺简历",
    chip: "3 性格 · 反哺简历",
    href: "/m5",
  },
];

const PROMISES = [
  {
    title: "帮你提前发现 HR 会追问的漏洞",
    helper: "关键节点 AI 扮演怀疑型 HR,把简历水分挑出来",
  },
  {
    title: "不会替你编故事",
    helper: "没做过的项目永远标 PROPOSED,不进你的真简历",
  },
  {
    title: "发现短板后直接给补强路径",
    helper: "缺什么就推什么项目 + 每日 task,不只是诊断",
  },
  {
    title: "不让 AI 用漂亮话掩盖真问题",
    helper: "AI 想偷懒、想哄你时的常见借口,提前堵了",
  },
];

const CASE_OUTPUTS = [
  {
    label: "兴趣测评",
    step: "01",
    helper: "陈昊的 RIASEC 编码 + 3 个推荐方向 + 行业贴合解释",
  },
  {
    label: "简历整理",
    step: "02",
    helper: "陈昊原简历 vs 基于字节 AI PM JD 优化后的对比",
  },
  {
    label: "项目设计",
    step: "03",
    helper: "陈昊 Week 1 task 学习卡组 + 每日 ASK AI 记录",
  },
  {
    label: "模拟面试",
    step: "04",
    helper: "陈昊 1 场模拟 + 4 维评分 + 关键 evidence 引用",
  },
  {
    label: "反哺简历",
    step: "05",
    helper: "复盘里的高价值答案 → 自动改进简历 bullet diff",
  },
];

export default function Home() {
  return (
    <>
      <Nav />

      <main className="min-h-screen" id="top">
        {/* ============================================================
            Hero
            ============================================================ */}
        <section className="relative min-h-screen flex items-center bg-warm-bg overflow-hidden">
          <div className="pointer-events-none absolute -right-12 top-32 select-none leading-none font-display italic text-[clamp(8rem,20vw,20rem)] text-esther-blue/10">
            2026
          </div>

          <div className="grid w-full max-w-[1300px] mx-auto px-6 pt-32 pb-24 grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16 items-center">
            <div>
              <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-6 px-3 py-1 text-xs font-medium">
                给正在准备求职的你
              </Badge>
              <h1 className="text-[clamp(2.8rem,6vw,5rem)] font-bold leading-[1.15] text-ink mb-6">
                这条路,
                <br />
                <span className="text-esther-blue">有人陪你走</span>
              </h1>
              <p className="text-lg md:text-xl text-ink-soft leading-relaxed mb-10 max-w-xl">
                先帮你看清
                <span
                  className="bg-esther-yellow/40"
                  style={{ padding: "0 0.15em" }}
                >
                  适合什么方向
                </span>
                ,再
                <span
                  className="bg-esther-yellow/40"
                  style={{ padding: "0 0.15em" }}
                >
                  诚实指出简历和面试里的真问题
                </span>
                。不是空泛鼓励,而是陪你一步步准备到能投、能答。
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="#persona"
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-7 py-3.5 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
                >
                  找适合我的第一步 →
                </Link>
                <Link
                  href="#modules"
                  className="inline-flex items-center justify-center rounded-full border-2 border-ink/10 bg-card text-ink px-7 py-3.5 text-base font-medium hover:border-esther-blue transition-colors"
                >
                  先看看能陪你做什么
                </Link>
              </div>
              <p className="text-xs text-ink-muted mt-6">
                🔒 游客模式 · 数据存浏览器本地 · 视频流绝不上传
              </p>
            </div>

            <div className="hidden lg:flex justify-center items-center">
              <div className="relative">
                <div className="absolute -inset-4 bg-esther-yellow rounded-full blur-2xl opacity-30" />
                <div className="relative rounded-full overflow-hidden ring-8 ring-card shadow-xl w-72 h-72">
                  <Image
                    src="/esther-assets/avatar.jpg"
                    alt="不二"
                    width={288}
                    height={288}
                    className="object-cover"
                    priority
                  />
                </div>
                <p className="font-display italic text-sm text-ink-soft text-center mt-4">
                  Meet 不二, your companion
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            Pull Quote — 紧凑节奏(修 bug + 减 py)
            ============================================================ */}
        <section className="bg-warm-bg-deep border-y border-border">
          <div className="max-w-[900px] mx-auto px-6 py-14 text-center">
            <p className="font-display italic text-6xl text-esther-blue/40 leading-none mb-5">
              &ldquo;
            </p>
            <p className="text-2xl md:text-3xl font-bold text-ink leading-relaxed">
              投了一摞简历没回应,
              <br className="md:hidden" />
              面试卡在哪自己也说不清,
              <br />
              连
              <span
                className="bg-esther-yellow/50"
                style={{ padding: "0 0.15em" }}
              >
                找的方向是不是错的
              </span>
              都不确定。
            </p>
            <p className="text-base text-ink-soft mt-5">
              — 这是我们听过最多的 3 句话
            </p>
          </div>
        </section>

        {/* ============================================================
            Persona 自选
            ============================================================ */}
        <div id="persona" className="bg-warm-bg">
          <PersonaSelector />
        </div>

        {/* ============================================================
            Modules — 横向 step flow(5 卡 + 4 箭头 + 闭环标注)
            ============================================================ */}
        <section
          id="modules"
          className="bg-warm-bg-deep border-t border-border"
        >
          <div className="max-w-[1300px] mx-auto px-6 py-20">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              5 things we do together
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
              能陪你做的 5 件事
            </h2>
            <p className="text-ink-soft mb-12 max-w-2xl">
              从「找方向」到「拿到反馈再改简历」 — 不是 5 个孤立功能,而是一条
              <span className="text-esther-blue font-medium">闭环求职路径</span>。
            </p>

            {/* Desktop: 圆形节点 + 连接线 + SVG 反哺弧线 */}
            <div className="hidden lg:block relative pt-24">
              {/* 反哺虚线弧 SVG overlay(从 05 弯回到 03) */}
              <svg
                viewBox="0 0 1000 120"
                preserveAspectRatio="none"
                className="absolute inset-x-0 top-0 w-full h-24 pointer-events-none"
                aria-hidden="true"
              >
                <defs>
                  <marker
                    id="arrow-yellow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#F4D758" />
                  </marker>
                </defs>
                {/* 弧线:从 05 节点中心(x=900)上方 → 弯到 03 节点中心(x=500)上方 */}
                <path
                  d="M 900 105 C 900 0, 500 0, 500 105"
                  stroke="#F4D758"
                  strokeWidth="2.5"
                  strokeDasharray="7 5"
                  fill="none"
                  markerEnd="url(#arrow-yellow)"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {/* 弧线中央标注 */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-esther-yellow text-ink text-xs font-medium shadow-sm">
                  <span className="text-base leading-none">↺</span>
                  模拟面试反哺简历优化
                </span>
              </div>

              {/* 节点 row + 连接横线 */}
              <div className="relative">
                {/* 横向连接线(在节点中心高度,从 01 到 05 贯穿) */}
                <div
                  className="absolute top-7 h-0.5 bg-gradient-to-r from-esther-blue/40 via-esther-blue/70 to-esther-blue/40 z-0"
                  style={{ left: "10%", right: "10%" }}
                  aria-hidden="true"
                />

                {/* 5 节点 */}
                <div className="grid grid-cols-5 gap-3 relative z-10">
                  {MODULES.map((m) => (
                    <Link
                      key={m.no}
                      href={m.href}
                      className="group flex flex-col items-center"
                    >
                      {/* 圆形节点 */}
                      <div className="w-14 h-14 rounded-full bg-card border-[3px] border-esther-blue flex items-center justify-center shadow-md group-hover:scale-110 group-hover:shadow-lg transition-all">
                        <span className="font-display italic text-xl font-bold text-esther-blue leading-none">
                          {m.no}
                        </span>
                      </div>

                      {/* 节点下方卡片 */}
                      <Card className="mt-5 p-5 w-full bg-card border-2 border-border group-hover:border-esther-blue group-hover:shadow-md transition-all">
                        <h3 className="text-base font-semibold text-ink mb-2 leading-snug">
                          {m.title}
                        </h3>
                        <p className="text-xs text-ink-soft leading-relaxed mb-4 min-h-[3em]">
                          {m.helper}
                        </p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-esther-yellow/30 text-ink text-[11px] font-medium border border-esther-yellow/60">
                          {m.chip}
                        </span>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </div>

            {/* Mobile: 纵向 timeline 风(左侧竖线 + 右侧卡片) */}
            <div className="lg:hidden relative">
              {/* 竖线 */}
              <div className="absolute left-7 top-7 bottom-7 w-0.5 bg-esther-blue/30" />

              <div className="flex flex-col gap-5">
                {MODULES.map((m) => (
                  <Link
                    key={m.no}
                    href={m.href}
                    className="group flex items-start gap-4 relative"
                  >
                    {/* 圆节点 */}
                    <div className="w-14 h-14 rounded-full bg-card border-[3px] border-esther-blue flex items-center justify-center shadow-sm flex-shrink-0 z-10">
                      <span className="font-display italic text-xl font-bold text-esther-blue leading-none">
                        {m.no}
                      </span>
                    </div>
                    {/* 卡片 */}
                    <Card className="flex-1 p-5 bg-card border-2 border-border group-hover:border-esther-blue transition-all">
                      <h3 className="text-base font-semibold text-ink mb-1.5 leading-snug">
                        {m.title}
                      </h3>
                      <p className="text-xs text-ink-soft leading-relaxed mb-3">
                        {m.helper}
                      </p>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-esther-yellow/30 text-ink text-[11px] font-medium border border-esther-yellow/60">
                        {m.chip}
                      </span>
                    </Card>
                  </Link>
                ))}
              </div>

              {/* 移动端反哺标注 */}
              <div className="mt-6 flex justify-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-esther-yellow/40 border border-esther-yellow text-sm text-ink">
                  <span className="text-esther-blue text-lg leading-none">↺</span>
                  <span>
                    <span className="font-medium">05 模拟面试</span> 还会反哺
                    <span className="font-medium"> 03 简历</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================================================
            Case 案例区 — 横向 carousel(可滑)
            ============================================================ */}
        <section
          id="case"
          className="bg-warm-bg border-t border-border"
        >
          <div className="max-w-[1300px] mx-auto px-6 py-20 relative overflow-hidden">
            <div className="pointer-events-none absolute -left-8 top-12 select-none leading-none font-display italic font-bold text-[clamp(6rem,12vw,11rem)] text-esther-red/[0.08]">
              Case
            </div>

            <div className="relative">
              <p className="font-display italic text-sm text-esther-blue mb-2">
                How others used it
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
                真实走过的案例
              </h2>
              <p className="text-ink-soft mb-10 max-w-2xl">
                陈昊(CS 大四,冲字节 AI PM 实习)从「不知道适合什么」一直走到「拿到面试反馈改简历」的完整路径。
              </p>

              {/* 学生卡片 */}
              <div className="flex items-start gap-5 mb-8 pb-8 border-b border-border max-w-3xl">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-esther-blue/15 flex items-center justify-center text-2xl font-display italic font-bold text-esther-blue">
                  陈
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                    <h3 className="text-xl font-semibold text-ink">陈昊</h3>
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border">
                      sample case
                    </span>
                  </div>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    CS 大四 · 冲字节 AI PM 实习 · 简历有 1 段实习但方向不够聚焦
                  </p>
                </div>
              </div>

              {/* 横向 carousel(scroll-snap) */}
              <div className="relative">
                <div className="overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mx-6 px-6">
                  <div className="flex gap-5 min-w-max">
                    {CASE_OUTPUTS.map((o) => (
                      <div
                        key={o.label}
                        className="snap-start w-[clamp(280px,30vw,360px)] flex-shrink-0 bg-card border border-border rounded-2xl overflow-hidden hover:border-esther-blue/60 transition-colors"
                      >
                        {/* 截图占位 16:9 */}
                        <div className="aspect-video bg-gradient-to-br from-warm-bg-deep to-warm-bg-deep/40 border-b border-dashed border-border flex items-center justify-center relative">
                          <div className="absolute top-3 left-3 px-2 py-0.5 rounded text-[10px] font-semibold bg-esther-blue text-white">
                            {o.step}
                          </div>
                          <p className="text-xs text-ink-muted font-display italic">
                            截图即将填充
                          </p>
                        </div>
                        {/* 内容 */}
                        <div className="p-5">
                          <h4 className="text-base font-semibold text-ink mb-1.5">
                            {o.label}
                          </h4>
                          <p className="text-xs text-ink-soft leading-relaxed">
                            {o.helper}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 滑动提示 */}
                <p className="text-xs text-ink-muted text-center mt-3 font-display italic">
                  ← 拖动看更多 →
                </p>
              </div>

              <p className="text-xs text-ink-muted mt-6 text-center font-display italic">
                demo 上线后,这里会换成真实学生的成果
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================
            差异化区 — 2×2 紧凑(我们不只是哄你)
            ============================================================ */}
        <section
          id="buer-section"
          className="bg-esther-blue text-white"
        >
          <div className="max-w-[1300px] mx-auto px-6 py-20">
            <p className="font-display italic text-sm text-esther-yellow mb-3">
              Why we&apos;re not just nice
            </p>
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              我们不只是哄你
            </h2>
            <p className="text-white/80 mb-12 max-w-2xl text-base leading-relaxed">
              行业里的 AI 求职工具基本都是
              <span className="text-esther-yellow font-semibold">
                「你答得不错」
              </span>
              的鼓励 — 我们做了 4 件不一样的。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PROMISES.map((p, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-4 p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl"
                >
                  <span className="font-display italic text-2xl text-esther-yellow font-bold flex-shrink-0 leading-none mt-1">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold mb-1.5 leading-snug">
                      {p.title}
                    </h3>
                    <p className="text-white/70 leading-relaxed text-sm">
                      {p.helper}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            Footer
            ============================================================ */}
        <footer className="bg-warm-bg border-t border-border">
          <div className="max-w-[1300px] mx-auto px-6 py-14">
            <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr] gap-10 mb-10">
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <Image
                    src="/esther-assets/avatar.jpg"
                    alt="不二"
                    width={36}
                    height={36}
                    className="rounded-full ring-2 ring-esther-yellow"
                  />
                  <p className="font-display italic text-2xl text-esther-blue">
                    Offer 捕手
                  </p>
                </div>
                <p className="text-sm text-ink-soft leading-relaxed">
                  陪你把求职这件事,慢慢做到能投、能答。
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
                  Resources
                </p>
                <ul className="space-y-2 text-sm text-ink-soft">
                  <li>
                    <a href="#" className="hover:text-esther-blue">
                      GitHub Repo(开发中)
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-esther-blue">
                      演示视频(Day 11 上线)
                    </a>
                  </li>
                  <li>
                    <a href="#" className="hover:text-esther-blue">
                      1000 字方案文档
                    </a>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
                  隐私
                </p>
                <p className="text-xs text-ink-soft leading-relaxed">
                  v1 游客模式 · 数据(除「不二」临时会话外)都在浏览器本地 ·
                  视频流绝不上传服务器 · 音频流由火山 STT 处理且默认不存
                </p>
              </div>
            </div>
            <div className="border-t border-border pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <p className="text-xs text-ink-muted">
                © 2026 Offer 捕手 · 基于 esther-design-system · 比赛 demo 项目
              </p>
              <p className="text-xs text-ink-muted font-display italic">
                测评仅供参考,愿你的热爱与擅长终在某处相逢
              </p>
            </div>
          </div>
        </footer>

        <BuerFloatingButton />
      </main>
    </>
  );
}
