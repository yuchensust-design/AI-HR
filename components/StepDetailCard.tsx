"use client";

import { useState } from "react";
import { Image as ImageIcon, Workflow } from "lucide-react";
import Link from "next/link";
import { ACTS, type StepModule } from "@/lib/modules-config";
import { CapabilityFlow } from "@/components/CapabilityFlow";
import { AnnotatedShot } from "@/components/AnnotatedShot";
import { DEMO_SHOTS } from "@/lib/demo-shots";

/**
 * 模块详情大卡片
 * 顶部:彩色渐变标题头(STEP chip + 幕 chip + slogan,颜色随三幕)
 * 下方 2 列:左 = bullets + outcomes + loopNote + CTA + handoff;右 = 能力支撑
 * mobile 纵向堆叠
 */

type Props = {
  step: StepModule;
  onSelectStep?: (no: string) => void;
};

/** 三幕配色(全 literal class,Tailwind 可静态提取) */
const ACCENT = {
  blue: {
    grad: "from-esther-blue/20 via-esther-blue/8 to-transparent",
    chip: "bg-esther-blue",
    text: "text-esther-blue",
    cta: "bg-esther-blue hover:bg-esther-blue-dark",
    dotBg: "bg-esther-blue/15",
    dotIcon: "text-esther-blue",
    cap: "border-esther-blue/20 hover:border-esther-blue/50",
    handoff: "border-esther-blue/40 text-esther-blue hover:bg-esther-blue/5",
  },
  yellow: {
    grad: "from-esther-yellow/35 via-esther-yellow/12 to-transparent",
    chip: "bg-esther-yellow-dark",
    text: "text-esther-yellow-dark",
    cta: "bg-esther-yellow-dark hover:bg-esther-yellow-dark/90",
    dotBg: "bg-esther-yellow/30",
    dotIcon: "text-esther-yellow-dark",
    cap: "border-esther-yellow-dark/25 hover:border-esther-yellow-dark/50",
    handoff: "border-esther-yellow-dark/40 text-esther-yellow-dark hover:bg-esther-yellow/10",
  },
  red: {
    grad: "from-esther-red/15 via-esther-red/6 to-transparent",
    chip: "bg-esther-red",
    text: "text-esther-red",
    cta: "bg-esther-red hover:bg-esther-red-dark",
    dotBg: "bg-esther-red/15",
    dotIcon: "text-esther-red",
    cap: "border-esther-red/20 hover:border-esther-red/50",
    handoff: "border-esther-red/40 text-esther-red hover:bg-esther-red/5",
  },
} as const;

export function StepDetailCard({ step, onSelectStep }: Props) {
  const act = ACTS.find((a) => a.id === step.act) ?? ACTS[0];
  const c = ACCENT[act.accent];
  const shot = DEMO_SHOTS[step.no];

  // 视图默认展示「能力架构」(先讲清怎么做到的),想看真实成品再切「示例输出」。
  // 切换模块时重置为能力架构。渲染期对比 prop 调整 state,React 官方模式,避免 effect 里 setState。
  const [rightView, setRightView] = useState<"flow" | "shot">("flow");
  const [shownNo, setShownNo] = useState(step.no);
  if (shownNo !== step.no) {
    setShownNo(step.no);
    setRightView("flow");
  }

  return (
    <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm lg:flex lg:flex-col lg:min-h-[830px]">
      {/* 彩色渐变标题头 */}
      <div className={`px-7 md:px-10 py-6 md:py-7 bg-gradient-to-br ${c.grad} border-b border-border`}>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full text-white ${c.chip}`}>
            STEP {step.no}
          </span>
          <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full bg-card/70 ${c.text}`}>
            {act.title}
          </span>
        </div>
        <h3 className={`text-2xl md:text-3xl font-bold leading-snug mb-2 ${c.text}`}>
          {step.slogan}
        </h3>
        <p className="text-sm md:text-base text-ink-soft leading-relaxed max-w-3xl">
          {step.desc}
        </p>
      </div>

      {/* body:整框在「示例输出」与「能力架构」之间切换 */}
      <div className="p-7 md:p-8 lg:p-10 flex flex-col lg:flex-1">
        {/* 卡片级模式切换(有 demo 图的模块才给) */}
        {shot && (
          <div className="flex items-center justify-between gap-3 mb-6">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider">
              {rightView === "shot" ? "示例输出 · 亮点标注" : "功能特点 · 能力支撑"}
            </p>
            <div className={`flex items-center gap-1 rounded-full bg-card border p-1 flex-shrink-0 shadow-sm ${c.cap}`}>
              <button
                type="button"
                onClick={() => setRightView("shot")}
                className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  rightView === "shot" ? `text-white ${c.chip}` : `${c.text} hover:bg-card`
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                示例输出
              </button>
              <button
                type="button"
                onClick={() => setRightView("flow")}
                className={`inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  rightView === "flow" ? `text-white ${c.chip}` : "text-ink-muted hover:text-ink"
                }`}
              >
                <Workflow className="w-3.5 h-3.5" strokeWidth={2} aria-hidden="true" />
                能力架构
              </button>
            </div>
          </div>
        )}

        {rightView === "shot" && shot ? (
          /* 示例输出模式:整框一张大标注图 + 图例 */
          <div className="mb-8 flex-1">
            <AnnotatedShot shot={shot} accent={act.accent} />
          </div>
        ) : (
          /* 能力架构模式:左 = 功能特点 + 你会拿到;右 = 能力流程图 */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 mb-8 flex-1 items-stretch">
            {/* 左列 */}
            <div className="flex flex-col gap-6">
              <ul className="space-y-3">
                {step.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3">
                    <span className={`flex h-5 w-5 items-center justify-center rounded-full flex-shrink-0 mt-0.5 ${c.dotBg}`}>
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`w-3 h-3 ${c.dotIcon}`}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                    <span className="text-sm md:text-base text-ink leading-relaxed">
                      {b}
                    </span>
                  </li>
                ))}
              </ul>

              {/* 你会拿到什么 — 产出物清单 */}
              <div className="rounded-xl bg-warm-bg-deep/50 border border-esther-yellow/40 p-5 lg:flex-1">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">
                  这一步你会拿到
                </p>
                <ul className="space-y-2">
                  {step.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-2.5">
                      <span className="flex h-4 w-4 items-center justify-center rounded bg-esther-yellow text-ink text-[10px] font-bold flex-shrink-0 mt-0.5">
                        ✓
                      </span>
                      <span className="text-sm text-ink leading-relaxed">{o}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* 右列:能力流程图 */}
            <div className="rounded-2xl bg-warm-bg-deep/40 border border-border px-5 py-5 flex flex-col">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-4">
                它是怎么跑通的 · 能力支撑
              </p>
              <div className="flex-1 flex">
                <CapabilityFlow flow={step.flow} accent={act.accent} />
              </div>
            </div>
          </div>
        )}

        {step.loopNote && (
          <div className="mb-6 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-esther-yellow/40 border border-esther-yellow text-sm text-ink">
            <span className="text-esther-blue text-lg leading-none">♻️</span>
            {step.loopNote}
          </div>
        )}

        {/* CTA + 承接 */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={step.primaryCta.href}
            className={`inline-flex items-center justify-center rounded-full text-white px-5 py-2.5 text-sm font-medium transition-colors shadow-sm ${c.cta}`}
          >
            {step.primaryCta.label} →
          </Link>
          {step.handoff.targetStep && onSelectStep ? (
            <button
              type="button"
              onClick={() => onSelectStep(step.handoff.targetStep!)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border text-sm transition-colors ${c.handoff}`}
            >
              <span className="text-base leading-none">→</span>
              <span className="font-medium">{step.handoff.text}</span>
            </button>
          ) : (
            <div className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border text-sm ${c.handoff}`}>
              <span className="text-base leading-none">→</span>
              <span className="font-medium">{step.handoff.text}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
