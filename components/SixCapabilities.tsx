import { Card } from "@/components/ui/card";

/**
 * 六大核心能力 — 紧跟 PersonaSelector,作为产品功能特点 grid
 * 回答「为什么我们能解决 3 大痛点 + 6 种困境」
 */

type Capability = {
  emoji: string;
  title: string;
  desc: string;
  accent: "blue" | "yellow" | "red";
};

const CAPABILITIES: Capability[] = [
  {
    emoji: "🧭",
    title: "3 分钟找到更适合的方向",
    desc: "基于霍兰德 RIASEC 测评,结合经历交叉判断,快速锁定 3-5 个值得尝试的方向。",
    accent: "blue",
  },
  {
    emoji: "📝",
    title: "把零散经历挖成可写进简历的 STAR",
    desc: "把课程、实习、社团和项目里的零散经历,整理成更具体、可量化的 STAR 素材。",
    accent: "yellow",
  },
  {
    emoji: "🔎",
    title: "按目标 JD 对齐关键词和缺口",
    desc: "拆解目标岗位关键词和能力缺口,把简历改得更贴岗,减少初筛一眼不匹配。",
    accent: "blue",
  },
  {
    emoji: "🛡",
    title: "提前找出简历里容易被追问的地方",
    desc: "先暴露表述太空、成果不实或细节不足的地方,避免真实面试时一问就卡住。",
    accent: "red",
  },
  {
    emoji: "🎤",
    title: "3 类场景 × 3 种风格模拟面试",
    desc: "支持半结构化、行为面、技术面 3 类场景,搭配亲切、严厉、严谨 3 种面试官风格。",
    accent: "yellow",
  },
  {
    emoji: "♻️",
    title: "把面试里讲出来的新亮点补回简历",
    desc: "自动识别面试回答里的新成果、数字和隐藏亮点,直接带回简历继续优化。",
    accent: "blue",
  },
];

const ACCENT_BG = {
  blue: "bg-esther-blue/10 border-esther-blue/30",
  yellow: "bg-esther-yellow/30 border-esther-yellow/60",
  red: "bg-esther-red/10 border-esther-red/30",
};

export function SixCapabilities() {
  return (
    <section className="bg-warm-bg border-t border-border">
      <div className="max-w-[1300px] mx-auto px-6 py-20">
        <div className="mb-12 text-center">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            Six core capabilities
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            六大核心能力,撑起一条求职闭环
          </h2>
          <p className="text-ink-soft text-base max-w-2xl mx-auto">
            围绕“找准方向、讲清经历、提高匹配、练好面试”这几步核心任务设计,帮助学生把求职从零散准备变成可执行的完整路径。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {CAPABILITIES.map((c) => (
            <Card
              key={c.title}
              className="p-6 bg-card border-2 border-border hover:border-esther-blue/60 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-4">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border text-2xl flex-shrink-0 ${ACCENT_BG[c.accent]}`}
                >
                  {c.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-ink mb-2 leading-snug">
                    {c.title}
                  </h3>
                  <p className="text-sm text-ink-soft leading-relaxed">
                    {c.desc}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
