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
    title: "测方向不靠玄学,看你真做过什么",
    desc: "测评判断兴趣 + 聊你做过的事,推出 3-5 个你可能适合的行业方向,每条都告诉你为什么。",
    metric: "18 / 60 题职业兴趣测评(含兴趣标签) · 推 3-5 个方向 · 每条配可投性等级",
    accent: "blue",
  },
  {
    emoji: "📝",
    title: "把零碎经历讲透,沉淀成可写素材",
    desc: "把课程、实习、社团、项目拆成你做了什么、怎么做的、结果是啥,每步出一条草稿 bullet。",
    metric: "6 阶段结构化对话 · 每轮 1+ 草稿 bullet · 按 STAR 结构展开",
    accent: "yellow",
  },
  {
    emoji: "🔎",
    title: "对着 JD 改简历,告诉你差在哪",
    desc: "拆 JD 关键词、硬性要求和能力差距,告诉你简历哪条命中了、哪条没命中、要不要补。",
    metric: "JD 必备 / 加分 / 缺口 三层拆解 · 改完跟原版 6 维对比",
    accent: "blue",
  },
  {
    emoji: "🛡",
    title: "AI 不替你编经历,数字必须有出处",
    desc: "AI 推测的会标'待你确认';没说过的数字会被替换为占位符让你来填;每条都能查到原始证据。",
    metric: "建议分 4 级(有据 / 推断 / 待你确认 / 已拦截) · 数字必须溯源 · 可展开看原文",
    accent: "red",
  },
  {
    emoji: "🎤",
    title: "9 种面试组合 × 4 维复盘",
    desc: "3 类面试(半结构化/行为/技术)× 3 种面试官性格(亲切/严厉/严谨),练完每题给评分 + 改进示范。",
    metric: "9 组合 · 4 维评分(逻辑/具体/清晰/口水话) · 低分配示范回答",
    accent: "yellow",
  },
  {
    emoji: "♻️",
    title: "面试里答出的亮点,自动回写简历",
    desc: "练面试时答出来的新数字、新成果、新故事,AI 帮你抽出来,一键加进简历素材池。",
    metric: "一键采纳 → 简历素材池 · 面试 / 日记 / 简历 三源统一通道",
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
            6 件事,帮你把求职过透
          </h2>
          <p className="text-ink-soft text-base max-w-2xl mx-auto">
            从找方向到改简历、练面试再到反哺简历 — 每件事都给你可看的依据 + 可改的结果
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
