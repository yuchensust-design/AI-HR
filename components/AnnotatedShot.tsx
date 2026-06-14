"use client";

import type { DemoShot } from "@/lib/demo-shots";

/**
 * 带亮点标注的示例输出图:产品截图 + 侧栏编号 + 细引线指向目标点 + 下方编号图例。
 * pins 用百分比定位(x/y = 目标点,落在要指的元素上)。
 * 渲染:编号统一放在最近一侧的边栏(不挡内容),一条细线连到目标小圆点;
 * 同侧编号按目标 y 排序并自动错开,避免叠在一起。
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

const RAIL_L = 2.5; // 左边栏编号 x%
const RAIL_R = 97.5; // 右边栏编号 x%
const MIN_GAP = 4.2; // 同侧编号最小 y 间距 %

export function AnnotatedShot({ shot, accent }: Props) {
  const hex = ACCENT_HEX[accent];

  // 计算每个编号的边栏位置(就近一侧)+ 同侧错开
  const marks = shot.pins.map((p, i) => ({
    i,
    tx: p.x,
    ty: p.y,
    side: p.x <= 50 ? "L" : ("R" as "L" | "R"),
    badgeY: p.y,
  }));
  (["L", "R"] as const).forEach((side) => {
    let last = -Infinity;
    marks
      .filter((m) => m.side === side)
      .sort((a, b) => a.ty - b.ty)
      .forEach((m) => {
        m.badgeY = Math.max(m.ty, last + MIN_GAP);
        last = m.badgeY;
      });
  });

  return (
    <div className="flex flex-col gap-5">
      {/* 截图 + 引线 + 编号 */}
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

        {/* 引线(SVG,非等比拉伸但端点精确) */}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {marks.map((m) => {
            const railX = m.side === "L" ? RAIL_L : RAIL_R;
            return (
              <line
                key={m.i}
                x1={railX}
                y1={m.badgeY}
                x2={m.tx}
                y2={m.ty}
                stroke={hex}
                strokeWidth={1.5}
                strokeOpacity={0.65}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>

        {/* 目标小圆点 */}
        {marks.map((m) => (
          <span
            key={`d${m.i}`}
            className="absolute rounded-full pointer-events-none"
            style={{
              left: `${m.tx}%`,
              top: `${m.ty}%`,
              width: 8,
              height: 8,
              backgroundColor: hex,
              transform: "translate(-50%,-50%)",
              boxShadow: "0 0 0 2px rgba(255,255,255,0.85)",
            }}
            aria-hidden="true"
          />
        ))}

        {/* 编号(边栏) */}
        {marks.map((m) => (
          <span
            key={`b${m.i}`}
            className="absolute flex items-center justify-center rounded-full text-white text-[12px] font-bold pointer-events-none"
            style={{
              left: `${m.side === "L" ? RAIL_L : RAIL_R}%`,
              top: `${m.badgeY}%`,
              width: 22,
              height: 22,
              backgroundColor: hex,
              transform: "translate(-50%,-50%)",
              boxShadow: "0 0 0 1.5px rgba(255,255,255,0.85)",
            }}
            aria-hidden="true"
          >
            {m.i + 1}
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
