"use client";

import type { DemoShot } from "@/lib/demo-shots";

/**
 * 带亮点标注的示例输出图:产品截图 + 编号标注点(随三幕配色)+ 下方编号图例。
 * pins 用百分比定位,图片自适应宽度,编号点和图例一一对应。
 */

const ACCENT_HEX = {
  blue: "#2B7FD8",
  yellow: "#d9bc3f",
  red: "#E84A5F",
} as const;

type Accent = "blue" | "yellow" | "red";

type Props = {
  shot: DemoShot;
  accent: Accent;
};

export function AnnotatedShot({ shot, accent }: Props) {
  const hex = ACCENT_HEX[accent];

  return (
    <div className="flex flex-col gap-5">
      {/* 截图(全宽放大) + 标注点 */}
      <div
        className="relative w-full rounded-xl overflow-hidden border border-border shadow-sm bg-card"
        style={{ aspectRatio: String(shot.ratio) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shot.src}
          alt={shot.alt}
          className="absolute inset-0 w-full h-full object-cover object-top"
          loading="lazy"
        />
        {shot.pins.map((p, i) => (
          <span
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full text-white text-[13px] font-bold shadow-md ring-2 ring-white"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: 26,
              height: 26,
              backgroundColor: hex,
            }}
            aria-hidden="true"
          >
            {i + 1}
          </span>
        ))}
      </div>

      {/* 图例(图片下方,横排) */}
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shot.pins.map((p, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white text-[12px] font-bold mt-0.5"
              style={{ backgroundColor: hex }}
            >
              {i + 1}
            </span>
            <p className="leading-relaxed">
              <span className="block text-sm font-bold text-ink">{p.title}</span>
              <span className="block text-[13px] text-ink-muted mt-0.5">{p.sub}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
