"use client";

import Link from "next/link";
import type { StepModule } from "@/lib/modules-config";
import { MetricBar } from "@/components/MetricBar";

/**
 * 5 阶段切换主体大卡片
 * 左 60%:STEP NN · title + slogan + desc + 3 bullets + 2 CTA
 * 右 40%:3 个量化 MetricBar
 * mobile 纵向堆叠
 */

type Props = {
  step: StepModule;
};

export function StepDetailCard({ step }: Props) {
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

          {isLoop && (
            <div className="mb-6 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-esther-yellow/40 border border-esther-yellow text-sm text-ink">
              <span className="text-esther-blue text-lg leading-none">↺</span>
              这一步还会反哺到 STEP 03 简历优化,形成完整闭环
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
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
        </div>

        {/* 右:量化指标 */}
        <div className="p-7 md:p-8 lg:p-10 bg-warm-bg-deep/40 border-t lg:border-t-0 lg:border-l border-border">
          <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-5">
            {step.title} · 关键指标
          </p>
          <div className="space-y-5">
            {step.metrics.map((m) => (
              <MetricBar
                key={`${step.no}-${m.label}`}
                label={m.label}
                value={m.value}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
