"use client";

import { useState } from "react";
import { ACTS, STEP_MODULES, type Act, type StepNo } from "@/lib/modules-config";
import { Quote, ChevronLeft, ChevronRight } from "lucide-react";
import { LoopDiagram, STEP_ICON } from "@/components/LoopDiagram";
import { StepDetailCard } from "@/components/StepDetailCard";

/**
 * 「六个模块 · 一条闭环」整段 section(2026-06-12 三幕重构)
 * 左:环形闭环图(三幕弧 + 旅程光点 + 素材池轮辐)
 * 右:三幕卡片(特性 → 痛点 → 模块入口)
 * 下:当前模块详情大卡片 + 设计思考说明
 */

const ACT_UI = {
  blue: {
    text: "text-esther-blue",
    activeBorder: "border-esther-blue/70",
    chipBg: "bg-esther-blue/10",
    pillActive: "bg-esther-blue border-esther-blue text-white",
    pillIdle: "bg-card border-esther-blue/30 text-ink hover:border-esther-blue",
  },
  yellow: {
    text: "text-esther-yellow-dark",
    activeBorder: "border-esther-yellow-dark/70",
    chipBg: "bg-esther-yellow/25",
    pillActive: "bg-esther-yellow-dark border-esther-yellow-dark text-white",
    pillIdle:
      "bg-card border-esther-yellow-dark/30 text-ink hover:border-esther-yellow-dark",
  },
  red: {
    text: "text-esther-red",
    activeBorder: "border-esther-red/70",
    chipBg: "bg-esther-red/10",
    pillActive: "bg-esther-red border-esther-red text-white",
    pillIdle: "bg-card border-esther-red/30 text-ink hover:border-esther-red",
  },
} as const;

/** 设计思考 — 给评委/同学讲清这套结构是怎么想出来的 */
function ActCard({
  act,
  activeAct,
  activeNo,
  onSelect,
}: {
  act: Act;
  activeAct: string;
  activeNo: StepNo;
  onSelect: (no: StepNo) => void;
}) {
  const ui = ACT_UI[act.accent];
  const isActive = act.id === activeAct;
  return (
    <div
      onClick={() => onSelect(act.moduleNos[0])}
      className={[
        "rounded-2xl border-2 bg-card p-5 cursor-pointer transition-all duration-300",
        isActive
          ? `${ui.activeBorder} shadow-md`
          : "border-border hover:shadow-sm",
      ].join(" ")}
    >
      <div className="flex items-baseline gap-2.5 flex-wrap mb-2">
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ui.chipBg} ${ui.text}`}
        >
          {act.label}
        </span>
        <h3 className={`text-lg font-bold ${isActive ? ui.text : "text-ink"}`}>
          {act.title}
        </h3>
        <span className="font-display italic text-xs text-ink-muted">
          {act.en}
        </span>
      </div>
      {/* 用户心声(问题):灰色斜体引语,不直说「痛点」,靠引号+图标传达 */}
      <div className="flex gap-2 mb-2.5">
        <Quote
          className={`w-4 h-4 mt-0.5 shrink-0 opacity-55 ${ui.text}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <p className="text-xs text-ink-soft italic leading-relaxed">
          {act.voice}
        </p>
      </div>
      {/* 主张(答案) */}
      <p
        className={`text-[15px] font-bold leading-relaxed mb-3 ${isActive ? ui.text : "text-ink"}`}
      >
        {act.tagline}
      </p>
      <div className="flex flex-wrap gap-2">
        {act.moduleNos.map((no) => {
          const m = STEP_MODULES.find((s) => s.no === no)!;
          const pillActive = no === activeNo;
          const Icon = STEP_ICON[m.icon];
          return (
            <button
              key={no}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(no);
              }}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5",
                "text-xs font-medium transition-all",
                pillActive ? ui.pillActive : ui.pillIdle,
              ].join(" ")}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
              <span className="font-display italic">{m.no}</span>
              <span>{m.title}</span>
            </button>
          );
        })}
      </div>
      {act.companion && (
        <p className="text-xs text-ink-soft leading-relaxed mt-3 pl-3 border-l-2 border-esther-yellow">
          {act.companion}
        </p>
      )}
    </div>
  );
}

export function StepsSection() {
  const [active, setActive] = useState<StepNo>("01");
  const idx = STEP_MODULES.findIndex((s) => s.no === active);
  const step = STEP_MODULES[idx] ?? STEP_MODULES[0];
  const prev = STEP_MODULES[(idx - 1 + STEP_MODULES.length) % STEP_MODULES.length];
  const next = STEP_MODULES[(idx + 1) % STEP_MODULES.length];

  return (
    <section id="modules" className="bg-warm-bg-deep border-t border-border">
      <div className="max-w-[1300px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="font-display italic text-sm text-esther-blue mb-2">
            6 modules · 3 traits · one loop
          </p>
          <h2 className="text-3xl md:text-4xl font-bold text-ink mb-3">
            六个模块,一条闭环 — 认识自己 · 踏实成长 · 从容求职
          </h2>
          <p className="text-ink-soft max-w-3xl">
            求职不是一锤子买卖,而是一个成长循环:
            <span className="text-esther-blue font-medium">知己知彼 → 补上差距 → 临场不慌</span>
            。挖到的经历、补出的项目、练出的亮点都汇入素材池,回流简历。
          </p>
        </div>

        {/* 环形闭环图 + 三幕卡片 */}
        <div className="grid grid-cols-1 lg:grid-cols-[9fr_11fr] gap-8 lg:gap-10 items-center mb-12">
          <div className="hidden md:block">
            <LoopDiagram activeNo={active} onSelect={setActive} />
            <p className="text-center text-xs text-ink-muted mt-12">
              点节点看详情
            </p>
          </div>
          <div className="space-y-4">
            {ACTS.map((act) => (
              <ActCard
                key={act.id}
                act={act}
                activeAct={step.act}
                activeNo={active}
                onSelect={setActive}
              />
            ))}
          </div>
        </div>

        {/* 当前模块详情 + 左右翻页 */}
        <div className="relative">
          <NavArrow
            dir="prev"
            label={`${prev.no} ${prev.title}`}
            onClick={() => setActive(prev.no)}
          />
          <StepDetailCard
            step={step}
            onSelectStep={(no) => setActive(no as StepNo)}
          />
          <NavArrow
            dir="next"
            label={`${next.no} ${next.title}`}
            onClick={() => setActive(next.no)}
          />
        </div>

        {/* 移动端翻页(屏幕窄,侧边箭头改成底部一排) */}
        <div className="flex lg:hidden items-center justify-between mt-4">
          <button
            type="button"
            onClick={() => setActive(prev.no)}
            className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3.5 py-2 text-sm text-ink hover:border-ink-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            <span className="font-medium">{prev.no} {prev.title}</span>
          </button>
          <button
            type="button"
            onClick={() => setActive(next.no)}
            className="inline-flex items-center gap-1.5 rounded-full bg-card border border-border px-3.5 py-2 text-sm text-ink hover:border-ink-muted transition-colors"
          >
            <span className="font-medium">{next.no} {next.title}</span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

/** 桌面端浮在详情卡左右的圆形翻页按钮 */
function NavArrow({
  dir,
  label,
  onClick,
}: {
  dir: "prev" | "next";
  label: string;
  onClick: () => void;
}) {
  const isPrev = dir === "prev";
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${isPrev ? "上一个" : "下一个"}:${label}`}
      aria-label={`${isPrev ? "上一个" : "下一个"}模块:${label}`}
      className={[
        "hidden lg:flex items-center justify-center absolute top-1/2 -translate-y-1/2 z-10",
        "h-12 w-12 rounded-full bg-card border-2 border-border shadow-md",
        "text-ink hover:text-esther-blue hover:border-esther-blue hover:shadow-lg",
        "transition-all duration-200",
        isPrev ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2",
      ].join(" ")}
    >
      {isPrev ? (
        <ChevronLeft className="w-6 h-6" aria-hidden="true" />
      ) : (
        <ChevronRight className="w-6 h-6" aria-hidden="true" />
      )}
    </button>
  );
}
