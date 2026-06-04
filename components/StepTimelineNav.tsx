"use client";

import type { StepModule } from "@/lib/modules-config";

/**
 * 顶部 5 step 切换条 — 圆形节点 + 横线连接
 * 当前态:esther-blue 实心圆 + 白字
 * 已完成态(序号 < active):圆 + ✓
 * 未到态:灰色描边圆 + 数字
 */

type Props = {
  steps: StepModule[];
  activeStep: string;
  onSelect: (no: string) => void;
};

export function StepTimelineNav({ steps, activeStep, onSelect }: Props) {
  const activeIdx = steps.findIndex((s) => s.no === activeStep);

  return (
    <div className="relative pt-14">
      {/* 反哺闭环 — STEP 05 → STEP 03 黄色虚线回环 */}
      {/* 弧线 + markerEnd 箭头(箭头会自动放在路径终点,并按切线方向旋转,无需单独定位) */}
      <svg
        aria-hidden="true"
        className="hidden md:block absolute pointer-events-none"
        style={{ left: "50%", right: "10%", top: "0px", height: "56px" }}
        viewBox="0 0 500 56"
        preserveAspectRatio="none"
      >
        <defs>
          <marker
            id="loopArrowHead"
            markerWidth="6"
            markerHeight="6"
            refX="5"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M 0 0 L 5 3 L 0 6 Z" fill="#FFD23F" />
          </marker>
        </defs>
        <path
          d="M 500 52 C 500 0, 0 0, 0 52"
          stroke="#FFD23F"
          strokeWidth="2"
          strokeDasharray="6 5"
          strokeLinecap="round"
          fill="none"
          markerEnd="url(#loopArrowHead)"
        />
      </svg>
      {/* 标签(贴在弧线顶部中央,即 container 的 70% 位置,正好压在弧线顶点上) */}
      <div
        aria-hidden="true"
        className="hidden md:block absolute z-30"
        style={{ left: "70%", top: "0px", transform: "translateX(-50%)" }}
      >
        <span className="inline-flex items-center gap-1 bg-esther-yellow text-ink text-xs px-3 py-1 rounded-full font-medium shadow-sm whitespace-nowrap">
          <span className="text-sm leading-none">↺</span>
          模拟面试反哺简历优化
        </span>
      </div>
      {/* 横线 */}
      <div
        className="absolute h-0.5 bg-esther-blue/20"
        style={{ left: "10%", right: "10%", top: "calc(3.5rem + 1.75rem)" }}
        aria-hidden="true"
      />
      {/* 已完成进度的实色横线 */}
      {activeIdx > 0 && (
        <div
          className="absolute h-0.5 bg-esther-blue/70 transition-all duration-500"
          style={{
            top: "calc(3.5rem + 1.75rem)",
            left: "10%",
            width: `${(activeIdx / (steps.length - 1)) * 80}%`,
          }}
          aria-hidden="true"
        />
      )}

      {/* 5 节点(grid 等分) */}
      <div className="grid grid-cols-5 gap-2 relative z-10">
        {steps.map((s, idx) => {
          const done = idx < activeIdx;
          const active = idx === activeIdx;
          return (
            <button
              key={s.no}
              type="button"
              onClick={() => onSelect(s.no)}
              className="group flex flex-col items-center text-center"
              aria-label={`切换到 ${s.title}`}
            >
              <div
                className={[
                  "w-14 h-14 rounded-full flex items-center justify-center shadow-sm transition-all border-[3px]",
                  active
                    ? "bg-esther-blue border-esther-blue text-white scale-110 shadow-md"
                    : done
                      ? "bg-esther-blue/90 border-esther-blue text-white"
                      : "bg-card border-esther-blue/30 text-ink-soft group-hover:border-esther-blue group-hover:text-esther-blue",
                ].join(" ")}
              >
                {done ? (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-6 h-6"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className="font-display italic text-xl font-bold leading-none">
                    {s.no}
                  </span>
                )}
              </div>
              <p
                className={[
                  "mt-3 text-sm md:text-base font-medium leading-snug transition-colors",
                  active
                    ? "text-ink font-semibold"
                    : done
                      ? "text-ink-soft"
                      : "text-ink-muted group-hover:text-esther-blue",
                ].join(" ")}
              >
                {s.title}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
