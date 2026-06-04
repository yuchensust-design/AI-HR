"use client";

import { useState } from "react";
import { STEP_MODULES } from "@/lib/modules-config";
import { StepTimelineNav } from "@/components/StepTimelineNav";
import { StepDetailCard } from "@/components/StepDetailCard";

/**
 * 「能陪你做的 5 件事」整段 section(切换式)
 * 顶部 step 切换条 + 主体大卡片(只显示当前 step)
 * 默认 STEP 01
 */

export function StepsSection() {
  const [active, setActive] = useState<string>("01");
  const step = STEP_MODULES.find((s) => s.no === active) ?? STEP_MODULES[0];

  return (
    <section id="modules" className="bg-warm-bg-deep border-t border-border">
      <div className="max-w-[1300px] mx-auto px-6 py-20">
        <div className="mb-10">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            5 stages · outcomes & handoff
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            五阶段流程 · 每一步的产出和承接
          </h2>
          <p className="text-ink-soft max-w-2xl">
            不是 5 个孤立功能,而是一条{" "}
            <span className="text-esther-blue font-medium">可分析、可优化的求职闭环</span>
            。每一步有明确产出、能力支撑和向下游的承接逻辑。点上方任一阶段查看详情。
          </p>
        </div>

        {/* 顶部 step 切换条 */}
        <div className="mb-10">
          <StepTimelineNav
            steps={STEP_MODULES}
            activeStep={active}
            onSelect={setActive}
          />
        </div>

        {/* 主体大卡片 */}
        <StepDetailCard step={step} onSelectStep={setActive} />

        {/* 闭环 callout(非 05 时显示) */}
        {active !== "05" && (
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border text-xs text-ink-soft">
              <span className="text-esther-blue text-base leading-none">↺</span>
              <span>
                <button
                  type="button"
                  onClick={() => setActive("05")}
                  className="font-medium text-esther-blue hover:underline"
                >
                  STEP 05 模拟面试
                </button>
                {" "}还会反哺到{" "}
                <button
                  type="button"
                  onClick={() => setActive("03")}
                  className="font-medium text-esther-blue hover:underline"
                >
                  STEP 03 简历
                </button>
                ,形成完整闭环
              </span>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
