import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";

/**
 * 模块 2 · 经历挖掘 — 简化对话示例(P1 stub)
 * 路由 /m2
 */

const SAMPLE_DIALOG = [
  {
    from: "ai",
    text: "好,我们一段一段挖。你大学这 3 年里,有哪一段经历让你印象最深?(不一定是「亮眼」的,可以是你投入最多的)",
  },
  { from: "user", text: "嗯…大三的字节实习吧,做了 6 个月用户增长" },
  {
    from: "ai",
    text: "OK。你进字节是负责一个具体什么任务?你的 mentor 给你的「第一个 own 的事」是什么?",
  },
  {
    from: "user",
    text: "我刚去的时候 mentor 让我搭一个自动化日报,把每天的关键指标抓出来",
  },
  {
    from: "ai",
    text: "嗯。这个日报最早是怎么做的?(手动 vs 半自动?)你做完之后,节省了多少时间?有具体数字吗?",
  },
  {
    from: "user",
    text: "之前是 PM 每天花 2 小时手动拉,我用 SQL + Python 自动跑,缩到 15 分钟",
  },
  {
    from: "ai",
    text: "好,这就是一条很扎实的 bullet。Skeptical Recruiter checkpoint:面试官如果问「这个自动化你是从 0 写的,还是改了别人的?」,你能 1 句话答上吗?",
  },
];

const PHASES = [
  "Anchor:目标方向 + 当前状态",
  "Timeline:经历轮廓(2-3 年)",
  "Per-role 挖掘:每段经历 metric mining",
  "Hero stories:挖 3-5 个 STAR 故事",
  "Gap 分析:跟目标 JD 差什么",
  "Synthesis:整合 + Skeptical Recruiter checkpoint",
];

export default function Module2Page() {
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 02 · 经历挖掘
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              把零散经历讲明白
            </h1>
            <p className="text-ink-soft text-sm">
              没简历也行 — 我一段一段陪你挖,挖出来直接转 STAR bullet 进简历
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8">
          {/* 左:6 phase 进度 */}
          <aside className="space-y-5">
            <Card className="p-6 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                6-phase SOP
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">
                我们怎么挖
              </h3>
              <ol className="space-y-3">
                {PHASES.map((p, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-esther-blue/10 text-esther-blue flex items-center justify-center text-xs font-bold">
                      {i + 1}
                    </span>
                    <p className="text-xs text-ink leading-relaxed pt-1">{p}</p>
                  </li>
                ))}
              </ol>
            </Card>

            <Card className="p-6 border-2 border-esther-yellow/60 bg-esther-yellow/10">
              <p className="text-sm font-semibold text-ink mb-2">
                ⚡ 关键纪律: Skeptical Recruiter
              </p>
              <p className="text-xs text-ink leading-relaxed">
                Phase 6 时 AI 会扮演「怀疑型 HR」提 3 个最尖锐的追问,
                提前暴露你简历里的 weak spot — 把简历水分挑出来,
                而不是上线后被 HR 当面问倒。
              </p>
            </Card>
          </aside>

          {/* 右:对话样例 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">对话示例</span> ·
                陈昊 sample · Phase 3 Per-role 挖掘
              </p>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-warm-bg-deep text-ink-muted border border-border">
                P1 基础版 · 完整对话流开发中
              </span>
            </div>

            <Card className="border-2 border-border overflow-hidden">
              <div className="bg-warm-bg-deep/40 px-5 py-3 border-b border-border flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-base">
                  🤖
                </div>
                <p className="text-xs text-ink">
                  <span className="font-medium">经历挖掘 AI</span> ·
                  一段一段问,一 turn 一问
                </p>
              </div>

              <div className="p-5 space-y-4 max-h-[600px] overflow-y-auto">
                {SAMPLE_DIALOG.map((d, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${
                      d.from === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                        d.from === "user"
                          ? "bg-esther-yellow/30"
                          : "bg-esther-blue/15"
                      }`}
                    >
                      {d.from === "user" ? "👤" : "🤖"}
                    </div>
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed ${
                        d.from === "user"
                          ? "bg-esther-yellow text-ink rounded-tr-sm"
                          : i === SAMPLE_DIALOG.length - 1
                          ? "bg-esther-blue text-white rounded-tl-sm"
                          : "bg-warm-bg-deep text-ink rounded-tl-sm"
                      }`}
                    >
                      {d.text}
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border px-5 py-3 bg-warm-bg-deep/30 flex items-center gap-3">
                <div className="flex-1 px-3 py-2 rounded-full border border-border bg-card text-xs text-ink-muted">
                  正在思考下一个问题…
                </div>
                <button
                  disabled
                  className="px-4 py-2 rounded-full bg-esther-blue/50 text-white text-xs font-medium cursor-not-allowed"
                >
                  发送
                </button>
              </div>
            </Card>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Link
                href="/m3"
                className="block p-4 rounded-xl border-2 border-border bg-card hover:border-esther-blue transition-colors"
              >
                <p className="text-sm font-medium text-esther-blue mb-1">
                  挖完了 → 整理成简历 →
                </p>
                <p className="text-xs text-ink-soft">
                  AI 把挖出的故事直接写成 STAR bullet 进 Word
                </p>
              </Link>
              <Link
                href="/m4"
                className="block p-4 rounded-xl border-2 border-border bg-card hover:border-esther-blue transition-colors"
              >
                <p className="text-sm font-medium text-esther-blue mb-1">
                  发现 gap → 设计项目补 →
                </p>
                <p className="text-xs text-ink-soft">
                  挖完发现缺真用户研究?2-4 周可以做一个
                </p>
              </Link>
            </div>
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
