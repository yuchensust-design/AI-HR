import Link from "next/link";

/**
 * 替代 PersonaSelector 6 卡 — §8.28 Wave 6
 *
 * 用户原话:"砍 Persona 自选 6 张卡(用户进了不知道点哪),
 * 改为 2 个明显入口'我是新生从 1 开始' / '我有简历从 3 开始'"
 *
 * 2 大决策卡,降低用户决策成本。
 */

const CHOICES = [
  {
    no: "1",
    title: "我是新生 · 从 1 开始",
    sub: "还没找方向 / 没简历 / 没经历可写",
    detail: "测一下职业兴趣 → 聊聊你做过的事 → 整理成第一版简历",
    href: "/m1",
    cta: "从测方向开始 →",
    accent: "blue" as const,
  },
  {
    no: "3",
    title: "我有简历 · 从 3 开始",
    sub: "已经有简历,想对着某个 JD 改",
    detail: "上传简历 + 粘 JD → AI 列改写建议 → 逐条拍板下载 Word",
    href: "/m3",
    cta: "直接改简历 →",
    accent: "yellow" as const,
  },
] as const;

const ACCENT = {
  blue: "border-esther-blue/40 bg-esther-blue/5 hover:border-esther-blue",
  yellow: "border-esther-yellow/50 bg-esther-yellow/10 hover:border-esther-yellow",
};

export function EntryChoiceCards() {
  return (
    <section id="persona" className="bg-warm-bg border-y border-border">
      <div className="max-w-[1100px] mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            Pick where you start
          </p>
          <h2 className="text-2xl md:text-3xl font-bold text-ink mb-2">
            你现在的情况更像哪一种?
          </h2>
          <p className="text-sm text-ink-soft">
            选一个最像你的,我带你从最合适的第一步开始
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl mx-auto">
          {CHOICES.map((c) => (
            <Link
              key={c.no}
              href={c.href}
              className={`group block rounded-3xl border-2 p-7 transition-all ${ACCENT[c.accent]}`}
            >
              <div className="flex items-baseline gap-3 mb-3">
                <span className="font-display italic text-4xl font-bold text-esther-blue leading-none">
                  {c.no}
                </span>
                <span className="text-[11px] text-ink-muted uppercase tracking-wider">
                  Start here
                </span>
              </div>
              <h3 className="text-lg font-semibold text-ink mb-1.5 leading-snug">
                {c.title}
              </h3>
              <p className="text-sm text-ink-soft mb-3">{c.sub}</p>
              <p className="text-xs text-ink leading-relaxed mb-4 pb-4 border-b border-border">
                {c.detail}
              </p>
              <span className="inline-flex items-center text-sm font-medium text-esther-blue group-hover:text-esther-blue-dark transition-colors">
                {c.cta}
              </span>
            </Link>
          ))}
        </div>

        <p className="text-xs text-ink-muted text-center mt-8 font-display italic">
          也可以从顶部导航任选一步开始 — 模块互相联通
        </p>
      </div>
    </section>
  );
}
