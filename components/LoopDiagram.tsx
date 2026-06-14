"use client";

import {
  Compass,
  Target,
  NotebookPen,
  FileText,
  Lightbulb,
  Mic,
  Recycle,
  type LucideIcon,
} from "lucide-react";
import {
  ACTS,
  STEP_MODULES,
  type StepModule,
  type StepNo,
} from "@/lib/modules-config";

/** 模块 icon 标识 → lucide 线性图标(全局统一线性风格,替代彩色 emoji) */
export const STEP_ICON: Record<StepModule["icon"], LucideIcon> = {
  compass: Compass,
  target: Target,
  notebook: NotebookPen,
  file: FileText,
  bulb: Lightbulb,
  mic: Mic,
};

/**
 * 三幕 × 一条环 — 首页闭环可视化(桌面端)
 *
 * 视觉编码对应真实产品架构,不是装饰:
 * - 外环(顺时针光点)= 成长旅程:认识自己(知己知彼) → 踏实成长 → 从容求职
 * - 三段彩色弧 = 三幕(2 / 3 / 1 个模块,弧长随模块数自适应)
 * - 中心 hub = 经历素材池(hidden experiences 统一通道)
 * - 黄色轮辐 = 挖经历 / 补项目 / 练面试 的产出流入素材池
 * - 红色轮辐 = 素材池流出 → 简历优化
 *
 * 几何:viewBox 200×200,中心 (100,100)
 * 节点环半径 80,三幕弧半径 94,hub 半径 27
 */

const NODE_R = 80; // 节点环半径(放大外环)
const RING_R = 80; // 基础环 / 旅程光点半径

type Props = {
  activeNo: StepNo;
  onSelect: (no: StepNo) => void;
};

const ACCENT_HEX = {
  blue: "#2B7FD8",
  yellow: "#d9bc3f",
  red: "#E84A5F",
} as const;

/** 节点 i(=no-1)在环上的角度:01 在正上方,顺时针每 60° 一个 */
const nodeDeg = (i: number) => -90 + i * 60;

/** 极坐标 → viewBox 坐标 */
const pt = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [100 + r * Math.cos(a), 100 + r * Math.sin(a)];
};

const f = (n: number) => n.toFixed(2);

/** 三幕弧:首节点角 -25° 到 末节点角 +25°,弧长随幕内模块数自适应 */
const ARC_R = 94;
const ARC_PAD = 25;

function actArcSpanDeg(firstIdx: number, lastIdx: number): number {
  return nodeDeg(lastIdx) - nodeDeg(firstIdx) + 2 * ARC_PAD;
}

function actArcLen(firstIdx: number, lastIdx: number): number {
  return (ARC_R * (actArcSpanDeg(firstIdx, lastIdx) * Math.PI)) / 180;
}

function actArcPath(firstIdx: number, lastIdx: number): string {
  const [x0, y0] = pt(nodeDeg(firstIdx) - ARC_PAD, ARC_R);
  const [x1, y1] = pt(nodeDeg(lastIdx) + ARC_PAD, ARC_R);
  const large = actArcSpanDeg(firstIdx, lastIdx) > 180 ? 1 : 0;
  return `M ${f(x0)} ${f(y0)} A ${ARC_R} ${ARC_R} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
}

/** 轮辐:节点内缘 → hub 边缘(或反向) */
function spoke(deg: number, fromR: number, toR: number) {
  const [x1, y1] = pt(deg, fromR);
  const [x2, y2] = pt(deg, toR);
  return { x1: f(x1), y1: f(y1), x2: f(x2), y2: f(y2) };
}

/** 模块在三幕中的索引顺序即 no 顺序:01..06 → idx 0..5 */
const idxOf = (no: StepNo) => Number(no) - 1;

export function LoopDiagram({ activeNo, onSelect }: Props) {
  const activeAct =
    STEP_MODULES.find((m) => m.no === activeNo)?.act ?? "know";

  // 流入素材池的三源:03 经历挖掘 / 05 项目陪练 / 06 模拟面试
  const inflows: StepNo[] = ["03", "05", "06"];
  // 流出:素材池 → 04 简历优化
  const outflowDeg = nodeDeg(idxOf("04"));

  return (
    <div className="relative w-full max-w-[560px] mx-auto aspect-square select-none">
      {/* ===== SVG 层:环 / 弧 / 轮辐 ===== */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 w-full h-full overflow-visible"
        aria-hidden="true"
      >
        <defs>
          {ACTS.map((a) => (
            <marker
              key={a.id}
              id={`loop-arrow-${a.id}`}
              markerWidth="9"
              markerHeight="9"
              refX="6.5"
              refY="4.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 1 L 6.5 4.5 L 0 8 Z" fill={ACCENT_HEX[a.accent]} />
            </marker>
          ))}
          <marker
            id="loop-arrow-in"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0.8 L 5 3.5 L 0 6.2 Z" fill="#d9bc3f" />
          </marker>
          <marker
            id="loop-arrow-out"
            markerWidth="7"
            markerHeight="7"
            refX="5"
            refY="3.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M 0 0.8 L 5 3.5 L 0 6.2 Z" fill="#E84A5F" />
          </marker>
        </defs>

        {/* 基础环(浅) */}
        <circle
          cx="100"
          cy="100"
          r={RING_R}
          fill="none"
          stroke="#1A1A2E"
          strokeOpacity="0.08"
          strokeWidth="1.2"
        />
        {/* 旅程光点 × 2(相位错开半圈) */}
        <circle
          className="loop-comet"
          cx="100"
          cy="100"
          r={RING_R}
          pathLength={100}
          fill="none"
          stroke="#2B7FD8"
          strokeOpacity="0.75"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="9 91"
        />
        <circle
          className="loop-comet"
          style={{ animationDelay: "-4.5s" }}
          cx="100"
          cy="100"
          r={RING_R}
          pathLength={100}
          fill="none"
          stroke="#2B7FD8"
          strokeOpacity="0.4"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeDasharray="9 91"
        />

        {/* 三幕弧(进场画出 + 当前幕高亮,弧长随模块数自适应) */}
        {ACTS.map((a, i) => {
          const firstIdx = idxOf(a.moduleNos[0]);
          const lastIdx = idxOf(a.moduleNos[a.moduleNos.length - 1]);
          const active = a.id === activeAct;
          return (
            <path
              key={a.id}
              className="loop-arc-draw transition-all duration-500"
              style={
                {
                  "--arc-len": actArcLen(firstIdx, lastIdx),
                  animationDelay: `${i * 0.18}s`,
                } as React.CSSProperties
              }
              d={actArcPath(firstIdx, lastIdx)}
              fill="none"
              stroke={ACCENT_HEX[a.accent]}
              strokeOpacity={active ? 1 : 0.3}
              strokeWidth={active ? 4 : 2.8}
              strokeLinecap="round"
              markerEnd={`url(#loop-arrow-${a.id})`}
            />
          );
        })}

        {/* 素材池辉光 + 本体 */}
        <circle
          className="loop-hub-pulse"
          cx="100"
          cy="100"
          r="33"
          fill="#F4D758"
          opacity="0.16"
        />
        <circle
          className="loop-hub-pulse"
          cx="100"
          cy="100"
          r="27"
          fill="#fffdf5"
          stroke="#F4D758"
          strokeWidth="2.2"
        />

        {/* 流入轮辐:挖经历 / 补项目 / 练面试 → 素材池 */}
        {inflows.map((no) => {
          const deg = nodeDeg(idxOf(no));
          const s = spoke(deg, 61, 31);
          return (
            <line
              key={no}
              className="loop-flow"
              {...s}
              stroke="#d9bc3f"
              strokeOpacity="0.85"
              strokeWidth="1.7"
              strokeDasharray="3 4"
              strokeLinecap="round"
              markerEnd="url(#loop-arrow-in)"
            />
          );
        })}
        {/* 流出轮辐:素材池 → 简历优化 */}
        <line
          className="loop-flow"
          {...spoke(outflowDeg, 31, 61)}
          stroke="#E84A5F"
          strokeOpacity="0.9"
          strokeWidth="2"
          strokeDasharray="3 4"
          strokeLinecap="round"
          markerEnd="url(#loop-arrow-out)"
        />
      </svg>

      {/* ===== HTML 层:模块节点 / 三幕标签 / 素材池文字 ===== */}
      {STEP_MODULES.map((m, i) => {
        const [x, y] = pt(nodeDeg(i), NODE_R);
        const act = ACTS.find((a) => a.id === m.act)!;
        const hex = ACCENT_HEX[act.accent];
        const active = m.no === activeNo;
        const Icon = STEP_ICON[m.icon];
        return (
          <button
            key={m.no}
            type="button"
            onClick={() => onSelect(m.no)}
            aria-label={`查看 STEP ${m.no} ${m.title}`}
            aria-pressed={active}
            className={[
              "absolute -translate-x-1/2 -translate-y-1/2 w-[17.5%] aspect-square rounded-full",
              "flex flex-col items-center justify-center gap-0",
              "border-[3px] bg-card shadow-sm transition-all duration-300",
              "hover:scale-105 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2",
              active ? "scale-110 shadow-lg z-20" : "z-10",
            ].join(" ")}
            style={{
              left: `${(x / 200) * 100}%`,
              top: `${(y / 200) * 100}%`,
              borderColor: hex,
              backgroundColor: active ? hex : undefined,
              boxShadow: active ? `0 0 0 6px ${hex}33` : undefined,
            }}
          >
            <Icon
              className="w-[22px] h-[22px] md:w-6 md:h-6 mb-1"
              strokeWidth={1.75}
              color={active ? "#fff" : hex}
              aria-hidden="true"
            />
            <span
              className={[
                "text-[10px] md:text-[11px] font-semibold leading-tight whitespace-nowrap",
                active ? "text-white" : "text-ink",
              ].join(" ")}
            >
              {m.title}
            </span>
            <span
              className={[
                "font-display italic text-[8px] leading-none mt-0.5",
                active ? "text-white/80" : "text-ink-muted",
              ].join(" ")}
            >
              {m.no}
            </span>
          </button>
        );
      })}

      {/* 三幕标签 chip(弧线中点外侧,位置随弧自适应) */}
      {ACTS.map((act) => {
        const deg =
          (nodeDeg(idxOf(act.moduleNos[0])) +
            nodeDeg(idxOf(act.moduleNos[act.moduleNos.length - 1]))) /
          2;
        const [x, y] = pt(deg, ARC_R + 12);
        const hex = ACCENT_HEX[act.accent];
        const active = act.id === activeAct;
        return (
          <button
            key={act.id}
            type="button"
            onClick={() => onSelect(act.moduleNos[0])}
            className={[
              "absolute -translate-x-1/2 -translate-y-1/2 z-30",
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
              "text-xs font-bold whitespace-nowrap shadow-sm border-2 transition-all duration-300",
              active ? "text-white scale-105" : "bg-card",
            ].join(" ")}
            style={{
              left: `${(x / 200) * 100}%`,
              top: `${(y / 200) * 100}%`,
              borderColor: hex,
              backgroundColor: active ? hex : undefined,
              color: active ? "#fff" : hex,
            }}
          >
            {act.title}
          </button>
        );
      })}

      {/* 素材池文字 */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[25%] text-center pointer-events-none flex flex-col items-center">
        <Recycle
          className="w-5 h-5 mb-1"
          strokeWidth={1.75}
          color="#d9bc3f"
          aria-hidden="true"
        />
        <p className="text-[13px] font-bold text-ink leading-tight">
          经历素材池
        </p>
        <p className="text-[9px] text-ink-soft leading-snug mt-1">
          挖到的 · 补出的 · 练出来的
          <br />
          统一回流到简历
        </p>
      </div>
    </div>
  );
}
