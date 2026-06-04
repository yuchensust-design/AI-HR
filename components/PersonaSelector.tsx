"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";

/**
 * 场景自选 — Landing 中段大块卡片
 * 用户点击 → 写 localStorage `user_profile.persona_tag` → 跳推荐模块
 * 详 PRD §3.9.1
 */

type Persona = {
  key: string;
  letter: string;
  title: string;
  description: string;
  recommendRoute: string;
  recommendText: string;
  accent: "blue" | "yellow" | "red";
};

const PERSONAS: Persona[] = [
  {
    key: "xiaozhang",
    letter: "A",
    title: "完全没方向",
    description: "不知道自己适合什么,所有方向都怕选错,投哪个都没底",
    recommendRoute: "/m1",
    recommendText: "先做 RIASEC 测评",
    accent: "blue",
  },
  {
    key: "linting",
    letter: "B",
    title: "想转方向",
    description: "本专业越念越不喜欢,想跨过去,但简历对不上 HR 一眼就刷",
    recommendRoute: "/m1",
    recommendText: "测评 + 跨方向简历",
    accent: "yellow",
  },
  {
    key: "chenhao",
    letter: "C",
    title: "有简历想拔高",
    description: "有 1-2 段实习,但模板感太重,投不进大厂中等岗位",
    recommendRoute: "/m3",
    recommendText: "改简历 + 模拟面试",
    accent: "blue",
  },
  {
    key: "liming",
    letter: "D",
    title: "校招焦虑",
    description: "投了几十份没回应,开始怀疑是简历问题还是自己不够",
    recommendRoute: "/m3",
    recommendText: "简历优化 + 面试反哺",
    accent: "red",
  },
  {
    key: "wangwen",
    letter: "E",
    title: "双非想冲大厂",
    description: "学校不占优,想用项目和实习把硬实力补上来,赢在差异化",
    recommendRoute: "/m4",
    recommendText: "做一段项目 + 学卡组",
    accent: "yellow",
  },
  {
    key: "self_select",
    letter: "F",
    title: "我自己决定走",
    description: "跳过引导,直接看 5 大功能入口,自己挑顺手的开始",
    recommendRoute: "#modules",
    recommendText: "直接看 5 大模块",
    accent: "blue",
  },
];

export function PersonaSelector() {
  const router = useRouter();

  const handleSelect = (persona: Persona) => {
    if (typeof window !== "undefined") {
      const profile = {
        persona_tag: persona.key,
        selected_at: new Date().toISOString(),
      };
      localStorage.setItem("user_profile", JSON.stringify(profile));
      // TODO: 埋点 landing_persona_select 事件(Day 4 加埋点 lib 时实装)
    }

    if (persona.recommendRoute.startsWith("#")) {
      const el = document.querySelector(persona.recommendRoute);
      el?.scrollIntoView({ behavior: "smooth" });
    } else {
      router.push(persona.recommendRoute);
    }
  };

  return (
    <section className="max-w-[1300px] mx-auto px-6 py-20">
      <div className="mb-12">
        <p className="font-display italic text-sm text-esther-blue mb-2">
          Found your tribe?
        </p>
        <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
          你现在更接近哪种状态?
        </h2>
        <p className="text-ink-soft text-base">
          这 6 种困境是我们听过最多的 —— 选一个最像你的,我带你从最合适的第一步开始 · 不强制,可跳过
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {PERSONAS.map((p) => (
          <Card
            key={p.key}
            onClick={() => handleSelect(p)}
            className="group cursor-pointer p-7 bg-card hover:bg-warm-bg-deep transition-colors border-2 border-border hover:border-esther-blue"
          >
            <div className="flex items-start gap-4 mb-4">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full font-display font-semibold text-base flex-shrink-0 ${
                  p.accent === "blue"
                    ? "bg-esther-blue text-white"
                    : p.accent === "yellow"
                    ? "bg-esther-yellow text-ink"
                    : "bg-esther-red text-white"
                }`}
              >
                {p.letter}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-ink mb-1">
                  {p.title}
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed">
                  {p.description}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between pt-3 border-t border-border/60">
              <span className="text-xs text-ink-muted">推荐路径</span>
              <span className="text-sm font-medium text-esther-blue group-hover:underline">
                {p.recommendText} →
              </span>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
