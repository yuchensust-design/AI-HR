"use client";

import type { ReactNode } from "react";
import { DIMENSION_LABELS, type Dimension } from "@/lib/quiz-data";

// 每维一句人话短句，拼"你{A}，{B}，也{C}。"
const DIMENSION_PHRASES: Record<Dimension, string> = {
  R: "喜欢动手做出实物",
  I: "爱钻研、把原理想透",
  A: "有表达欲和审美",
  S: "喜欢和人打交道",
  E: "愿意带头推动事情",
  C: "习惯把流程和数据理清楚",
};

// 两大阵营 — 决定结尾对比句
const PEOPLE_CAMP: Dimension[] = ["S", "A", "E"]; // 和人 · 表达 · 影响
const THING_CAMP: Dimension[] = ["R", "I", "C"];  // 钻研 · 数据 · 动手

function parseTop3(code: string): Dimension[] {
  return code
    .split(" ")
    .slice(0, 3)
    .map((t) => t.charAt(0) as Dimension)
    .filter((d) => d in DIMENSION_LABELS);
}

export function RIASECPersona({
  code,
  refineCount,
}: {
  code: string;
  refineCount?: number;
}) {
  const top3 = parseTop3(code);
  if (top3.length < 3) return null;

  const typeNames = top3.map((d) => DIMENSION_LABELS[d].cn);
  const body = `你${DIMENSION_PHRASES[top3[0]]}，${DIMENSION_PHRASES[top3[1]]}，也${DIMENSION_PHRASES[top3[2]]}。`;

  const peopleN = top3.filter((d) => PEOPLE_CAMP.includes(d)).length;
  const thingN = top3.filter((d) => THING_CAMP.includes(d)).length;

  const PEOPLE = <span className="font-medium text-ink">和人 · 表达 · 影响</span>;
  const THING = <span className="font-medium text-ink">钻研 · 数据 · 动手</span>;

  let contrast: ReactNode;
  if (peopleN === 3) {
    // 三个全在「和人」阵营 → 才能说"都偏…不是…"
    contrast = <>这三股劲儿都偏「{PEOPLE}」，而不是「钻研 · 数据 · 动手」。</>;
  } else if (thingN === 3) {
    contrast = <>这三股劲儿都偏「{THING}」，而不是「和人 · 表达 · 影响」。</>;
  } else if (peopleN > thingN) {
    // 混合(2:1)→ 不能说"都偏",改成"整体更偏…但也有另一面"
    contrast = <>整体更偏「{PEOPLE}」，但也有「{THING}」的一面。</>;
  } else {
    contrast = <>整体更偏「{THING}」，但也有「{PEOPLE}」的一面。</>;
  }

  return (
    <div>
      <p className="font-display italic text-xs text-esther-blue mb-2">This is you</p>
      <h2 className="text-xl md:text-2xl font-bold text-ink mb-3">你大概是这样一个人</h2>
      <p className="text-lg font-bold text-esther-blue mb-4">{typeNames.join(" · ")}</p>
      <p className="text-sm text-ink-soft leading-relaxed mb-2">{body}</p>
      <p className="text-sm text-ink-soft leading-relaxed">{contrast}</p>
      {refineCount && refineCount > 0 ? (
        <p className="text-xs text-ink-muted mt-3 font-display italic">已调整 {refineCount} 次</p>
      ) : null}
    </div>
  );
}
