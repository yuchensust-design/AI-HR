"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { formatDelta, type RuleMetrics } from "@/lib/diff-metrics";

/**
 * 6 维客观差异表(2026-06-04 用户需求)
 *
 * 设计要点:
 *   - 不是 score,是「客观可验证的指标」
 *   - 4 维规则(实时)+ 2 维 LLM(主动刷新)
 *   - 每行有 (?) tooltip 显示算法说明 → 用户可 audit
 *   - 标语强调「客观差异(非评分)」
 */

export type LlmMetrics = {
  star_complete_v1: { complete: number; total: number };
  star_complete_v2: { complete: number; total: number };
  hard_req_total: number;
  hard_req_v1_aligned: number;
  hard_req_v2_aligned: number;
  hard_req_items: { req: string; v1: boolean; v2: boolean }[];
  llm_explain: string;
};

const TOOLTIPS: Record<string, string> = {
  jd_keywords: "JD 关键词 = LLM 把 must_have + parsed_requirements 扩展到 30-50 个 token,然后在简历 bullets 里 count 命中。",
  quantified: "量化 bullet = 含具体数字 / metric(过滤纯日期 / 手机号)的 bullet 占比。",
  strong_verb: "强动词 = bullet 开头是 26 词的强动作动词(主导/设计/优化/推动/落地等)。",
  avg_len: "平均字数 = 所有 bullet 文本长度求平均。注:短未必好,长未必差,只是结构提示。",
  star_complete: "STAR 完整度 = LLM 严格判定含 S(Situation)+T(Task)+A(Action)+R(Result) 4 要素的 bullet 数 / 总 bullet 数。",
  hard_req: "学历/经验硬门槛 = LLM 从 JD 提取可二元判定的硬要求(本科/GPA/技能/语言),对 v1 v2 各算对齐数。",
};

function StatRow({
  label,
  tooltip,
  v1,
  v2,
  unit,
  llm,
}: {
  label: string;
  tooltip: string;
  v1: string;
  v2: string;
  unit: "count" | "ratio" | "len";
  llm?: boolean;
}) {
  const v1n = parseFloat(v1.replace("%", "")) || 0;
  const v2n = parseFloat(v2.replace("%", "")) || 0;
  const rawV1 = unit === "ratio" ? v1n / 100 : v1n;
  const rawV2 = unit === "ratio" ? v2n / 100 : v2n;
  const delta = formatDelta(rawV1, rawV2, unit);
  const [showTip, setShowTip] = useState(false);

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-2 text-xs text-ink relative">
        <span className="font-medium">{label}</span>
        {llm && (
          <span className="ml-1.5 text-[9px] text-esther-blue font-display italic">🔄 LLM</span>
        )}
        <button
          onClick={() => setShowTip((s) => !s)}
          onMouseEnter={() => setShowTip(true)}
          onMouseLeave={() => setShowTip(false)}
          className="ml-1 text-ink-muted hover:text-esther-blue text-[10px]"
          aria-label="算法说明"
        >
          (?)
        </button>
        {showTip && (
          <div className="absolute left-0 top-full mt-1 z-10 max-w-xs p-2 rounded bg-ink text-card text-[10px] leading-relaxed shadow-md">
            💡 {tooltip}
          </div>
        )}
      </td>
      <td className="py-2 px-2 text-xs text-ink-soft font-mono text-right tabular-nums">
        {v1}
      </td>
      <td className="py-2 px-2 text-xs text-ink font-mono text-right tabular-nums font-medium">
        {v2}
      </td>
      <td className="py-2 pl-2 text-xs font-mono text-right tabular-nums">
        <span
          className={
            delta.direction === "up"
              ? "text-esther-blue font-medium"
              : delta.direction === "down"
              ? "text-esther-red"
              : "text-ink-muted"
          }
        >
          {delta.display}
        </span>
      </td>
    </tr>
  );
}

export function DiffMetricsTable({
  ruleV1,
  ruleV2,
  llm,
  onRefreshLlm,
  refreshing,
}: {
  ruleV1: RuleMetrics;
  ruleV2: RuleMetrics;
  llm: LlmMetrics | null;
  onRefreshLlm: () => void;
  refreshing: boolean;
}) {
  return (
    <Card className="p-4 border-2 border-esther-blue/20 bg-warm-bg-deep/20">
      {/* 标题 + 标语 */}
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <p className="font-display italic text-xs text-esther-blue mb-0.5">
            Objective Diff
          </p>
          <h3 className="text-sm font-semibold text-ink">
            📊 客观差异(非评分)· 算法透明
          </h3>
          <p className="text-[10px] text-ink-muted mt-0.5">
            4 维规则实时(accept/reject 自动更新)· 2 维 LLM(点 🔄 刷新)
          </p>
        </div>
        <button
          onClick={onRefreshLlm}
          disabled={refreshing}
          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-3 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40"
        >
          {refreshing ? "🔄 评估中..." : "🔄 重新评估 LLM 2 维"}
        </button>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b-2 border-border text-[10px] text-ink-muted font-display italic">
              <th className="text-left py-1.5 pr-2 font-normal">指标</th>
              <th className="text-right py-1.5 px-2 font-normal">v1 原</th>
              <th className="text-right py-1.5 px-2 font-normal">v2 改后</th>
              <th className="text-right py-1.5 pl-2 font-normal">变化</th>
            </tr>
          </thead>
          <tbody>
            <StatRow
              label="JD 关键词命中数"
              tooltip={TOOLTIPS.jd_keywords}
              v1={`${ruleV1.jd_keyword_hits.hits}/${ruleV1.jd_keyword_hits.total}`}
              v2={`${ruleV2.jd_keyword_hits.hits}/${ruleV2.jd_keyword_hits.total}`}
              unit="count"
            />
            <StatRow
              label="量化 bullet 占比"
              tooltip={TOOLTIPS.quantified}
              v1={`${Math.round(ruleV1.quantified_bullets.ratio * 100)}%`}
              v2={`${Math.round(ruleV2.quantified_bullets.ratio * 100)}%`}
              unit="ratio"
            />
            <StatRow
              label="强动词占比"
              tooltip={TOOLTIPS.strong_verb}
              v1={`${Math.round(ruleV1.strong_verb_bullets.ratio * 100)}%`}
              v2={`${Math.round(ruleV2.strong_verb_bullets.ratio * 100)}%`}
              unit="ratio"
            />
            <StatRow
              label="平均 bullet 字数"
              tooltip={TOOLTIPS.avg_len}
              v1={String(ruleV1.avg_bullet_len)}
              v2={String(ruleV2.avg_bullet_len)}
              unit="len"
            />
            {llm ? (
              <>
                <StatRow
                  label="STAR 完整度"
                  tooltip={TOOLTIPS.star_complete}
                  v1={`${llm.star_complete_v1.complete}/${llm.star_complete_v1.total}`}
                  v2={`${llm.star_complete_v2.complete}/${llm.star_complete_v2.total}`}
                  unit="count"
                  llm
                />
                <StatRow
                  label="学历/经验硬门槛对齐"
                  tooltip={TOOLTIPS.hard_req}
                  v1={`${llm.hard_req_v1_aligned}/${llm.hard_req_total}`}
                  v2={`${llm.hard_req_v2_aligned}/${llm.hard_req_total}`}
                  unit="count"
                  llm
                />
              </>
            ) : (
              <tr className="border-b border-border">
                <td colSpan={4} className="py-2 text-xs text-ink-muted text-center italic">
                  STAR 完整度 + 硬门槛对齐 — 点上方「🔄 重新评估」算
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* LLM 评估解释 */}
      {llm?.llm_explain && (
        <p className="mt-3 px-3 py-2 rounded bg-card border-l-2 border-esther-blue/40 text-[10px] text-ink-soft leading-relaxed">
          💬 LLM:{llm.llm_explain}
        </p>
      )}
    </Card>
  );
}
