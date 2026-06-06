"use client";

import { useEffect, useState } from "react";

/**
 * M3 优化阶段 stepper — 用户点"开始优化 →" 跳到 /m3/result 时,
 * 在 LLM(suggest-edits + diff-metrics)实际跑的同时,前端显示"AI 正在做什么"。
 * 6 步预设文案,2s 切一步,~12s 覆盖正常 LLM 响应时间(8-15s)。
 * LLM 比预期慢 → 停在最后一步继续转;LLM 比预期快 → 切完一步立刻 onDone。
 *
 * 设计参考用户给的图三(竞品 loading 模式)。
 */

const STEPS = [
  "正在清理简历原文,识别岗位关键词…",
  "正在比对你的经历与 JD 任职要求…",
  "正在把责任型描述改写为成就型表达…",
  "正在补充 JD 命中的关键词与技能…",
  "正在识别需要你补充量化数字的句子…",
  "正在整合最终简历,准备好下载…",
];

const PER_STEP_MS = 1800;

export function M3OptimizationStepper({ ready }: { ready: boolean }) {
  // ready = LLM 已经回来(suggest-edits + diff-metrics 都完成);
  // 没 ready 时 stepper 停在最后一步继续转
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    if (stepIdx >= STEPS.length - 1) return;
    const t = setTimeout(() => setStepIdx((s) => s + 1), PER_STEP_MS);
    return () => clearTimeout(t);
  }, [stepIdx]);

  return (
    <div className="max-w-[600px] mx-auto px-6 py-16">
      <div className="text-center mb-8">
        <p className="font-display italic text-sm text-esther-blue mb-2">
          Optimizing your resume
        </p>
        <h2 className="text-2xl md:text-3xl font-bold text-ink mb-3 leading-tight">
          AI 正在优化你的简历
        </h2>
        <p className="text-sm text-ink-soft">通常 10-15 秒,可以放心等</p>
      </div>

      <div className="space-y-3.5">
        {STEPS.map((label, idx) => {
          const done = idx < stepIdx || (ready && idx <= stepIdx);
          const active = idx === stepIdx && !ready;
          const pending = idx > stepIdx;
          return (
            <div
              key={idx}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border transition-all ${
                done
                  ? "border-esther-blue/30 bg-esther-blue/[0.03]"
                  : active
                    ? "border-esther-blue/60 bg-esther-blue/[0.06]"
                    : "border-border bg-card opacity-50"
              }`}
            >
              <div className="flex-shrink-0 w-5 h-5 mt-0.5 flex items-center justify-center">
                {done ? (
                  <span className="text-esther-blue text-base">✓</span>
                ) : active ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-esther-blue border-t-transparent rounded-full animate-spin" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-ink-muted/40" />
                )}
              </div>
              <p
                className={`text-sm leading-relaxed ${
                  done
                    ? "text-ink"
                    : active
                      ? "text-ink font-medium"
                      : "text-ink-muted"
                }`}
              >
                {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
