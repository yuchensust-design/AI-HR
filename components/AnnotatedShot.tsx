"use client";

import type { DemoShot } from "@/lib/demo-shots";

/**
 * 带亮点标注的示例输出图:产品截图 + 半透明高亮框(随三幕配色)+ 下方编号图例。
 * boxes 用百分比定位(x/y = 框左上角,w/h = 框宽高),圈住目标区域而非single点 ——
 * 半透明不挡字、框是区域容错率高;编号角标落在框左上角的留白处。
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
      {/* 截图(全宽放大) + 高亮框 */}
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
        {shot.boxes.map((b, i) => (
          <div
            key={i}
            className="absolute rounded-md pointer-events-none"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
              border: `2px solid ${hex}`,
              backgroundColor: `${hex}1f`,
            }}
            aria-hidden="true"
          >
            <span
              className="absolute flex items-center justify-center rounded-full text-white text-[12px] font-bold shadow ring-2 ring-white"
              style={{
                top: -11,
                left: -11,
                width: 24,
                height: 24,
                backgroundColor: hex,
              }}
            >
              {i + 1}
            </span>
          </div>
        ))}
      </div>

      {/* 图例(图片下方,横排) */}
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shot.boxes.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-white text-[12px] font-bold mt-0.5"
              style={{ backgroundColor: hex }}
            >
              {i + 1}
            </span>
            <p className="leading-relaxed">
              <span className="block text-sm font-bold text-ink">{b.title}</span>
              <span className="block text-[13px] text-ink-muted mt-0.5">{b.sub}</span>
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
