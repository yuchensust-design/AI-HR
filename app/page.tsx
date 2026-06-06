import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { EntryChoiceCards } from "@/components/EntryChoiceCards";
import { MainFlowDiagram } from "@/components/MainFlowDiagram";
import { SixCapabilities } from "@/components/SixCapabilities";
import { StepsSection } from "@/components/StepsSection";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { JobMatchHero } from "@/components/m6/JobMatchHero";

/**
 * Landing 首页 v4 — Offer 捕手学生求职智能体
 * 修订 §8.15:
 *   ① Pull Quote bug 修 + 紧凑
 *   ② Modules → 横向 step flow + 闭环箭头
 *   ③ 案例区改 carousel(可左右滑)
 *   ④ 加顶部 sticky 导航栏
 */

const PRIVACY_PILLARS = [
  {
    glyph: "隐",
    label: "数据边界",
    title: "本地优先 · 不做账号级持久化",
    desc: "游客模式 — 简历草稿 / 测评结果 / 投递记录 / 日记默认存浏览器 localStorage。涉及 AI 分析的文本会发送到国产大模型接口处理,但不做账号级持久化,也不与第三方做画像 / 二次训练。",
    badgeBg: "bg-esther-red",
    badgeText: "text-white",
  },
  {
    glyph: "平",
    label: "公平边界",
    title: "辅助探索,不做筛选",
    desc: "测评、推荐、诊断仅用于辅助你探索方向,不作为筛选标准。不因学校 / 专业 / 空窗 / 出身做负面判断。你可以随时清空浏览器数据重新开始。",
    badgeBg: "bg-esther-blue",
    badgeText: "text-white",
  },
  {
    glyph: "释",
    label: "可解释 · 你说了算",
    title: "建议有来源,你可拒绝",
    desc: "每条 AI 建议都标注依据(来自 JD / 简历 / 面试回答 / sample)。Offer 捕手只重组你提供过的素材,不会替你发明经历。任何建议你都可以拒绝、修改、覆盖。",
    badgeBg: "bg-esther-yellow",
    badgeText: "text-ink",
  },
];

const CASES = [
  {
    color: "blue" as const,
    emoji: "💻",
    background: "CS 大四,冲互联网大厂 AI PM 实习",
    moduleNo: "03",
    moduleLabel: "简历整理",
    outcome: "Word 简历 + 目标 JD 关键词命中率从 30% 提到 70%",
  },
  {
    color: "yellow" as const,
    emoji: "🔄",
    background: "英专大三,想转 AI PM",
    moduleNo: "01+03",
    moduleLabel: "兴趣测评 + 简历",
    outcome: "AI PM 方向确认 + 转专业版简历(强调可迁移技能)",
  },
  {
    color: "red" as const,
    emoji: "🧭",
    background: "大三,完全没方向",
    moduleNo: "01",
    moduleLabel: "兴趣测评",
    outcome: "3 个推荐行业方向 + 兴趣维度雷达图 + 经历交叉解释",
  },
  {
    color: "blue" as const,
    emoji: "🎤",
    background: "大四,投了 30 份简历没回应",
    moduleNo: "05",
    moduleLabel: "模拟面试 + 反哺",
    outcome: "4 维评分发现「具体性」3 分 → 反哺简历 2 条新 bullet",
  },
  {
    color: "yellow" as const,
    emoji: "🚀",
    background: "双非大四,想冲大厂 AI",
    moduleNo: "04",
    moduleLabel: "项目设计 + 学习卡组",
    outcome: "4 周项目 brief + Week 1 task list + 学习资源",
  },
];

// 头像底色 — 不同 esther 三色制造多样性
const AVATAR_BG = {
  blue: "bg-esther-blue/15 border-esther-blue/40",
  yellow: "bg-esther-yellow/30 border-esther-yellow/60",
  red: "bg-esther-red/15 border-esther-red/40",
};

export default function Home() {
  return (
    <>
      <Nav />

      <main className="min-h-screen" id="top">
        {/* ============================================================
            Hero
            ============================================================ */}
        <section className="relative min-h-screen flex items-center bg-warm-bg overflow-hidden">
          {/* 装饰大字 2026 */}
          <div className="pointer-events-none absolute -right-12 top-32 select-none leading-none font-display italic text-[clamp(8rem,20vw,20rem)] text-esther-blue/10">
            2026
          </div>
          {/* 手绘风小星星散布 */}
          <svg
            className="absolute top-28 left-16 w-8 h-8 text-esther-yellow opacity-80 pointer-events-none hidden md:block"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
          </svg>
          <svg
            className="absolute bottom-32 left-8 w-5 h-5 text-esther-red opacity-70 pointer-events-none hidden md:block"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
          </svg>
          <svg
            className="absolute top-1/2 right-20 w-6 h-6 text-esther-blue opacity-60 pointer-events-none hidden lg:block"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
          </svg>
          {/* 手绘风波浪线装饰(Hero 底部) */}
          <svg
            className="absolute bottom-10 left-1/2 -translate-x-1/2 w-32 h-4 text-esther-blue/30 pointer-events-none hidden md:block"
            viewBox="0 0 100 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M 5 5 Q 15 0, 25 5 T 45 5 T 65 5 T 85 5 T 95 5" />
          </svg>

          <div className="grid w-full max-w-[1300px] mx-auto px-6 pt-32 pb-24 grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-16 items-center">
            <div>
              <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-6 px-3 py-1 text-xs font-medium">
                给正在准备求职的你
              </Badge>
              <h1 className="text-[clamp(2rem,4vw,3.5rem)] font-bold leading-[1.15] text-ink mb-6">
                从校园到职场,
                <br />
                <span className="text-esther-blue">少一点迷茫,多一点底气</span>
              </h1>
              {/* Subtitle — 产品定位长句 */}
              <p className="text-base text-ink-soft leading-relaxed mb-3 max-w-xl">
                从岗位定位、经历挖掘、简历优化到模拟面试,陪你把学生时代的积累,变成{" "}
                <span
                  className="bg-esther-yellow/40 font-medium text-ink"
                  style={{ padding: "0 0.15em" }}
                >
                  真正能投、能讲、能过筛的求职竞争力
                </span>
                。
              </p>
              <p className="text-sm text-ink-soft leading-relaxed mb-6 max-w-xl">
                用测评、JD 解析、结构化追问和复盘指标,把求职从感觉判断变成{" "}
                <span className="text-esther-blue font-medium">可分析、可优化的路径</span>。
              </p>

              {/* 数据条 — 3 个能力信号(用户语言版),对应一条评委看得见的能力链 */}
              <div className="flex flex-wrap items-center gap-2 mb-8">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
                  <span className="text-esther-blue text-sm leading-none">🧭</span>
                  <span className="text-xs text-ink-soft">职业兴趣测评 + 结合你的真实经历</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
                  <span className="text-esther-blue text-sm leading-none">🔎</span>
                  <span className="text-xs text-ink-soft">JD 拆解 · 简历命中度 · 改完跟原版对比</span>
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3 py-1.5">
                  <span className="text-esther-blue text-sm leading-none">🎤</span>
                  <span className="text-xs text-ink-soft">3 类面试 × 3 种风格 · 复盘给具体建议</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <Link
                  href="/m1"
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-7 py-3.5 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md"
                >
                  开始我的求职闭环 →
                </Link>
                <Link
                  href="#modules"
                  className="inline-flex items-center justify-center rounded-full border-2 border-ink/10 bg-card text-ink px-7 py-3.5 text-base font-medium hover:border-esther-blue transition-colors"
                >
                  先看看它怎么帮我 →
                </Link>
              </div>
              <p className="text-xs text-ink-muted mt-6">
                🔒 游客模式 · 数据默认存浏览器本地 · 文本仅在分析时发送到模型接口 · 不做账号级持久化
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
            主线图 — §8.28 Wave 6: 一张图看完闭环
            ============================================================ */}
        <MainFlowDiagram />

        {/* ============================================================
            M6 Job Match Hero — 智能岗位匹配入口(首屏高位)
            ============================================================ */}
        <JobMatchHero />

        {/* ============================================================
            Pain Points — 学生求职 3 大痛点
            ============================================================ */}
        <section className="bg-warm-bg-deep border-y border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-16">
            <div className="text-center mb-10">
              <p className="font-display italic text-sm text-esther-blue mb-2">
                Where students get stuck
              </p>
              <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
                你是不是也感觉“越准备越没底”?
              </h2>
              <p className="text-ink-soft text-base">
                不是你不够努力,很多同学第一次找工作时,都会不断怀疑自己。方向拿不准、简历改不明白、面试完也说不清问题出在哪。</p>
              <p className="text-ink-soft text-base">
                如果你也有过那种很想做好、却怎么都找不到节奏的无力感,先别急着否定自己。
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                {
                  no: "01",
                  title: "投递很多,却始终没有回应",
                  desc: "不知道是岗位方向不合适、简历匹配度不够,还是经历表达不够清晰。问题没有被解决,投递就很难持续优化。",
                  diagnose: ["JD 关键词覆盖", "简历匹配度", "JD gaps"],
                },
                {
                  no: "02",
                  title: "面试没过,却复盘不出问题",
                  desc: "感觉自己答得一般,却说不清是哪一题失分、哪段经历没讲透、哪种表达不够有说服力,下一次也就很难真正改进。",
                  diagnose: ["4 维评分", "transcript evidence", "面试官追问点"],
                },
                {
                  no: "03",
                  title: "想补短板,却不知道该补哪一块",
                  desc: "要不要换方向、补项目,或重新整理已有经历,这些选择都影响后面的投递效率。没有清晰判断时,准备越多,越容易分散。",
                  diagnose: ["gap 难度", "时间预算", "项目可交付边界"],
                },
              ].map((p) => (
                <div
                  key={p.no}
                  className="bg-card border-2 border-border rounded-2xl p-6 hover:border-esther-red/50 transition-colors flex flex-col"
                >
                  <p className="font-display italic text-2xl font-bold text-esther-red mb-3 leading-none">
                    {p.no}
                  </p>
                  <h3 className="text-base font-semibold text-ink mb-2 leading-snug">
                    {p.title}
                  </h3>
                  <p className="text-sm text-ink-soft leading-relaxed mb-4 flex-1">
                    {p.desc}
                  </p>
                  {/* 诊断维度 chip — 体现产品如何接住痛点 */}
                  <div className="pt-3 border-t border-border">
                    <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-2">
                      产品诊断维度
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {p.diagnose.map((d) => (
                        <span
                          key={d}
                          className="inline-flex items-center rounded-full bg-esther-blue/10 border border-esther-blue/30 text-esther-blue text-[11px] px-2 py-0.5"
                        >
                          {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ============================================================
            六大核心能力(回答「为什么我们能解决」)
            ============================================================ */}
        <SixCapabilities />

        {/* ============================================================
            2 入口决策卡 — §8.28 Wave 6: 砍 Persona 6 卡 → 2 入口
            ============================================================ */}
        <EntryChoiceCards />

        {/* ============================================================
            5 阶段切换式 step(顶部 nav + 主体大卡片 + 量化 metric bar)
            ============================================================ */}
        <StepsSection />

        {/* ============================================================
            Case 案例区 — 多学生 (5 personas) 横向 carousel
            ============================================================ */}
        <section
          id="case"
          className="bg-warm-bg border-t border-border relative overflow-hidden"
        >
          {/* 装饰大字 "Case" */}
          <div className="pointer-events-none absolute -left-4 top-8 select-none leading-none font-display italic font-bold text-[clamp(6rem,12vw,11rem)] text-esther-red/[0.08]">
            Case
          </div>
          {/* 手绘风 SVG 装饰星星 */}
          <svg
            className="absolute right-10 top-16 w-12 h-12 text-esther-yellow opacity-70 pointer-events-none"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
          </svg>
          <svg
            className="absolute right-32 top-40 w-7 h-7 text-esther-red opacity-60 pointer-events-none"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
          </svg>

          <div className="max-w-[1300px] mx-auto px-6 py-20 relative">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              How others used it
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
              真实走过的案例
            </h2>
            <p className="text-ink-soft mb-10 max-w-2xl">
              不同背景的学生,用了不同的功能,拿到了不同的成果 — 这才是「闭环」的真实样子。
            </p>

            {/* 横向 carousel(5 学生) */}
            <div className="relative">
              <div className="overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mx-6 px-6">
                <div className="flex gap-5 min-w-max">
                  {CASES.map((c, idx) => (
                    <div
                      key={idx}
                      className="snap-start w-[clamp(300px,28vw,380px)] flex-shrink-0 bg-card border border-border rounded-2xl overflow-hidden hover:border-esther-blue/60 hover:shadow-md transition-all flex flex-col relative"
                    >
                      {/* sample 角标(右上) */}
                      <span className="absolute top-3 right-3 z-10 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border">
                        sample
                      </span>

                      {/* 顶部:emoji 头像 + 背景 */}
                      <div className="p-5 pb-4 border-b border-border">
                        <div className="flex items-center gap-4 mb-3">
                          {/* emoji 头像圆形 */}
                          <div
                            className={`w-14 h-14 rounded-full border-2 flex items-center justify-center text-3xl flex-shrink-0 ${AVATAR_BG[c.color]}`}
                          >
                            {c.emoji}
                          </div>
                          <p className="text-sm text-ink leading-relaxed font-medium flex-1">
                            {c.background}
                          </p>
                        </div>
                        {/* 用了哪个模块 chip */}
                        <div className="flex items-center gap-2 mt-2">
                          <span className="font-display italic text-sm font-bold text-esther-blue">
                            {c.moduleNo}
                          </span>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-esther-blue/10 text-esther-blue text-[11px] font-medium">
                            用了 {c.moduleLabel}
                          </span>
                        </div>
                      </div>

                      {/* 截图占位(aspect 4:3) */}
                      <div className="aspect-[4/3] bg-gradient-to-br from-warm-bg-deep via-warm-bg-deep/60 to-warm-bg flex items-center justify-center relative">
                        <p className="text-xs text-ink-muted font-display italic">
                          截图即将填充
                        </p>
                      </div>

                      {/* 拿到了什么 */}
                      <div className="p-5 bg-warm-bg-deep/40 flex-1">
                        <div className="flex items-start gap-2">
                          <span className="text-esther-yellow text-base leading-none mt-0.5">
                            💡
                          </span>
                          <p className="text-xs text-ink leading-relaxed">
                            <span className="font-semibold">拿到:</span>{" "}
                            {c.outcome}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 滑动提示 */}
              <p className="text-xs text-ink-muted text-center mt-3 font-display italic">
                ← 拖动看更多 5 位学生的案例 →
              </p>
            </div>

            <p className="text-xs text-ink-muted mt-6 text-center font-display italic">
              所有 case 均为 sample(覆盖 5 类典型场景)· demo 上线后会逐步换成真实学生的成果
            </p>
          </div>
        </section>

        {/* ============================================================
            安全与数据保护 — 信任背书段
            ============================================================ */}
        <section id="privacy" className="bg-esther-blue text-white">
          <div className="max-w-[1300px] mx-auto px-6 py-20">
            <div className="text-center mb-12">
              <p className="font-display italic text-sm text-esther-yellow mb-3">
                Privacy & data protection
              </p>
              <h2 className="text-3xl md:text-4xl font-bold mb-3">
                安全与数据保护
              </h2>
              <p className="text-white/80 text-base">
                为你提供充分的数据控制与安全保障
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {PRIVACY_PILLARS.map((p) => (
                <div
                  key={p.label}
                  className="bg-card text-ink rounded-2xl p-6 border border-white/10 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-sm font-semibold ${p.badgeBg} ${p.badgeText}`}
                    >
                      {p.glyph}
                    </span>
                    <p className="text-xs text-ink-soft">{p.label}</p>
                  </div>
                  <h3 className="text-base font-semibold mb-2 leading-snug">
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
                  <li>
                    <Link href="/diary" className="hover:text-esther-blue">
                      📔 日记 · 素材小本本
                    </Link>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
                  隐私
                </p>
                <p className="text-xs text-ink-soft leading-relaxed mb-3">
                  v1 游客模式 · 数据(除「不二」临时会话外)都在浏览器本地 ·
                  视频流绝不上传服务器 · 音频流由火山 STT 处理且默认不存
                </p>
                <p className="text-xs text-ink-muted leading-relaxed italic">
                  📱 微信版准备中 — 之后随手发条消息给「不二」就能记进日记
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
