"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import type { EditSuggestion, GapAlertDecision } from "@/components/EditSuggestionCard";

/**
 * Gap-Alert 卡 — 用户反馈 5 (2026-06-02 v2)
 *
 * JD 要求但简历完全没体现 → 显式列给用户。
 * 不直接改简历,而是给 3 选 1:
 *   A. 「我有相关经验 → 补一段」inline 展开 textarea → append hidden_experiences → reload
 *   B. 「确实没有 → 接受这个缺口」标记 acknowledged
 *   C. 「打算做项目补 → /m4」跳模块 E.2(Gap→Project Bridge)
 */

const FIXABLE_STYLE: Record<string, { label: string; color: string }> = {
  "易补<2周": { label: "易补 <2 周", color: "bg-esther-blue/15 text-esther-blue" },
  "中等1-2月": { label: "中等 1-2 月", color: "bg-esther-yellow text-ink" },
  "难补≥3月": { label: "难补 ≥3 月", color: "bg-esther-red/15 text-esther-red" }, // 实际应该被过滤掉
};

export function GapAlertCard({
  edit,
  decision,
  onFill,
  onAcknowledge,
  onRedirectProject,
  fillBusy,
}: {
  edit: EditSuggestion;
  decision: GapAlertDecision;
  onFill: (userInput: string) => Promise<void>;
  onAcknowledge: () => void;
  onRedirectProject: () => void;
  fillBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [textareaValue, setTextareaValue] = useState("");

  const fix = edit.fixable ? FIXABLE_STYLE[edit.fixable] : null;

  async function handleSubmit() {
    if (!textareaValue.trim()) return;
    await onFill(textareaValue.trim());
    setTextareaValue("");
    setExpanded(false);
  }

  const isDecided = decision !== null;
  const decidedColor =
    decision?.kind === "filled"
      ? "border-esther-blue bg-esther-blue/5"
      : decision?.kind === "acknowledged"
      ? "border-border bg-warm-bg-deep/30 opacity-70"
      : decision?.kind === "redirect-project"
      ? "border-esther-yellow bg-esther-yellow/10"
      : "border-esther-red/40 bg-esther-red/5";

  return (
    <Card className={`p-4 border-2 transition-all ${decidedColor}`}>
      {/* 头部 chips */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-esther-red text-white">
            📋 JD 缺口
          </span>
          {fix && (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${fix.color}`}
            >
              {fix.label}
            </span>
          )}
        </div>
        <span className="text-[10px] text-ink-muted font-mono">{edit.id}</span>
      </div>

      {/* JD requirement */}
      <div className="mb-3">
        <p className="text-[10px] text-ink-muted font-display italic mb-1">
          JD 要求 ↓
        </p>
        <p className="text-sm font-medium text-ink leading-relaxed">
          {edit.jd_requirement_text ?? edit.suggested_text}
        </p>
      </div>

      {/* reason */}
      <div className="mb-3 px-2 py-1.5 rounded bg-warm-bg-deep/30 border-l-2 border-esther-red/40">
        <p className="text-[10px] text-ink-soft leading-relaxed">
          💬 {edit.reason || "Phase 3 你说没相关经验,或没问到这条"}
        </p>
      </div>

      {/* 决策已定 — 显示决策 */}
      {decision?.kind === "filled" && (
        <div className="mb-3 px-2 py-2 rounded bg-esther-blue/10 border border-esther-blue/40">
          <p className="text-[10px] text-esther-blue font-display italic mb-1">
            ✓ 你补充的:
          </p>
          <p className="text-xs text-ink leading-relaxed">{decision.user_input}</p>
          <p className="text-[10px] text-ink-muted mt-1">
            (已加入隐藏经验池,Phase 5 会重新生成针对性建议)
          </p>
        </div>
      )}
      {decision?.kind === "acknowledged" && (
        <p className="text-xs text-ink-soft mb-3">
          ✗ 已接受 — 不会写进最终简历
        </p>
      )}
      {decision?.kind === "redirect-project" && (
        <p className="text-xs text-ink mb-3">
          🎯 已转到模块 E.2 项目设计
        </p>
      )}

      {/* 展开 textarea(用户选 "我有,补一段")*/}
      {expanded && !isDecided && (
        <div className="mb-3 p-3 rounded-lg bg-card border-2 border-esther-blue/40">
          <p className="text-[10px] text-esther-blue mb-2 font-medium">
            ✏️ 简写 1-2 句你跟「{edit.jd_requirement_text ?? "这条要求"}」沾边的经历
          </p>
          <textarea
            value={textareaValue}
            onChange={(e) => setTextareaValue(e.target.value)}
            rows={3}
            placeholder="eg: 大二选过 SQL 基础课,做过 3 次小练习;实习时主管用 SQL 出报表我看过怎么写..."
            className="w-full px-3 py-2 rounded-lg border border-border bg-warm-bg text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
            disabled={fillBusy}
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={handleSubmit}
              disabled={fillBusy || !textareaValue.trim()}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40"
            >
              {fillBusy ? "处理中..." : "提交 → 重生改写建议"}
            </button>
            <button
              onClick={() => {
                setExpanded(false);
                setTextareaValue("");
              }}
              disabled={fillBusy}
              className="text-xs text-ink-muted hover:text-ink transition-colors px-2"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 3 按钮(未决策时) */}
      {!isDecided && !expanded && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setExpanded(true)}
            className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors"
          >
            ✏️ 我有,补一段
          </button>
          <button
            onClick={onAcknowledge}
            className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-3 py-1.5 text-xs hover:border-ink-soft transition-colors"
          >
            ✗ 确实没有
          </button>
          <button
            onClick={onRedirectProject}
            className="inline-flex items-center justify-center rounded-full border border-esther-yellow bg-esther-yellow/15 text-ink px-3 py-1.5 text-xs hover:bg-esther-yellow/30 transition-colors"
          >
            🎯 做项目补 → m4
          </button>
        </div>
      )}
    </Card>
  );
}
