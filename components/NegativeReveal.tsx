"use client";

import { useState } from "react";

/**
 * 反向推荐折叠区
 * - 默认收起 → 用户主动点击展开
 * - 展开后顶部一句"消耗框架"文案(来自 plan §8.16,07 §7.3 产品灵魂级)
 * - 下面 3 个反向方向
 *
 * 设计意图:防止 choice overload,让用户主动选择是否看反向信息
 */

export type NegativeItem = {
  industry: string;
  role_type: string;
  why_consuming: string;
};

export function NegativeReveal({ items }: { items: NegativeItem[] }) {
  const [open, setOpen] = useState(false);

  if (!items || items.length === 0) return null;

  return (
    <section className="border-b border-border">
      <div className="max-w-[1100px] mx-auto px-6 py-10">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-4 p-5 rounded-2xl bg-warm-bg-deep/50 border border-border hover:border-ink-muted/40 transition-colors text-left"
          aria-expanded={open}
        >
          <div>
            <p className="font-display italic text-xs text-ink-muted mb-1">
              Heads-up
            </p>
            <h3 className="text-base font-bold text-ink">
              {open
                ? "▼ 收起 — 这些方向可能消耗你"
                : `▶ 展开看 ${items.length} 个可能消耗你的方向`}
            </h3>
            <p className="text-xs text-ink-soft mt-1">
              不是说你做不了,而是错配的代价
            </p>
          </div>
          <span className="text-2xl text-ink-muted flex-shrink-0">
            {open ? "−" : "+"}
          </span>
        </button>

        {open && (
          <div className="mt-6 space-y-4">
            <div className="p-5 rounded-xl bg-esther-yellow/15 border-l-4 border-esther-yellow">
              <p className="text-sm text-ink leading-relaxed font-medium">
                核心原因不是你做不了,而是这类岗位会消耗你,天花板也不高。
              </p>
            </div>

            {items.map((item, idx) => (
              <div
                key={idx}
                className="p-5 rounded-xl border border-border bg-card"
              >
                <div className="flex items-start gap-4">
                  <span className="font-display italic text-2xl font-bold text-ink-muted/40 leading-none flex-shrink-0">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <div className="flex-1">
                    <p className="text-xs text-ink-muted mb-0.5 font-display italic">
                      {item.industry}
                    </p>
                    <h4 className="text-base font-bold text-ink mb-2">
                      {item.role_type}
                    </h4>
                    <p className="text-sm text-ink-soft leading-relaxed">
                      {item.why_consuming}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
