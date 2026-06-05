"use client";

import { Card } from "@/components/ui/card";

/**
 * JD 关键词条 — 把"对应关键词"可视化（PM 06 §3.4 #3 一部分）
 *
 * 把 jd_keywords 全部 chip 化展示：
 *   - 已命中 = 蓝底白字
 *   - 未命中 = 灰底深字 + 虚线边
 *   - hover/focus 高亮:让 EditCard 点击 linked_jd_keyword 时锚定到这里
 */

export function JDKeywordsBar({
  keywords,
  matched,
  highlighted,
}: {
  keywords: string[];
  matched: string[];
  highlighted: string | null;
}) {
  if (!keywords || keywords.length === 0) return null;
  const matchedSet = new Set(matched);

  return (
    <Card className="p-3.5 border-2 border-border bg-warm-bg-deep/20">
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <p className="font-display italic text-[11px] text-esther-blue">
          JD Keywords · {matched.length}/{keywords.length} 命中
        </p>
        <p className="text-[10px] text-ink-muted">
          💡 点击 suggestion 卡里的关键词 chip 会在此高亮对应词
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.map((kw) => {
          const isMatched = matchedSet.has(kw);
          const isHighlighted = highlighted === kw;
          return (
            <span
              key={kw}
              data-keyword={kw}
              className={[
                "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] transition-all",
                isMatched
                  ? "bg-esther-blue text-white font-medium"
                  : "bg-card text-ink-soft border border-dashed border-border",
                isHighlighted
                  ? "ring-2 ring-esther-yellow ring-offset-1 scale-105"
                  : "",
              ].join(" ")}
            >
              {kw}
            </span>
          );
        })}
      </div>
    </Card>
  );
}
