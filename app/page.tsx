import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonaSelector } from "@/components/PersonaSelector";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * Landing 首页 v3 — Offer 捕手学生求职智能体
 * 修订 §8.14:简化 7→6 section,加亮点 chip,加案例区占位
 */

const MODULES = [
  {
    no: "01",
    title: "先找到适合你的方向",
    helper: "测一测 + 聊聊经历,推 3-5 个方向",
    chips: ["霍兰德 RIASEC", "永不推公司名"],
    href: "/m1",
  },
  {
    no: "02",
    title: "把零散经历讲明白",
    helper: "课程 / 实习 / 项目 整理成完整故事 + STAR bullet",
    chips: ["Skeptical Recruiter", "STAR 自动生成"],
    href: "/m2",
  },
  {
    no: "03",
    title: "把简历改成更能过筛的版本",
    helper: "基于目标 JD 调整,产出 Word 直接投递",
    chips: ["WebSearch 实时 JD", "Word 一键下载"],
    href: "/m3",
  },
  {
    no: "04",
    title: "补一段能写进简历的项目经历",
    helper: "2-4 周 ship · 每日 task 卡组陪你做完",
    chips: ["每日 task 卡组", "4 层防鸡肋"],
    href: "/m4",
  },
  {
    no: "05",
    title: "练一场,再拿到具体反馈",
    helper: "4 维评分 + 复盘亮点直接反哺简历",
    chips: ["3 性格切换", "反哺简历首创"],
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
  { label: "01 兴趣测评", helper: "RIASEC 编码 + 推方向" },
  { label: "02 简历整理", helper: "前后对比 + Word 下载" },
  { label: "03 项目设计", helper: "Week 1 task 学习卡组" },
  { label: "04 模拟面试", helper: "4 维评分复盘" },
  { label: "05 反哺简历", helper: "面试亮点 → 新 bullet" },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* ============================================================
          Hero — 暖色全屏,温暖陪伴感
          ============================================================ */}
      <section className="relative min-h-screen flex items-center bg-warm-bg overflow-hidden">
        <div className="pointer-events-none absolute -right-12 top-32 select-none leading-none font-display italic text-[clamp(8rem,20vw,20rem)] text-esther-blue/10">
          2026
        </div>

        <div className="grid w-full max-w-[1300px] mx-auto px-6 py-32 grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16 items-center">
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
              <span className="bg-esther-yellow/40 px-1.5">
                适合什么方向
              </span>
              ,再
              <span className="bg-esther-yellow/40 px-1.5">
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
                  alt="不二 · 你的求职陪伴"
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
          Pain Pull Quote — 1 句衬线大引号(节奏过渡,替换 3 卡片冗余)
          ============================================================ */}
      <section className="bg-warm-bg-deep border-y border-border">
        <div className="max-w-[900px] mx-auto px-6 py-20 text-center">
          <p className="font-display italic text-7xl text-esther-blue/40 leading-none mb-6">
            &ldquo;
          </p>
          <p className="text-2xl md:text-3xl font-bold text-ink leading-relaxed">
            投了一摞简历没回应,
            <br className="md:hidden" />
            面试卡在哪自己也说不清,
            <br />
            连
            <span className="bg-esther-yellow/50 px-2">找的方向是不是错的</span>
            都不确定。
          </p>
          <p className="text-base text-ink-soft mt-6">
            — 这是我们听过最多的 3 句话
          </p>
        </div>
      </section>

      {/* ============================================================
          Persona 自选(陪伴式)
          ============================================================ */}
      <div id="persona" className="bg-warm-bg">
        <PersonaSelector />
      </div>

      {/* ============================================================
          Modules — 5 件事(每卡含 helper + 2 亮点 chip)
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
            每件事都让你拿到可以直接用的东西,不只是给建议。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m) => (
              <Link key={m.no} href={m.href} className="group block">
                <Card className="h-full p-7 bg-card border-2 border-border hover:border-esther-blue hover:shadow-lg transition-all flex flex-col">
                  <span className="font-display italic text-5xl font-bold text-esther-blue/30 leading-none block mb-4">
                    {m.no}
                  </span>
                  <h3 className="text-xl font-semibold text-ink mb-2 leading-snug">
                    {m.title}
                  </h3>
                  <p className="text-sm text-ink-soft leading-relaxed mb-5">
                    {m.helper}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-auto mb-3">
                    {m.chips.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-2.5 py-1 rounded-md bg-esther-yellow/30 text-ink text-xs font-medium border border-esther-yellow/60"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="text-sm font-medium text-esther-blue group-hover:underline">
                    进去看看 →
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          Case 案例区(占位,Day 3-5 截图回填)
          ============================================================ */}
      <section className="bg-warm-bg border-t border-border">
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
              下面是一个学生从「不知道适合什么」走到「拿到面试 offer」的完整路径。
            </p>

            <div className="bg-card border border-border rounded-3xl p-8 md:p-10">
              <div className="flex items-start gap-5 mb-8 pb-8 border-b border-border">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-esther-blue/15 flex items-center justify-center text-2xl font-display italic font-bold text-esther-blue">
                  陈
                </div>
                <div className="flex-1 min-w-0">
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

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {CASE_OUTPUTS.map((o) => (
                  <div
                    key={o.label}
                    className="aspect-[3/4] bg-gradient-to-br from-warm-bg-deep to-warm-bg-deep/40 rounded-xl border border-dashed border-border p-3 flex flex-col justify-between hover:border-esther-blue/40 transition-colors"
                  >
                    <p className="text-xs font-semibold text-esther-blue leading-tight">
                      {o.label}
                    </p>
                    <div className="flex-1 flex items-center justify-center">
                      <p className="text-[10px] text-ink-muted text-center leading-snug">
                        截图 <br /> 即将填充
                      </p>
                    </div>
                    <p className="text-[11px] text-ink-soft leading-snug">
                      {o.helper}
                    </p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-ink-muted mt-8 text-center font-display italic">
                demo 上线后,这里会换成真实学生的成果
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          差异化区 — 2×2 紧凑网格(收益话语)
          ============================================================ */}
      <section className="bg-esther-blue text-white">
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
  );
}
