import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonaSelector } from "@/components/PersonaSelector";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * Landing 首页 v2 — Offer 捕手学生求职智能体
 * 修订 §8.13:温暖文艺基调 + 用户任务语言 + 加"成果感"区
 */

const MODULES = [
  {
    no: "01",
    title: "先找到适合你的方向",
    helper: "测一测 + 聊聊经历,推 3-5 个方向",
    href: "/m1",
  },
  {
    no: "02",
    title: "把零散经历讲明白",
    helper: "帮你把课程 / 实习 / 项目 整理成完整故事",
    href: "/m2",
  },
  {
    no: "03",
    title: "把简历改成更能过筛的版本",
    helper: "基于目标 JD 调整,产出 Word 直接投递",
    href: "/m3",
  },
  {
    no: "04",
    title: "补一段能写进简历的项目经历",
    helper: "2-4 周可 ship · 每日 task 陪你做完",
    href: "/m4",
  },
  {
    no: "05",
    title: "练一场,再拿到具体反馈",
    helper: "4 维评分 + 复盘亮点反哺简历",
    href: "/m5",
  },
];

const TAKEAWAYS = [
  {
    no: "01",
    title: "一份更聚焦目标岗位的简历",
    helper: "可直接投递的 Word 版本,基于你的目标 JD 优化过",
  },
  {
    no: "02",
    title: "一场带复盘证据的模拟面试",
    helper: "4 维评分 + 每条评分配 transcript 原文证据",
  },
  {
    no: "03",
    title: "一条适合你的岗位方向建议",
    helper: "基于兴趣 + 经历的交叉判断,不是空泛标签",
  },
  {
    no: "04",
    title: "一份 2-4 周的补 gap 行动计划",
    helper: "每日 task 拆解,陪你真把项目做完",
  },
];

const PROMISES = [
  {
    title: "帮你提前发现 HR 会追问的漏洞",
    helper: "关键节点 AI 主动扮演怀疑型 HR,把简历水分挑出来",
  },
  {
    title: "不会替你编故事,保证可投递、可解释",
    helper: "做没做过的项目永远标 PROPOSED,不进你的真简历",
  },
  {
    title: "发现短板后,直接给你补强路径",
    helper: "缺什么就推什么项目 + 每日 task,不只是诊断",
  },
  {
    title: "不让 AI 用漂亮话掩盖真实问题",
    helper: "AI 想偷懒、想哄你时的常见借口,我们提前堵了",
  },
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
          Pain Section — "我们听过最多的话"(共情,非控诉)
          ============================================================ */}
      <section className="bg-warm-bg-deep border-t border-b border-border">
        <div className="max-w-[1300px] mx-auto px-6 py-20">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            What we hear most
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-12">
            我们听过最多的,是这 3 句话
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: "我连找什么方向都不确定",
                helper:
                  "投了很多岗位都没回应,我也不知道是不是连方向都选错了。",
              },
              {
                quote: "投了一摞简历,没人告诉我哪里不对",
                helper:
                  "已读不回,自己改了好几版,还是不知道是简历的问题还是岗位不对口。",
              },
              {
                quote: "面试里到底卡在哪,我自己也说不清",
                helper:
                  "复盘的时候只觉得「答得不好」,但不知道是逻辑乱、不够具体,还是语速太快。",
              },
            ].map((p, idx) => (
              <div
                key={idx}
                className="p-7 bg-card rounded-2xl border border-border"
              >
                <p className="font-display italic text-5xl text-esther-blue/30 leading-none mb-3">
                  &ldquo;
                </p>
                <p className="text-lg font-semibold text-ink mb-3 leading-snug">
                  {p.quote}
                </p>
                <p className="text-sm text-ink-soft leading-relaxed">
                  {p.helper}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          Persona 场景自选(陪伴式,不分类)
          ============================================================ */}
      <div id="persona" className="bg-warm-bg">
        <PersonaSelector />
      </div>

      {/* ============================================================
          Modules — 5 件能陪你做的事(用户任务语言)
          ============================================================ */}
      <section
        id="modules"
        className="bg-warm-bg-deep border-t border-border"
      >
        <div className="max-w-[1300px] mx-auto px-6 py-20">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            5 things we can do together
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            能陪你做的 5 件事
          </h2>
          <p className="text-ink-soft mb-12 max-w-2xl">
            从「不知道适合什么方向」一直到「拿到面试反馈改简历」,
            每一步都不让你一个人面对。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m) => (
              <Link key={m.no} href={m.href} className="group block">
                <Card className="h-full p-7 bg-card border-2 border-border hover:border-esther-blue hover:shadow-lg transition-all">
                  <span className="font-display italic text-5xl font-bold text-esther-blue/30 leading-none block mb-4">
                    {m.no}
                  </span>
                  <h3 className="text-xl font-semibold text-ink mb-2 leading-snug">
                    {m.title}
                  </h3>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    {m.helper}
                  </p>
                  <p className="mt-5 text-sm font-medium text-esther-blue group-hover:underline">
                    进去看看 →
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          成果区 — 你会带走的 4 样东西(新增,§8.13 review #5)
          ============================================================ */}
      <section className="bg-warm-bg border-t border-border">
        <div className="max-w-[1300px] mx-auto px-6 py-20 relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-8 select-none leading-none font-display italic font-bold text-[clamp(8rem,18vw,16rem)] text-esther-blue/[0.08]">
            4
          </div>

          <div className="relative">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              What you&apos;ll take with you
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
              走完一遍,你会带走 4 样东西
            </h2>
            <p className="text-ink-soft mb-12 max-w-2xl">
              不是 4 个空泛功能,是 4 件可以拿出去用的东西。
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {TAKEAWAYS.map((t) => (
                <div
                  key={t.no}
                  className="flex gap-5 p-6 bg-card border border-border rounded-2xl hover:border-esther-yellow hover:bg-warm-bg-deep transition-colors"
                >
                  <span className="font-display italic text-4xl font-bold text-esther-yellow flex-shrink-0 leading-none">
                    {t.no}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-ink mb-1.5 leading-snug">
                      {t.title}
                    </h3>
                    <p className="text-sm text-ink-soft leading-relaxed">
                      {t.helper}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          差异化区 — 我们不只是哄你(收益话语)
          ============================================================ */}
      <section className="bg-esther-blue text-white">
        <div className="max-w-[1300px] mx-auto px-6 py-24">
          <p className="font-display italic text-sm text-esther-yellow mb-3">
            Why we&apos;re not just nice
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            我们不只是哄你
          </h2>
          <p className="text-white/80 mb-14 max-w-2xl text-lg leading-relaxed">
            行业里的 AI 求职工具基本都是
            <span className="text-esther-yellow font-semibold">
              「你答得很好」、「这条 bullet 不错」
            </span>
            的鼓励。我们做了 4 件不一样的事,让你真能拿到 offer。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {PROMISES.map((p, idx) => (
              <div
                key={idx}
                className="p-7 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl"
              >
                <div className="flex items-start gap-4">
                  <span className="font-display italic text-3xl text-esther-yellow font-bold flex-shrink-0 leading-none mt-1">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold mb-2 leading-snug">
                      {p.title}
                    </h3>
                    <p className="text-white/75 leading-relaxed text-sm">
                      {p.helper}
                    </p>
                  </div>
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
