/**
 * m5 v5 — 动态追问纯函数helpers（预算 + 客户端廉价预门 + 类型）
 *
 * 路由 prompt 组装在 app/api/m5/follow-up/route.ts；这里只放可单测的纯逻辑，
 * 供客户端(预门/预算)与路由(类型)共用。
 */

import type { InterviewQuestion } from "@/lib/interview-types";

/** follow-up 路由返回：一个追问 或 null（进下一题）+ 决策理由 */
export type FollowUpDecision = {
  follow_up: InterviewQuestion | null;
  reason: string;
};

/**
 * 全场追问预算（spec §3.2）：5→3 / 10→6 / 15→9（≈ 0.6×N）。
 * config.follow_up_budget 缺省时客户端用本函数兜底。
 */
export function computeFollowUpBudget(numQuestions: number): number {
  if (!Number.isFinite(numQuestions) || numQuestions <= 0) return 0;
  return Math.round(numQuestions * 0.6);
}

/** 含数字（阿拉伯数字 / 百分比 / 倍数 / 万）——"答得具体"的信号之一 */
export function hasNumericEvidence(transcript: string): boolean {
  return /\d|%|百分|倍|万|千/.test(transcript || "");
}

export type ClientGateInput = {
  transcript: string;
  filler_count?: number;
  skipped?: boolean;
};

/**
 * 客户端廉价预门（spec §3.2.1）：明显答得好的题直接跳过 follow-up 往返，省延迟/token。
 * 跳过条件（全满足）：口水话少 且 回答够长 且 含数字。
 * 跳过题(skipped)也直接 true（不追问）。纯函数、可单测、可关。
 *
 * 注意（审核风险）：只挡"明显好"的，门槛保守，避免把"流利但空洞"误判为好 →
 * 要求"含数字"作为内容信号之一，降低纯流利度误判。
 */
export function shouldSkipFollowUpClientGate(
  input: ClientGateInput,
  opts: { minLen?: number; maxFiller?: number } = {},
): boolean {
  if (input.skipped) return true;
  const { minLen = 120, maxFiller = 5 } = opts;
  const transcript = (input.transcript || "").trim();
  const fillerLow = (input.filler_count ?? 0) <= maxFiller;
  const longEnough = transcript.length >= minLen;
  const hasNum = hasNumericEvidence(transcript);
  return fillerLow && longEnough && hasNum;
}

/** 预算/边界综合判断：是否应当请求 follow-up（客户端调用前的总闸） */
export function shouldRequestFollowUp(params: {
  followUpsUsed: number;
  budget: number;
  parentIsFollowUp: boolean; // 不对追问再追问（每主题≤1, C5）
  gateInput: ClientGateInput;
}): boolean {
  if (params.followUpsUsed >= params.budget) return false;
  if (params.parentIsFollowUp) return false;
  if (shouldSkipFollowUpClientGate(params.gateInput)) return false;
  return true;
}
