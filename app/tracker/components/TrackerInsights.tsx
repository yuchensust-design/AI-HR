"use client";

/**
 * §8.28 Wave 3 — 投递复盘 Insights
 *
 * 输入:Application[](含 rounds[])
 * 输出:按 fail_reason 聚合的失败模式 + 1 句行动建议
 *
 * 规则,纯前端:
 *   1. 扫所有 rounds.outcome=failed 的轮次,按 failReason 计数
 *   2. Top 2 原因展示 → 建议对应模块(技术 → m4 项目;表达 → m5 练面试;JD 不匹配 → m3 改简历)
 *   3. 样本 < 3 → 提示"再积累几条 Insights 才有意义",不给建议
 */

import Link from "next/link";
import {
  Application,
  FAIL_REASON_LABELS,
  FailReason,
} from "@/lib/tracker-types";

type Props = {
  applications: Application[];
};

const REASON_TO_ACTION: Record<
  FailReason,
  { module: string; href: string; cta: string }
> = {
  tech_depth: { module: "项目设计", href: "/m4", cta: "去补一个能写进简历的项目" },
  project_detail: { module: "经历挖掘", href: "/m2", cta: "把这个项目讲透,准备追问" },
  jd_mismatch: { module: "简历整理", href: "/m3", cta: "对 JD 重排简历 / 改 bullet" },
  expression: { module: "模拟面试", href: "/m5", cta: "练一场,看表达节奏" },
  personality_fit: { module: "兴趣岗位发现", href: "/m1", cta: "看看方向是不是真适合你" },
  no_response: { module: "简历整理", href: "/m3", cta: "改简历能过初筛的版本" },
  other: { module: "投递追踪", href: "/tracker", cta: "在备注里写细一点,下次更准" },
};

type ReasonAgg = {
  reason: FailReason;
  count: number;
};

export function TrackerInsights({ applications }: Props) {
  // 1. 聚合所有 fail 原因
  const counts = new Map<FailReason, number>();
  for (const app of applications) {
    if (!app.rounds) continue;
    for (const r of app.rounds) {
      if (r.outcome !== "failed" || !r.failReason) continue;
      counts.set(r.failReason, (counts.get(r.failReason) ?? 0) + 1);
    }
  }

  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const ranked: ReasonAgg[] = Array.from(counts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // 样本不够 → 不给建议
  if (total === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-border bg-warm-bg/30 p-5 text-center">
        <p className="text-sm text-ink-soft">
          📊 还没记录任何挂掉的轮次 — 复盘 Insights 会在这里聚合
        </p>
        <p className="text-xs text-ink-muted mt-2">
          编辑某条投递记录,加几轮"挂了 + 原因",规律就显现了
        </p>
      </div>
    );
  }

  if (total < 3) {
    return (
      <div className="rounded-2xl border border-border bg-warm-bg/40 p-5">
        <p className="text-sm text-ink mb-2">
          📊 已记录 <span className="font-medium">{total}</span> 次失败 — 再多 3-5 条会更准
        </p>
        <ul className="text-xs text-ink-soft space-y-1">
          {ranked.map((r) => (
            <li key={r.reason}>
              · {FAIL_REASON_LABELS[r.reason]} × {r.count}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const top1 = ranked[0];
  const top2 = ranked[1] ?? null;
  const top1Pct = Math.round((top1.count / total) * 100);

  return (
    <div className="rounded-2xl bg-card border-2 border-esther-yellow/40 p-5">
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-ink">
          📊 复盘 Insights · 基于 {total} 次失败
        </h3>
        <span className="text-[11px] text-ink-muted font-display italic">
          Pattern recognition
        </span>
      </div>

      {/* Top 1 大字 */}
      <div className="mb-4 rounded-xl bg-esther-yellow/15 p-4 border border-esther-yellow/30">
        <p className="text-[11px] text-ink-muted mb-1 uppercase tracking-wide font-display italic">
          Top 1 卡点
        </p>
        <p className="text-lg font-semibold text-ink mb-1">
          {FAIL_REASON_LABELS[top1.reason]}
        </p>
        <p className="text-xs text-ink-soft">
          占你失败原因的 {top1Pct}%({top1.count} / {total}) → 这是优先要改的
        </p>
        <Link
          href={REASON_TO_ACTION[top1.reason].href}
          className="mt-3 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-xs font-medium hover:bg-esther-blue-dark transition-colors"
        >
          → {REASON_TO_ACTION[top1.reason].cta}
        </Link>
      </div>

      {/* 其它原因(列表) */}
      {ranked.length > 1 && (
        <div>
          <p className="text-xs text-ink-soft mb-2">其它出现过的卡点:</p>
          <ul className="space-y-2">
            {ranked.slice(1).map((r) => {
              const pct = Math.round((r.count / total) * 100);
              const action = REASON_TO_ACTION[r.reason];
              return (
                <li
                  key={r.reason}
                  className="flex items-center justify-between gap-3 text-xs"
                >
                  <span className="text-ink">
                    {FAIL_REASON_LABELS[r.reason]}{" "}
                    <span className="text-ink-muted">({r.count} 次 · {pct}%)</span>
                  </span>
                  {top2 && r === top2 && (
                    <Link
                      href={action.href}
                      className="text-esther-blue hover:underline whitespace-nowrap"
                    >
                      {action.cta} →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
