"use client";

import type { FlowStage, StepFlow } from "@/lib/modules-config";

/**
 * 能力架构图:按真实数据流画"阶段链"(上游 → 下游 → 结果)。
 * 约束/支撑类能力作为小标签挂在对应环节上,不平铺。
 * 无图标,排版从紧;窄列竖排,桌面/移动端通用。
 */

const ACCENT_HEX = {
  blue: "#2B7FD8",
  yellow: "#d9bc3f",
  red: "#E84A5F",
} as const;

type Accent = "blue" | "yellow" | "red";

type Props = {
  flow: StepFlow;
  accent: Accent;
};

/** 单个处理环节:标题 + 一句话,挂载标签紧贴其下 */
function StageCard({ stage, hex }: { stage: FlowStage; hex: string }) {
  return (
    <div className="rounded-xl bg-card border border-border shadow-sm px-3.5 py-2.5 h-full flex flex-col justify-center">
      <p className="text-[13px] leading-snug">
        <span className="font-bold text-ink">{stage.title}</span>
        <span className="text-ink-muted"> — {stage.sub}</span>
      </p>
      {stage.tags && (
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          {stage.tags.map((t) => (
            <span
              key={t}
              className="text-[10px] leading-tight px-1.5 py-0.5 rounded border"
              style={{
                borderColor: `${hex}55`,
                backgroundColor: `${hex}0d`,
                color: "var(--color-ink-soft, #555)",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** 环节之间的下行箭头 */
function DownArrow({ hex }: { hex: string }) {
  return (
    <svg
      viewBox="0 0 10 16"
      className="w-2.5 h-4 mx-auto flex-shrink-0"
      aria-hidden="true"
    >
      <line x1="5" y1="0" x2="5" y2="10" stroke={hex} strokeWidth="1.6" />
      <path d="M 1.5 9 L 5 15 L 8.5 9 Z" fill={hex} />
    </svg>
  );
}

/** 流到底部的最终好结果 */
function ResultCard({
  result,
  hex,
}: {
  result: StepFlow["result"];
  hex: string;
}) {
  return (
    <div
      className="rounded-xl border-2 px-4 py-2.5 shadow-sm text-center"
      style={{ borderColor: hex, backgroundColor: `${hex}12` }}
    >
      <p className="text-sm font-bold leading-snug" style={{ color: hex }}>
        {result.title}
      </p>
      <p className="text-[11px] text-ink-soft leading-relaxed">{result.sub}</p>
    </div>
  );
}

export function CapabilityFlow({ flow, accent }: Props) {
  const hex = ACCENT_HEX[accent];

  return (
    <div className="flex flex-col w-full">
      {flow.caption && (
        <p className="text-[11px] text-ink-muted italic mb-2.5">
          {flow.caption}
        </p>
      )}
      {flow.stages.map((s, i) => (
        <div key={s.title} className="flex flex-col flex-1">
          <div className="flex-1">
            <StageCard stage={s} hex={hex} />
          </div>
          {i < flow.stages.length - 1 && (
            <div className="py-0.5">
              <DownArrow hex={hex} />
            </div>
          )}
        </div>
      ))}
      <div className="py-0.5">
        <DownArrow hex={hex} />
      </div>
      <ResultCard result={flow.result} hex={hex} />
    </div>
  );
}
