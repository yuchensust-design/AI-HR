"use client";

import { Card } from "@/components/ui/card";

/**
 * M3 优化数据看板（PM 06 §3.4 #1）
 *
 * 4 卡 grid，让 AI-HR 面试官第一眼看见候选人在做"可解释的数据优化系统"：
 *   1. JD 关键词数 — 需求拆解能力
 *   2. 已命中 — 数据判断能力
 *   3. 高优 Gap — 复盘优化能力
 *   4. 采纳建议 — AI 落地能力
 *
 * 不接 LLM，纯展示已有数据。
 */

export type M3DashboardData = {
  jdKeywordsCount: number;
  matchedKeywordsCount: number;
  gapBreakdown: { easy: number; mid: number; hard: number };
  acceptedCount: number;
  totalEditsCount: number;
};

function StatCard({
  label,
  value,
  sub,
  tone,
  caption,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: "blue" | "yellow" | "red" | "green";
  caption: string;
}) {
  const toneStyles: Record<typeof tone, string> = {
    blue: "border-esther-blue/40 bg-esther-blue/5",
    yellow: "border-esther-yellow/50 bg-esther-yellow/10",
    red: "border-esther-red/40 bg-esther-red/5",
    green: "border-emerald-500/40 bg-emerald-500/5",
  };
  const numberStyles: Record<typeof tone, string> = {
    blue: "text-esther-blue",
    yellow: "text-ink",
    red: "text-esther-red",
    green: "text-emerald-600",
  };
  return (
    <Card className={`p-3 border-2 ${toneStyles[tone]}`}>
      <p className="font-display italic text-[10px] text-ink-muted mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular-nums ${numberStyles[tone]}`}>
          {value}
        </span>
        {sub && (
          <span className="text-[11px] text-ink-soft tabular-nums">{sub}</span>
        )}
      </div>
      <p className="text-[10px] text-ink-muted mt-1 leading-snug">{caption}</p>
    </Card>
  );
}

export function M3DataDashboard({ data }: { data: M3DashboardData }) {
  const { jdKeywordsCount, matchedKeywordsCount, gapBreakdown, acceptedCount, totalEditsCount } = data;

  const matchedPct =
    jdKeywordsCount > 0 ? Math.round((matchedKeywordsCount / jdKeywordsCount) * 100) : 0;
  const acceptedPct =
    totalEditsCount > 0 ? Math.round((acceptedCount / totalEditsCount) * 100) : 0;

  const totalGap = gapBreakdown.easy + gapBreakdown.mid + gapBreakdown.hard;
  const gapToneCaption =
    gapBreakdown.hard > 0
      ? `难补 ${gapBreakdown.hard} · 中等 ${gapBreakdown.mid} · 易补 ${gapBreakdown.easy}`
      : gapBreakdown.mid > 0
      ? `中等 ${gapBreakdown.mid} · 易补 ${gapBreakdown.easy}`
      : `易补 ${gapBreakdown.easy}`;

  return (
    <Card className="p-4 border-2 border-esther-blue/30 bg-card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <p className="font-display italic text-xs text-esther-blue mb-0.5">
            Optimization Dashboard
          </p>
          <h3 className="text-sm font-semibold text-ink">
            📊 这次优化在做什么 · 4 个客观指标
          </h3>
        </div>
        <span className="text-[10px] text-ink-muted">
          5 维能力链：需求拆解 → 指标定义 → 数据判断 → AI 落地 → 复盘优化
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard
          label="JD 关键词"
          value={String(jdKeywordsCount)}
          tone="blue"
          caption={jdKeywordsCount > 0 ? "LLM 已识别" : "等 JD 解析"}
        />
        <StatCard
          label="简历已命中"
          value={String(matchedKeywordsCount)}
          sub={jdKeywordsCount > 0 ? `/ ${jdKeywordsCount} · ${matchedPct}%` : undefined}
          tone="yellow"
          caption={
            matchedPct >= 60
              ? "覆盖较好"
              : matchedPct >= 30
              ? "中等覆盖,可补强"
              : "覆盖偏低,看高优 Gap"
          }
        />
        <StatCard
          label="高优 Gap"
          value={String(gapBreakdown.hard + gapBreakdown.mid)}
          sub={totalGap > 0 ? `/ ${totalGap}` : undefined}
          tone={gapBreakdown.hard > 0 ? "red" : gapBreakdown.mid > 0 ? "yellow" : "green"}
          caption={totalGap > 0 ? gapToneCaption : "无明显缺口"}
        />
        <StatCard
          label="采纳建议"
          value={String(acceptedCount)}
          sub={totalEditsCount > 0 ? `/ ${totalEditsCount} · ${acceptedPct}%` : undefined}
          tone="blue"
          caption={
            acceptedCount === 0 && totalEditsCount > 0
              ? "等你逐条确认"
              : `已确认 ${acceptedPct}% 改动`
          }
        />
      </div>
    </Card>
  );
}
