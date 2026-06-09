/**
 * m5 v5 — 方法论选择（净新增代码，不依赖 lib/keyword-match.ts 的 PM 向同义词表, 审核 R2）
 *
 * 规则（spec §1.3）:
 *   type=bq / semi → BQ 方法论（role-agnostic，不做 JD 匹配）
 *   type=tech      → 用各 spec 自带的 matchKeywords 对 JD 打分，命中数最高者胜；
 *                    全 0 → generic-tech 兜底（真实存在）
 *
 * 打分/选择是这里新写的小函数（keyword-match.ts 没有 _score/排序/top-K）。
 */

import type { InterviewType } from "@/lib/interview-types";
import {
  ALL_METHODOLOGIES,
  BQ_METHODOLOGY,
  GENERIC_TECH_METHODOLOGY,
  type MethodologySpec,
} from "./specs";

/** 归一化：转小写 + 去空白（CJK 原样保留），用于子串命中 */
export function normalizeForMatch(text: string): string {
  return (text || "").toLowerCase().replace(/\s+/g, "");
}

/**
 * 给一个 spec 在某 JD 文本上的命中分 = matchKeywords 里出现在 JD 中的关键词个数。
 * 关键词为空（bq / generic-tech）恒为 0。
 */
export function scoreMethodology(spec: MethodologySpec, jdText: string): number {
  if (!spec.matchKeywords.length) return 0;
  const jd = normalizeForMatch(jdText);
  if (!jd) return 0;
  let score = 0;
  for (const kw of spec.matchKeywords) {
    const k = normalizeForMatch(kw);
    if (k && jd.includes(k)) score += 1;
  }
  return score;
}

/**
 * 选方法论。零新增必填输入：bq/semi 直接 BQ；tech 走 JD 打分 + generic-tech 兜底。
 */
export function selectMethodology(
  type: InterviewType,
  jdText: string,
): MethodologySpec {
  if (type === "bq" || type === "semi") {
    return BQ_METHODOLOGY;
  }
  // type === "tech"
  const techSpecs = ALL_METHODOLOGIES.filter(
    (s) => s.appliesToType.includes("tech") && s.matchKeywords.length > 0,
  );
  let best: MethodologySpec | null = null;
  let bestScore = 0;
  for (const spec of techSpecs) {
    const score = scoreMethodology(spec, jdText);
    if (score > bestScore) {
      bestScore = score;
      best = spec;
    }
  }
  return bestScore > 0 && best ? best : GENERIC_TECH_METHODOLOGY;
}
