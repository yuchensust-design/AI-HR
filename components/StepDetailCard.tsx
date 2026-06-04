"use client";

import Link from "next/link";
import type { StepModule } from "@/lib/modules-config";

/**
 * 5 阶段切换主体大卡片
 * 左 60%:STEP NN · title + slogan + desc + bullets + outcomes + 2 CTA + handoff
 * 右 40%:capabilities chip card list(label + 来源标签,无百分比)
 * mobile 纵向堆叠
 */

type Props = {
  step: StepModule;
  onSelectStep?: (no: string) => void;
};

export function StepDetailCard({ step, onSelectStep }: Props) {
  const isLoop = step.no === "05";

  return (
    <div className="bg-card border-2 border-border rounded-2xl overflow-hidden shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr]">
        {/* 左:正文 */}
        <div className="p-7 md:p-8 lg:p-10">
          <p className="font-display italic text-xs tracking-wider text-esther-blue mb-2">
            STEP {step.no} · {step.title}
          </p>
          <h3 className="text-2xl md:text-3xl font-bold text-ink mb-4 leading-snug">
            {step.slogan}
          </h3>
          <p className="text-sm md:text-base text-ink-soft leading-relaxed mb-6">
            {step.desc}
          </p>

          <ul className="space-y-3 mb-7">
            {step.bullets.map((b) => (
              <li key={b} className="flex items-start gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-esther-blue/15 flex-shrink-0 mt-0.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-3 h-3 text-esther-blue"
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
          <div className="mb-7 rounded-xl bg-warm-bg-deep/50 border border-esther-yellow/40 p-5">
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

          {isLoop && (
            <div className="mb-6 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-esther-yellow/40 border border-esther-yellow text-sm text-ink">
              <span className="text-esther-blue text-lg leading-none">↺</span>
              这一步还会反哺到 STEP 03 简历优化,形成完整闭环
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Link
              href={step.primaryCta.href}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
            >
              {step.primaryCta.label} →
            </Link>
            <Link
              href={step.secondaryCta.href}
              className="inline-flex items-center justify-center rounded-full border-2 border-ink/10 bg-card text-ink px-5 py-2.5 text-sm font-medium hover:border-esther-blue transition-colors"
            >
              {step.secondaryCta.label}
            </Link>
          </div>

          {/* handoff badge — 下一步如何承接 */}
          {step.handoff.targetStep && onSelectStep ? (
            <button
              type="button"
              onClick={() => onSelectStep(step.handoff.targetStep!)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border border-esther-blue/40 text-sm text-esther-blue hover:bg-esther-blue/5 transition-colors"
            >
              <span className="text-base leading-none">→</span>
              <span className="font-medium">{step.handoff.text}</span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-card border border-esther-blue/40 text-sm text-esther-blue">
              <span className="text-base leading-none">→</span>
              <span className="font-medium">{step.handoff.text}</span>
            </div>
          )}
        </div>

        {/* 右:能力支撑 chip card list */}
        <div className="p-7 md:p-8 lg:p-10 bg-warm-bg-deep/40 border-t lg:border-t-0 lg:border-l border-border">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-5">
            这一步的能力支撑
          </p>
          <div className="space-y-3">
            {step.capabilities.map((c) => (
              <div
                key={`${step.no}-${c.label}`}
                className="bg-card border border-esther-blue/20 rounded-lg p-3.5 hover:border-esther-blue/50 transition-colors"
              >
                <p className="text-sm font-semibold text-ink leading-snug mb-1">
                  {c.label}
                </p>
                <p className="text-xs text-ink-muted leading-snug">
                  {c.source}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-ink-muted mt-5 leading-relaxed">
            列出的是能力维度与来源,不是结果保证。实际产出依赖你提供的输入(简历、JD、回答)。
          </p>
        </div>
      </div>
    </div>
  );
}
