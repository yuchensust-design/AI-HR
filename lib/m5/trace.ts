/**
 * m5 v5-O1 — LLM 调用可观测性 trace
 *
 * 每次 m5 LLM 调用后写一条结构化 trace 到 Supabase 表 m5_llm_traces，
 * 用于线上复盘"哪个方法论/什么输入/多少 token/多慢/有没有报错"+ 评分 eval 校准前置。
 *
 * 纪律（spec §4b）：
 *   - fire-and-forget：写失败只 console.warn，**绝不抛、绝不阻塞主流程**。
 *   - 隐私：input/output 截断 + company-scrub（不堆原文）。
 *   - 表不存在 / SECRET_KEY 缺失也不报错（trace 是可选副产物）。
 *
 * 设计：纯函数 buildTraceRow（可单测）+ recordTraceWith（依赖注入, 可单测容错）
 *      + recordTrace（动态 import supabase，避免单测加载 next/headers）。
 */

import { scrubCompanyNames } from "@/lib/scrub-company";

export type TraceRoute = "prep" | "follow-up" | "capability" | "debrief";

export type TraceInput = {
  session_id?: string;
  route: TraceRoute;
  methodology_id?: string;
  model: "chat" | "reasoner";
  input_snapshot: string;
  output_snapshot: string;
  /** 实测 token（如有）；缺省时用 input/output 估算 */
  prompt_tokens?: number;
  completion_tokens?: number;
  latency_ms: number;
  ok: boolean;
  err_msg?: string;
};

export type TraceRow = {
  session_id: string | null;
  route: TraceRoute;
  methodology_id: string | null;
  model: string;
  input_snapshot: string;
  output_snapshot: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  ok: boolean;
  err_msg: string | null;
};

const SNAPSHOT_MAX = 2000;

/** 粗略 token 估算：CJK 按 1/char，其余按 1/4 char（无依赖、确定性，仅供成本趋势） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    if (/[一-鿿぀-ヿ]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other / 4);
}

function truncScrub(text: string): string {
  const t = (text || "").slice(0, SNAPSHOT_MAX);
  return scrubCompanyNames(t);
}

/** 纯函数：把 TraceInput 规整成可入库的 row（截断 + scrub + token 估算兜底） */
export function buildTraceRow(input: TraceInput): TraceRow {
  return {
    session_id: input.session_id || null,
    route: input.route,
    methodology_id: input.methodology_id || null,
    model: input.model,
    input_snapshot: truncScrub(input.input_snapshot),
    output_snapshot: truncScrub(input.output_snapshot),
    prompt_tokens: input.prompt_tokens ?? estimateTokens(input.input_snapshot),
    completion_tokens:
      input.completion_tokens ?? estimateTokens(input.output_snapshot),
    latency_ms: Math.max(0, Math.round(input.latency_ms)),
    ok: input.ok,
    err_msg: input.err_msg ? input.err_msg.slice(0, 500) : null,
  };
}

/** 最小客户端契约（便于单测注入 throwing/erroring 假 client） */
export type TraceClient = {
  from: (table: string) => {
    insert: (row: TraceRow) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * 依赖注入版：写失败/报错都吞掉，永不抛（可单测容错）。
 */
export async function recordTraceWith(
  getClient: () => TraceClient,
  input: TraceInput,
): Promise<void> {
  try {
    const row = buildTraceRow(input);
    const client = getClient();
    const { error } = await client.from("m5_llm_traces").insert(row);
    if (error) {
      console.warn("[m5/trace] insert error (ignored):", error.message);
    }
  } catch (e) {
    console.warn("[m5/trace] failed (ignored):", e);
  }
}

/**
 * 生产入口：fire-and-forget。动态 import supabase（避免单测加载 next/headers）。
 * 路由用 `import { after } from "next/server"; after(() => recordTrace(...))` 调用，
 * 不阻塞主返回。
 */
export async function recordTrace(input: TraceInput): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    await recordTraceWith(() => createAdminClient() as unknown as TraceClient, input);
  } catch (e) {
    console.warn("[m5/trace] client init failed (ignored):", e);
  }
}
