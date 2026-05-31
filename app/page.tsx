import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonaSelector } from "@/components/PersonaSelector";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * Landing 首页 — Offer 捕手学生求职智能体
 * 参考 esther scene-landing.md(深浅面板交替 + 至少 1-2 个全宽品牌色面板)
 */

const MODULES = [
  {
    no: "01",
    title: "兴趣岗位发现",
    subtitle: "Skill 0 测评",
    description:
      "19 题 RIASEC + 经历挖掘,推 3-5 个适合的行业方向(绝不绑公司名)",
    href: "/m1",
    priority: "P0",
  },
  {
    no: "02",
    title: "经历挖掘",
    subtitle: "Skill 1",
    description:
      "结构化访谈把零散的课程/实习/项目挖成 STAR 素材,Skeptical Recruiter 提前暴露 weak spot",
    href: "/m2",
    priority: "P1",
  },
  {
    no: "03",
    title: "简历整理",
    subtitle: "Skill 3 + Word 工具",
    description:
      "5 phase 对话基于目标 JD 优化简历,产出可直接投递的 Word 版本",
    href: "/m3",
    priority: "P0",
  },
  {
    no: "04",
    title: "项目设计",
    subtitle: "Skill 2 + 学习卡组",
    description:
      "AI 设计 2-4 周可 ship 的项目,Week 1 task list 每日勾选进度",
    href: "/m4",
    priority: "P1",
  },
  {
    no: "05",
    title: "模拟面试",
    subtitle: "视频会议风 · 3 性格 × 3 类型",
    description:
      "TTS+STT 语音对话 + 4 维评分复盘 + 反哺简历的双向闭环",
    href: "/m5",
    priority: "P0",
  },
];

const DISCIPLINES = [
  {
    name: "Skeptical Recruiter",
    desc: "关键产出前 AI 主动扮演怀疑 HR 提 3 个尖锐追问,提前暴露 weak spot",
  },
  {
    name: "Anti-fabrication",
    desc: "项目永远标 PROPOSED,用户施压让 AI 美化时,Claude 必须拒绝",
  },
  {
    name: "Gap → Project 桥接",
    desc: "跨模块数据自动传递,不让用户重复描述自己的 gap",
  },
  {
    name: "反 rationalization 表",
    desc: "显式列出 AI 在压力下容易给自己找的借口 + 反制规则",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* ============================================================
          Hero — 暖色全屏 + 装饰大数字 + IP 形象
          ============================================================ */}
      <section className="relative min-h-screen flex items-center bg-warm-bg overflow-hidden">
        <div className="pointer-events-none absolute -right-12 top-32 select-none leading-none font-display italic text-[clamp(8rem,20vw,20rem)] text-esther-blue/10">
          2026
        </div>

        <div className="grid w-full max-w-[1300px] mx-auto px-6 py-32 grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16 items-center">
          <div>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-6 px-3 py-1 text-xs font-medium">
              For 2026 届毕业生
            </Badge>
            <h1 className="text-[clamp(2.8rem,6vw,5rem)] font-bold leading-[1.1] text-ink mb-6">
              <span className="text-esther-blue">敢说真话</span>的
              <br />
              求职 AI 副驾
            </h1>
            <p className="text-lg md:text-xl text-ink-soft leading-relaxed mb-10 max-w-xl">
              不是 yes-man 帮你美化简历,而是
              <span className="bg-esther-yellow/40 px-1.5">挑战你、暴露弱点、陪你一步步走完闭环</span>
              <br className="hidden md:inline" />
              — 从「不知道适合什么岗位」到「拿到面试反馈优化简历」。
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="#persona"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-7 py-3.5 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
              >
                开始 — 看看我适合什么
              </Link>
              <Link
                href="#modules"
                className="inline-flex items-center justify-center rounded-full border-2 border-ink/10 bg-card text-ink px-7 py-3.5 text-base font-medium hover:border-esther-blue transition-colors"
              >
                直接看 5 大功能 →
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
                  alt="不二 · 你的求职 AI"
                  width={288}
                  height={288}
                  className="object-cover"
                  priority
                />
              </div>
              <p className="font-display italic text-sm text-ink-soft text-center mt-4">
                Meet your AI co-pilot
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Pain Section — 浅深奶色,题目 2 大痛点 + 我们的二次拆解
          ============================================================ */}
      <section className="bg-warm-bg-deep border-t border-b border-border">
        <div className="max-w-[1300px] mx-auto px-6 py-20">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            The real problem
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-12">
            2026 届毕业生面对的,其实是 3 件事
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                no: "01",
                title: "不知道自己适合什么岗位",
                desc: "海量岗位里,连「找的方向是不是错的」都不确定。市面工具都从「已知岗位」开始,跳过了这一步。",
              },
              {
                no: "02",
                title: "简历跟岗位的匹配度看不清",
                desc: "投了一摞简历没回应,不知道是简历不行 / 岗位不对口 / 还是写法不打动 HR。",
              },
              {
                no: "03",
                title: "面试卡在哪里说不上来",
                desc: "自己心里没数,AI 工具又只会鼓励「你答得很好」— 真正的 weak spot 没人帮你看出来。",
              },
            ].map((p) => (
              <div
                key={p.no}
                className="p-7 bg-card rounded-2xl border border-border"
              >
                <div className="font-display italic text-4xl text-esther-blue mb-3">
                  {p.no}
                </div>
                <h3 className="text-lg font-semibold text-ink mb-2">
                  {p.title}
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed">
                  {p.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          Persona 场景自选 — 6 大块卡片(写 persona_tag + 跳推荐模块)
          ============================================================ */}
      <div id="persona" className="bg-warm-bg">
        <PersonaSelector />
      </div>

      {/* ============================================================
          Modules — 5 大功能模块网格
          ============================================================ */}
      <section
        id="modules"
        className="bg-warm-bg-deep border-t border-border"
      >
        <div className="max-w-[1300px] mx-auto px-6 py-20">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            5 modules · 1 closed loop
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            5 大功能模块
          </h2>
          <p className="text-ink-soft mb-12 max-w-2xl">
            兴趣发现 → 经历挖掘 → 简历整理 → 项目设计 → 模拟面试,
            <span className="font-medium text-ink">
              模拟面试复盘还能反哺简历优化
            </span>
            (业内调研竞品中未见此类双向闭环)。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {MODULES.map((m) => (
              <Link key={m.no} href={m.href} className="group block">
                <Card className="h-full p-6 bg-card border-2 border-border hover:border-esther-blue hover:shadow-lg transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <span className="font-display italic text-5xl font-bold text-esther-blue/30 leading-none">
                      {m.no}
                    </span>
                    <Badge
                      className={
                        m.priority === "P0"
                          ? "bg-esther-blue text-white hover:bg-esther-blue"
                          : "bg-warm-bg text-ink-soft border border-border hover:bg-warm-bg"
                      }
                    >
                      {m.priority === "P0" ? "核心闭环" : "基础展示"}
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold text-ink mb-1">
                    {m.title}
                  </h3>
                  <p className="text-xs text-esther-blue mb-3 font-display italic">
                    {m.subtitle}
                  </p>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    {m.description}
                  </p>
                  <p className="mt-4 text-sm font-medium text-esther-blue group-hover:underline">
                    进入模块 →
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          Disciplines — 4 套思辨纪律(深色品牌蓝面板,强对比)
          ============================================================ */}
      <section className="bg-esther-blue text-white">
        <div className="max-w-[1300px] mx-auto px-6 py-24">
          <p className="font-display italic text-sm text-esther-yellow mb-3">
            Why we&apos;re different
          </p>
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            4 套思辨纪律,行业罕见
          </h2>
          <p className="text-white/80 mb-14 max-w-2xl text-lg leading-relaxed">
            行业内 AI 求职工具基本走 yes-man 路线。我们在产品哲学层引入 4 套
            <span className="text-esther-yellow font-semibold">
              敢挑战、敢说真话、不让 AI 偷工
            </span>
            的纪律。
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {DISCIPLINES.map((d, idx) => (
              <div
                key={d.name}
                className="p-7 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl"
              >
                <div className="flex items-start gap-4">
                  <span className="font-display italic text-3xl text-esther-yellow font-bold flex-shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">{d.name}</h3>
                    <p className="text-white/75 leading-relaxed text-sm">
                      {d.desc}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-10">
            <div>
              <p className="font-display italic text-2xl text-esther-blue mb-2">
                Offer 捕手
              </p>
              <p className="text-sm text-ink-soft leading-relaxed">
                敢说真话的求职 AI · 从兴趣发现到模拟面试,陪你走完闭环
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
                隐私与数据
              </p>
              <p className="text-xs text-ink-soft leading-relaxed">
                v1 游客模式 · 所有用户数据(除「不二」临时会话外)都在浏览器本地
                · 视频流绝不上传服务器 · 音频流由火山 STT 处理且默认不存
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
