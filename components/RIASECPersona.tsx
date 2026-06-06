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

  let contrast: ReactNode;
  if (peopleN > thingN) {
    contrast = (
      <>
        这三股劲儿都偏「<span className="font-medium text-ink">和人 · 表达 · 影响</span>」，
        而不是「钻研 · 数据 · 动手」——所以下面的方向也往这边挑。
      </>
    );
  } else if (thingN > peopleN) {
    contrast = (
      <>
        这三股劲儿都偏「<span className="font-medium text-ink">钻研 · 数据 · 动手</span>」，
        而不是「和人 · 表达 · 影响」——所以下面的方向也往这边挑。
      </>
    );
  } else {
    contrast = (
      <>
        你既有「<span className="font-medium text-ink">和人 · 表达 · 影响</span>」的一面，
        也有「<span className="font-medium text-ink">钻研 · 数据 · 动手</span>」的一面——下面的方向会兼顾两边。
      </>
    );
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
