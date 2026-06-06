import Link from "next/link";

/**
 * Landing 主线图 — §8.28 Wave 6
 * 1·测方向 → 2·讲经历 → 3·改简历 → 4·补项目 → 5·练面试 → 📊·复盘投递 ↻
 *
 * 评委 5 秒抓"完整闭环",学生 30 秒选起点。
 * 每节点本身是 Link 跳到对应模块,主流程一眼可点。
 */

const STEPS = [
  { no: "1", emoji: "🧭", label: "测方向", href: "/m1" },
  { no: "2", emoji: "🔍", label: "讲经历", href: "/m2" },
  { no: "3", emoji: "📝", label: "改简历", href: "/m3" },
  { no: "4", emoji: "🛠️", label: "补项目", href: "/m4" },
  { no: "5", emoji: "🎤", label: "练面试", href: "/m5" },
  { no: "6", emoji: "📊", label: "复盘投递", href: "/tracker" },
] as const;

export function MainFlowDiagram() {
  return (
    <section className="bg-card border-y border-border">
      <div className="max-w-[1300px] mx-auto px-6 py-12">
        <div className="text-center mb-6">
          <p className="font-display italic text-xs text-esther-blue mb-2">
            How it all connects
          </p>
          <h2 className="text-xl md:text-2xl font-semibold text-ink">
            一张图看完闭环 — 你可以从任何一步开始
          </h2>
        </div>

        {/* Desktop: 横向 */}
        <div className="hidden md:flex items-center justify-center gap-1 lg:gap-2 flex-wrap">
          {STEPS.map((s, idx) => (
            <div key={s.no} className="flex items-center">
              <Link
                href={s.href}
                className="group flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl hover:bg-warm-bg-deep/40 transition-colors"
              >
                <div className="w-12 h-12 rounded-full bg-esther-blue/10 border-2 border-esther-blue/30 group-hover:bg-esther-blue group-hover:text-white text-esther-blue flex items-center justify-center text-lg font-bold transition-colors">
                  {s.no}
                </div>
                <div className="text-center">
                  <p className="text-xs text-ink-muted leading-none">{s.emoji}</p>
                  <p className="text-sm font-medium text-ink mt-1 whitespace-nowrap">
                    {s.label}
                  </p>
                </div>
              </Link>
              {idx < STEPS.length - 1 && (
                <span
                  className="text-esther-blue/40 text-xl mx-0 lg:mx-0.5 hidden sm:inline"
                  aria-hidden
                >
                  →
                </span>
              )}
            </div>
          ))}
          {/* 闭环箭头 ↻ — 暗示 5 → 3 反哺 / 6 → 3 复盘 */}
          <div className="ml-2 hidden lg:flex items-center text-esther-yellow font-display italic text-sm">
            <span className="text-2xl mr-1">↻</span>
            <span>反哺简历</span>
          </div>
        </div>

        {/* Mobile: 纵向 */}
        <div className="md:hidden flex flex-col items-center gap-2">
          {STEPS.map((s, idx) => (
            <div key={s.no} className="flex flex-col items-center">
              <Link
                href={s.href}
                className="flex items-center gap-3 px-4 py-2 rounded-xl bg-warm-bg-deep/30 w-56"
              >
                <span className="w-8 h-8 rounded-full bg-esther-blue/10 border-2 border-esther-blue/30 text-esther-blue flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {s.no}
                </span>
                <span className="text-sm font-medium text-ink">
                  {s.emoji} {s.label}
                </span>
              </Link>
              {idx < STEPS.length - 1 && (
                <span className="text-esther-blue/40 text-lg my-1" aria-hidden>
                  ↓
                </span>
              )}
            </div>
          ))}
          <p className="text-xs text-esther-yellow mt-2 font-display italic">
            ↻ 复盘 → 反哺简历
          </p>
        </div>
      </div>
    </section>
  );
}
