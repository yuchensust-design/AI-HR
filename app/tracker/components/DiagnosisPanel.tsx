"use client";

import Link from "next/link";
import { Diagnosis } from "@/lib/tracker-types";
import { formatPct } from "@/lib/tracker-metrics";

type Props = {
  diagnosis: Diagnosis | null;
  loading: boolean;
  error: string | null;
  applicationsCount: number;
  onRun: () => void;
  sampleMode?: boolean;
};

const BOTTLENECK_LABEL: Record<Diagnosis["likelyBottleneck"], string> = {
  direction_mismatch: "方向匹配度差距显著",
  resume_match: "简历与 JD 关键词不对齐",
  application_pace: "投递节奏 / 方向太散",
  interview_expression: "面试表达有瓶颈",
  insufficient_data: "样本不足，暂无结论",
};

const LINK_LABEL: Record<"m1" | "m3" | "m5", string> = {
  m1: "重新跑求职定位 →",
  m3: "去简历优化模块 →",
  m5: "去模拟面试 →",
};
const LINK_PATH: Record<"m1" | "m3" | "m5", string> = {
  m1: "/m1",
  m3: "/m3",
  m5: "/m5",
};

export function DiagnosisPanel({
  diagnosis,
  loading,
  error,
  applicationsCount,
  onRun,
  sampleMode,
}: Props) {
  return (
    <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-5">
      {/* 标题行 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-base text-ink">AI 诊断</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            {sampleMode
              ? "示例演示 — 录入你自己的数据后可运行真实诊断"
              : "基于投递记录找卡点，不是结果预测"}
          </p>
        </div>
        {!sampleMode && (
          <button
            type="button"
            onClick={onRun}
            disabled={loading || applicationsCount === 0}
            className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark disabled:opacity-40 whitespace-nowrap"
          >
            {loading ? "诊断中…" : diagnosis ? "重新诊断" : "运行诊断"}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 text-rose-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!diagnosis && !loading && !error && (
        <p className="text-sm text-ink-muted py-4 text-center">
          积累 5 条以上投递后运行诊断，AI 会告诉你问题最可能出在哪个环节。
        </p>
      )}

      {diagnosis && (
        <div className="space-y-5">
          {/* 卡点 + 置信度 */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-ink text-sm">
              卡点：{BOTTLENECK_LABEL[diagnosis.likelyBottleneck]}
            </span>
            <span className="text-xs text-ink-muted">置信度 {formatPct(diagnosis.confidence)}</span>
            {diagnosis.source === "ai" ? (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-50 ring-1 ring-sky-200 text-sky-700">AI 分析</span>
            ) : (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 ring-1 ring-amber-200 text-amber-700">规则诊断</span>
            )}
          </div>

          {/* 结论 */}
          <p className="text-sm text-ink leading-relaxed">{diagnosis.summary}</p>

          {/* 数据依据 */}
          <div>
            <p className="text-xs font-semibold text-ink-soft mb-2 uppercase tracking-wide">数据依据</p>
            <ul className="space-y-1.5">
              {diagnosis.evidence.map((e, i) => (
                <li key={i} className="flex gap-2 text-xs text-ink-soft leading-snug">
                  <span className="text-esther-blue flex-shrink-0 mt-0.5">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 建议的下一步 */}
          <div>
            <p className="text-xs font-semibold text-ink-soft mb-3 uppercase tracking-wide">建议的下一步</p>
            <ol className="space-y-4">
              {diagnosis.recommendedActions.map((a, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-esther-blue/10 text-esther-blue text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink leading-snug">{a.title}</p>
                    <p className="text-xs text-ink-soft mt-1 leading-snug">{a.detail}</p>
                    {a.link && (
                      <Link
                        href={LINK_PATH[a.link]}
                        className="inline-block mt-1.5 text-xs text-esther-blue hover:text-esther-blue-dark"
                      >
                        {LINK_LABEL[a.link]}
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {diagnosis.caution && (
            <p className="text-[11px] text-ink-muted border-t border-border pt-3 leading-snug">
              {diagnosis.caution}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
