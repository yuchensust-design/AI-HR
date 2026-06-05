import { Card } from "@/components/ui/card";

/**
 * 六大智能能力 — 撑起一条可分析、可优化的求职闭环
 * 每张卡 = 一个 AI-HR/数据分析视角能看见的能力模块,而非用户价值口号。
 */

type Capability = {
  emoji: string;
  title: string;
  desc: string;
  /** 技术证据条(plan offer-1-sparkling-hippo P2):评委一眼看到具体数字,不是宣传口号 */
  metric: string;
  accent: "blue" | "yellow" | "red";
};

const CAPABILITIES: Capability[] = [
  {
    emoji: "🧭",
    title: "RIASEC + 经历交叉验证",
    desc: "基于职业兴趣测评和真实经历信号,不只看喜欢什么,也判断做过什么、适合什么。",
    metric: "18 题 RIASEC × 兴趣 tag · 6-10 个推荐方向 × 可投性 3 级标签",
    accent: "blue",
  },
  {
    emoji: "📝",
    title: "STAR 挖掘 + 量化证据提取",
    desc: "把课程、实习、社团、项目拆成任务、动作、结果和数字,沉淀可写进简历的素材。",
    metric: "6 阶段对话骨架 · 每轮 1+ 草稿 bullet · STAR 4 要素结构化",
    accent: "yellow",
  },
  {
    emoji: "🔎",
    title: "JD 解析 + 关键词缺口映射",
    desc: "拆解岗位关键词、硬性要求和能力缺口,减少简历初筛一眼不匹配。",
    metric: "must_have / nice_to_have / gaps 三层拆解 · Live Diff 6 维量化",
    accent: "blue",
  },
  {
    emoji: "🛡",
    title: "反编造 4 级 + 证据审计",
    desc: "claimType 风险分级 + 数字溯源校验,LLM 编造的数字会自动替换为占位符,只有显式证据才能默认采纳。",
    metric: "claim_type 4 级 (explicit / inferred / needs_confirmation / forbidden) · normalize 数字溯源 · 证据审计可展开",
    accent: "red",
  },
  {
    emoji: "🎤",
    title: "3 类场景 × 3 种面试官风格 + 4 维复盘",
    desc: "半结构化、行为面、技术面,搭配亲切、严厉、严谨风格,训练不同压力下的应答。",
    metric: "9 种场景组合 · 4 维评分(逻辑/具体/清晰/口水话) · 低分附示范回答",
    accent: "yellow",
  },
  {
    emoji: "♻️",
    title: "面试亮点识别 + 简历回写",
    desc: "自动识别面试回答里的新成果、数字和隐藏亮点,把答出来的价值补回简历。",
    metric: "一键采纳 → HIDDEN_EXPERIENCES 素材池 · M5 / 日记 / M3 三源统一通道",
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
                  <p className="text-sm text-ink-soft leading-relaxed mb-2">
                    {c.desc}
                  </p>
                  <p className="text-[11px] text-esther-blue font-mono leading-relaxed bg-esther-blue/5 border-l-2 border-esther-blue/40 px-2 py-1 rounded-r">
                    📊 {c.metric}
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
