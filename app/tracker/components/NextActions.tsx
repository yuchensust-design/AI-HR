"use client";

import Link from "next/link";
import { Metrics } from "@/lib/tracker-types";

type Props = { metrics: Metrics; ghostedHigh: boolean };

const BASE_LINKS: { href: string; title: string; desc: string }[] = [
  {
    href: "/m1",
    title: "重新跑求职定位",
    desc: "如果方向之间转化差距大,先回 RIASEC + 经历交叉验证。",
  },
  {
    href: "/m3",
    title: "重做简历 + JD 对齐",
    desc: "回复率低时,优先看简历是否漏了 JD 关键词 — 改完跟原版对比看进步。",
  },
  {
    href: "/m5",
    title: "练一场模拟面试",
    desc: "有面试但 offer 率低时,行为面 + 严厉型 HR 复盘最高效。",
  },
];

export function NextActions({ metrics, ghostedHigh }: Props) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {BASE_LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-xl ring-1 ring-foreground/10 bg-card px-4 py-3 hover:ring-esther-blue/40 transition-colors"
          >
            <div className="font-heading text-base text-ink">{l.title} →</div>
            <p className="text-xs text-ink-soft mt-1 leading-snug">{l.desc}</p>
          </Link>
        ))}
      </div>

      {ghostedHigh && (
        <div className="rounded-xl ring-1 ring-esther-yellow/50 bg-esther-yellow/10 px-4 py-3 text-sm text-ink-soft leading-relaxed">
          <span className="font-medium text-ink">看到你"已挂"挺多的。</span>{" "}
          这阵子真的不轻松 — 投出去石沉大海是最难受的那种状态。
          如果想找个人说说,点页面右下角的不二,聊聊投递、聊聊别的都可以。
          (这不是真人,但她至少不会催你)
        </div>
      )}
    </div>
  );
}
