import { describe, it, expect } from "vitest";
import {
  buildTraceRow,
  estimateTokens,
  recordTraceWith,
  type TraceClient,
  type TraceInput,
  type TraceRow,
} from "./trace";

const base: TraceInput = {
  session_id: "m5_abc",
  route: "prep",
  methodology_id: "backend",
  model: "chat",
  input_snapshot: "你好 hello",
  output_snapshot: "结果 result",
  latency_ms: 1234.7,
  ok: true,
};

describe("estimateTokens", () => {
  it("CJK 约 1/字，ASCII 约 1/4", () => {
    expect(estimateTokens("你好")).toBe(2);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("")).toBe(0);
  });
});

describe("buildTraceRow", () => {
  it("token 缺省时用估算兜底", () => {
    const row = buildTraceRow(base);
    expect(row.prompt_tokens).toBeGreaterThan(0);
    expect(row.completion_tokens).toBeGreaterThan(0);
  });
  it("显式 token 优先于估算", () => {
    const row = buildTraceRow({ ...base, prompt_tokens: 999, completion_tokens: 5 });
    expect(row.prompt_tokens).toBe(999);
    expect(row.completion_tokens).toBe(5);
  });
  it("input/output 截断到 ≤ 2000", () => {
    const big = "x".repeat(5000);
    const row = buildTraceRow({ ...base, input_snapshot: big, output_snapshot: big });
    expect(row.input_snapshot.length).toBeLessThanOrEqual(2000);
    expect(row.output_snapshot.length).toBeLessThanOrEqual(2000);
  });
  it("latency 四舍五入且非负；空字段 → null", () => {
    const row = buildTraceRow({ ...base, latency_ms: 1234.7, methodology_id: "" });
    expect(row.latency_ms).toBe(1235);
    expect(row.methodology_id).toBeNull();
    expect(row.err_msg).toBeNull();
  });
});

describe("recordTraceWith 容错（spec §8 fault 测）", () => {
  it("getClient 抛异常 → 不抛、resolve", async () => {
    await expect(
      recordTraceWith(() => {
        throw new Error("boom");
      }, base),
    ).resolves.toBeUndefined();
  });
  it("insert 返回 error → 不抛、resolve", async () => {
    const client: TraceClient = {
      from: () => ({
        insert: async () => ({ error: { message: "table missing" } }),
      }),
    };
    await expect(recordTraceWith(() => client, base)).resolves.toBeUndefined();
  });
  it("insert 成功 → 写入规整后的 row", async () => {
    let captured: TraceRow | null = null;
    const client: TraceClient = {
      from: () => ({
        insert: async (row: TraceRow) => {
          captured = row;
          return { error: null };
        },
      }),
    };
    await recordTraceWith(() => client, base);
    expect(captured).not.toBeNull();
    expect(captured!.route).toBe("prep");
    expect(captured!.session_id).toBe("m5_abc");
  });
});
