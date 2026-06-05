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
};

const BOTTLENECK_LABEL: Record<Diagnosis["likelyBottleneck"], string> = {
  direction_mismatch: "方向不匹配",
  resume_match: "简历与 JD 关键词不对齐",
  application_pace: "投递节奏 / 方向太散",
  interview_expression: "面试表达",
  insufficient_data: "样本不足",
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
}: Props) {
  return (
    <div className="rounded-2xl ring-1 ring-foreground/10 bg-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg text-ink">AI 诊断</h3>
          <p className="text-xs text-ink-muted mt-1 leading-snug max-w-md">
            基于你录入的投递记录做卡点判断 — 不是求职结果预测,只回答"问题大概率出在哪个环节"。
            示例数据会显式标记(参见上方),不影响真实指标。诊断结果有不确定性,你可以拒绝或修改建议。
          </p>
        </div>
        <button
          type="button"
          onClick={onRun}
          disabled={loading || applicationsCount === 0}
          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark disabled:opacity-40 whitespace-nowrap"
        >
          {loading
            ? "诊断中…"
            : diagnosis
              ? "重新诊断"
              : "运行诊断"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 text-rose-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {!diagnosis && !loading && !error && (
        <div className="rounded-lg bg-warm-bg/60 px-4 py-6 text-sm text-ink-muted">
          点上方按钮跑一次诊断;样本不足时会自动落到本地规则版结论。
        </div>
      )}

      {diagnosis && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center text-xs">
            <span
              className={`rounded-full px-2 py-0.5 ring-1 ${
                diagnosis.source === "ai"
                  ? "bg-sky-50 ring-sky-300 text-sky-800"
                  : "bg-amber-50 ring-amber-300 text-amber-800"
              }`}
            >
              {diagnosis.source === "ai" ? "AI 诊断" : "本地规则诊断(AI 不可用)"}
            </span>
            <span className="rounded-full px-2 py-0.5 ring-1 ring-foreground/15 bg-warm-bg/60 text-ink-soft">
              卡点:{BOTTLENECK_LABEL[diagnosis.likelyBottleneck]}
            </span>
            <span className="rounded-full px-2 py-0.5 ring-1 ring-foreground/15 bg-warm-bg/60 text-ink-soft">
              置信度 {formatPct(diagnosis.confidence)}
            </span>
            {diagnosis.containsSample && (
              <span className="rounded-full px-2 py-0.5 ring-1 ring-amber-300 bg-amber-50 text-amber-800">
                数据含示例
              </span>
            )}
          </div>

          <p className="text-sm text-ink leading-relaxed">{diagnosis.summary}</p>

          <div>
            <div className="text-xs font-semibold text-ink-soft mb-2">
              依据(每条都引用了具体指标)
            </div>
            <ul className="space-y-1.5">
              {diagnosis.evidence.map((e, i) => (
                <li
                  key={i}
                  className="text-sm text-ink-soft leading-snug flex gap-2"
                >
                  <span className="text-esther-blue mt-1">•</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold text-ink-soft mb-2">
              建议的下一步
            </div>
            <div className="space-y-2">
              {diagnosis.recommendedActions.map((a, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border bg-warm-bg/40 px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink font-medium">
                      {a.title}
                    </span>
                    <span className="text-[10px] text-ink-muted whitespace-nowrap">
                      来源:
                      {a.basedOn === "metrics"
                        ? "本页指标"
                        : a.basedOn === "sample"
                          ? "示例数据"
                          : "用户输入"}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft mt-1 leading-snug">
                    {a.detail}
                  </p>
                  {a.link && (
                    <Link
                      href={LINK_PATH[a.link]}
                      className="inline-block mt-2 text-xs text-esther-blue hover:text-esther-blue-dark"
                    >
                      {LINK_LABEL[a.link]}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-ink-muted leading-snug border-t pt-3">
            {diagnosis.caution}
          </p>
        </div>
      )}
    </div>
  );
}
