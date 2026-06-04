import { Card } from "@/components/ui/card";

/**
 * 六大智能能力 — 撑起一条可分析、可优化的求职闭环
 * 每张卡 = 一个 AI-HR/数据分析视角能看见的能力模块,而非用户价值口号。
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
    title: "RIASEC + 经历交叉验证",
    desc: "基于职业兴趣测评和真实经历信号,不只看喜欢什么,也判断做过什么、适合什么。",
    accent: "blue",
  },
  {
    emoji: "📝",
    title: "STAR 挖掘 + 量化证据提取",
    desc: "把课程、实习、社团、项目拆成任务、动作、结果和数字,沉淀可写进简历的素材。",
    accent: "yellow",
  },
  {
    emoji: "🔎",
    title: "JD 解析 + 关键词缺口映射",
    desc: "拆解岗位关键词、硬性要求和能力缺口,减少简历初筛一眼不匹配。",
    accent: "blue",
  },
  {
    emoji: "🛡",
    title: "怀疑型追问 + 风险提前暴露",
    desc: "先找出表述太空、证据不足、容易被追问卡住的地方,再进入真实投递。",
    accent: "red",
  },
  {
    emoji: "🎤",
    title: "3 类场景 × 3 种面试官风格",
    desc: "半结构化、行为面、技术面,搭配亲切、严厉、严谨风格,训练不同压力下的应答。",
    accent: "yellow",
  },
  {
    emoji: "♻️",
    title: "面试亮点识别 + 简历回写",
    desc: "自动识别面试回答里的新成果、数字和隐藏亮点,把答出来的价值补回简历。",
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
            Six intelligent capabilities
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            六大智能能力,支撑一条可分析、可优化的求职闭环
          </h2>
          <p className="text-ink-soft text-base max-w-2xl mx-auto">
            围绕 RIASEC 测评、JD 解析、结构化追问、面试复盘和闭环回写设计,把求职准备从感觉判断变成可分析、可优化的路径。
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
