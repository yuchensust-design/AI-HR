"use client";

import type { AgentStepState } from "./types";

const STEPS_DEF: Array<{ step: AgentStepState["step"]; emoji: string; defaultLabel: string }> = [
  { step: "splitter", emoji: "🤖", defaultLabel: "Agent 1 — Splitter:从简历提取搜索关键词" },
  { step: "scraper", emoji: "🌐", defaultLabel: "Crawler:并行抓取 BOSS + 51job 真实岗位" },
  { step: "scorer", emoji: "🎯", defaultLabel: "Agent 2 — Scorer:4 维度评分(批量)" },
  { step: "formatter", emoji: "✨", defaultLabel: "Agent 4 — Formatter:生成个性化推荐说明" },
];

interface AgentProgressProps {
  /** 当前流水线状态 — Map<step, state>;不在 map 里默认 pending */
  steps: Partial<Record<AgentStepState["step"], AgentStepState>>;
}

function StatusIcon({ status }: { status: AgentStepState["status"] }) {
  if (status === "done") {
    return <span className="text-esther-blue text-base font-bold">✓</span>;
  }
  if (status === "running") {
    return (
      <span className="inline-block w-4 h-4 border-2 border-esther-blue border-t-transparent rounded-full animate-spin" />
    );
  }
  if (status === "error") {
    return <span className="text-esther-red text-base font-bold">✗</span>;
  }
  return <span className="text-ink-muted text-base">○</span>;
}

export function AgentProgress({ steps }: AgentProgressProps) {
  return (
    <div className="bg-card border-2 border-esther-blue/30 rounded-2xl p-6 shadow-sm">
      <p className="font-display italic text-sm text-esther-blue mb-1">
        Multi-Agent Pipeline
      </p>
      <h3 className="text-lg font-bold text-ink mb-4">
        AI 正在为你工作 — 4 阶段流水线
      </h3>

      <ol className="space-y-3">
        {STEPS_DEF.map(({ step, emoji, defaultLabel }, idx) => {
          const state: AgentStepState =
            steps[step] ?? {
              step,
              status: "pending",
              label: defaultLabel,
            };
          const isActive = state.status === "running";
          const isDone = state.status === "done";

          return (
            <li
              key={step}
              className={`flex items-start gap-3 p-3 rounded-lg transition-all ${
                isActive
                  ? "bg-esther-blue/10 border border-esther-blue/30"
                  : isDone
                    ? "bg-warm-bg-deep/40"
                    : ""
              }`}
            >
              <span className="text-xl flex-shrink-0 leading-none mt-0.5">{emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] text-ink-muted">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p
                    className={`text-sm leading-snug ${
                      isActive ? "text-ink font-medium" : isDone ? "text-ink" : "text-ink-soft"
                    }`}
                  >
                    {state.label}
                  </p>
                  <div className="ml-auto flex-shrink-0">
                    <StatusIcon status={state.status} />
                  </div>
                </div>
                {state.detail && (
                  <p className="text-xs text-ink-soft mt-1 leading-relaxed">{state.detail}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
