import { describe, it, expect } from "vitest";
import {
  RIASEC_QUESTIONS,
  RIASEC_QUESTIONS_FULL,
  computeRIASEC,
  computeConfidence,
  getRiasecQuestionsForAnswers,
} from "./quiz-data";

// 用某档 Likert 值把某套题全答一遍
function answerAll(qs: { no: number }[], v: number): Record<number, number> {
  const a: Record<number, number> = {};
  for (const q of qs) a[q.no] = v;
  return a;
}

describe("快速版/完整版 同标度", () => {
  it("完整版每维 10 题、共 60 题", () => {
    expect(RIASEC_QUESTIONS_FULL.length).toBe(60);
    for (const d of ["R", "I", "A", "S", "E", "C"]) {
      expect(RIASEC_QUESTIONS_FULL.filter((q) => q.dim === d).length).toBe(10);
    }
  });

  it("两版全选 5 → 每维都归一到 15;全选 1 → 每维都 3", () => {
    expect(computeRIASEC(answerAll(RIASEC_QUESTIONS, 5))).toEqual([15, 15, 15, 15, 15, 15]);
    expect(computeRIASEC(answerAll(RIASEC_QUESTIONS_FULL, 5))).toEqual([15, 15, 15, 15, 15, 15]);
    expect(computeRIASEC(answerAll(RIASEC_QUESTIONS, 1))).toEqual([3, 3, 3, 3, 3, 3]);
    expect(computeRIASEC(answerAll(RIASEC_QUESTIONS_FULL, 1))).toEqual([3, 3, 3, 3, 3, 3]);
  });

  it("快速版打分与旧版(原始求和)逐字节一致", () => {
    // 旧版 = 每维 3 题原始求和。全选 4 → 12;全选 3 → 9
    expect(computeRIASEC(answerAll(RIASEC_QUESTIONS, 4))).toEqual([12, 12, 12, 12, 12, 12]);
    expect(computeRIASEC(answerAll(RIASEC_QUESTIONS, 3))).toEqual([9, 9, 9, 9, 9, 9]);
  });

  it("answers 含 101-160 → 自动判定为完整版题库", () => {
    const full = answerAll(RIASEC_QUESTIONS_FULL, 3);
    expect(getRiasecQuestionsForAnswers(full)).toBe(RIASEC_QUESTIONS_FULL);
    expect(getRiasecQuestionsForAnswers(answerAll(RIASEC_QUESTIONS, 3))).toBe(RIASEC_QUESTIONS);
  });

  it("置信度:两版全答 + 高分维度 → high;同标度阈值一致", () => {
    expect(computeConfidence(answerAll(RIASEC_QUESTIONS, 5), computeRIASEC(answerAll(RIASEC_QUESTIONS, 5)))).toBe("high");
    expect(computeConfidence(answerAll(RIASEC_QUESTIONS_FULL, 5), computeRIASEC(answerAll(RIASEC_QUESTIONS_FULL, 5)))).toBe("high");
  });
});
