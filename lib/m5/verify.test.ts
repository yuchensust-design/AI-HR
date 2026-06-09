import { describe, it, expect } from "vitest";
import {
  verifyFollowUp,
  similarity,
  isDuplicate,
  normalizeForDup,
  FOLLOW_UP_MAX_LEN,
} from "./verify";

describe("verify.normalizeForDup", () => {
  it("去标点空白 + 小写，CJK 保留", () => {
    expect(normalizeForDup("你，这个 数字 怎么算的？")).toBe("你这个数字怎么算的");
  });
});

describe("verify.similarity", () => {
  it("完全相同 = 1", () => {
    expect(similarity("这个数字怎么算的", "这个数字怎么算的")).toBe(1);
  });
  it("仅标点/空白差异 ≈ 1", () => {
    expect(similarity("这个数字怎么算的?", "这个数字，怎么算的")).toBe(1);
  });
  it("完全不同 ≈ 0", () => {
    expect(similarity("讲讲你的项目", "数据库索引原理")).toBeLessThan(0.3);
  });
});

describe("verify.isDuplicate", () => {
  it("近似重复（单字插入）→ true", () => {
    expect(
      isDuplicate("这个指标是怎么算的", ["这个指标怎么算的"]),
    ).toBe(true);
  });
  it("全新问题 → false", () => {
    expect(
      isDuplicate("你为什么选这个方案", ["讲讲你的项目背景"]),
    ).toBe(false);
  });
});

describe("verify.verifyFollowUp", () => {
  it("正常追问 → ok", () => {
    const r = verifyFollowUp("这个 30% 的提升具体怎么测出来的？", [
      "讲讲你的项目",
    ]);
    expect(r.ok).toBe(true);
  });
  it("空/太短 → empty_or_too_short", () => {
    expect(verifyFollowUp("", []).reason).toBe("empty_or_too_short");
    expect(verifyFollowUp("嗯", []).ok).toBe(false);
  });
  it("超长 → too_long", () => {
    const long = "啊".repeat(FOLLOW_UP_MAX_LEN + 1);
    expect(verifyFollowUp(long, []).reason).toBe("too_long");
  });
  it("与已问重复 → duplicate", () => {
    const r = verifyFollowUp("这个指标是怎么算的", ["这个指标怎么算的"]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("duplicate");
  });
});
