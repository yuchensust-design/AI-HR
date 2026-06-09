/**
 * m5 v5 — live 页状态机的纯函数核（spec §5）
 *
 * 把"答完→thinking 挂起→follow-up 决议→推进/插入"的推进决策、B1 幂等守卫、
 * G2 在途去重、v5-R1 rehydrate 序列化抽成**纯函数**，让最高风险的非纯组件逻辑可单测。
 *
 * live/page.tsx 的 reducer 接线（语音/TTS/ASR）按 PROGRESS 配方手动集成 + 手测，
 * 这里保证其依赖的决策逻辑本身正确。
 */

import type { InterviewQuestion, TurnAnswer, TurnEvaluation } from "@/lib/interview-types";

export type LiveStatus =
  | "asking"
  | "listening"
  | "thinking"
  | "paused"
  | "finished";

/** 推进决策关心的最小状态切片 */
export type AdvanceState = {
  status: LiveStatus;
  currentIdx: number;
  questions: InterviewQuestion[];
  followUpsUsed: number;
};

/** 答完一题 → 进 thinking（不推进 index），等 follow-up 决议。 */
export function enterThinking(s: AdvanceState): AdvanceState {
  return { ...s, status: "thinking" };
}

/** 推进到下一题；越界 → finished。 */
export function advanceToNext(s: AdvanceState): AdvanceState {
  const nextIdx = s.currentIdx + 1;
  if (nextIdx >= s.questions.length) {
    return { ...s, status: "finished" };
  }
  return { ...s, currentIdx: nextIdx, status: "asking" };
}

/**
 * B1 幂等守卫：follow-up 决议是否应被丢弃（no-op）。
 * - 不在 thinking 态（用户已 PAUSE/FINISH/退出，或已推进）→ 丢弃，避免吹掉暂停/结束后又推进。
 * - 决议针对的题目 ≠ 当前母题（迟到的过期响应）→ 丢弃。
 */
export function isStaleResolve(
  s: AdvanceState,
  forQuestionId: string,
): boolean {
  if (s.status !== "thinking") return true;
  const cur = s.questions[s.currentIdx];
  if (!cur || cur.id !== forQuestionId) return true;
  return false;
}

/**
 * follow-up 决议落地（纯函数）：
 * - 过期/无效 → 原样返回（B1 no-op）
 * - 有追问 → insert 到母题之后(currentIdx+1)、推进到它、followUpsUsed+1（F3 不追加队尾）
 * - 无追问 → 推进到下一题（越界 finished）
 */
export function resolveFollowUp(
  s: AdvanceState,
  forQuestionId: string,
  followUp: InterviewQuestion | null,
): AdvanceState {
  if (isStaleResolve(s, forQuestionId)) return s;
  if (followUp) {
    const inserted: InterviewQuestion = {
      ...followUp,
      source: "follow_up",
      parent_id: forQuestionId,
    };
    const questions = [
      ...s.questions.slice(0, s.currentIdx + 1),
      inserted,
      ...s.questions.slice(s.currentIdx + 1),
    ];
    return {
      ...s,
      questions,
      currentIdx: s.currentIdx + 1,
      followUpsUsed: s.followUpsUsed + 1,
      status: "asking",
    };
  }
  return advanceToNext(s);
}

/**
 * G2 在途去重：是否应发起该题的 evaluate-turn。
 * 现有 reducer 只在 turnEvaluations(返回后) 去重，挡不住"在途"重复（follow-up insert
 * 改 questions 会重跑 effect）。加 in-flight 集合即可挡住在途窗口。
 */
export function shouldStartEvaluate(
  questionId: string,
  evaluatedIds: ReadonlySet<string>,
  inflightIds: ReadonlySet<string>,
): boolean {
  return !evaluatedIds.has(questionId) && !inflightIds.has(questionId);
}

/* ============================================================
 * v5-R1：rehydrate 序列化（中途刷新恢复）
 * ============================================================ */

/** 可持久化、可恢复的 live 进度快照（语音瞬时态不存，恢复到"准备答第 N 题"） */
export type PersistedLiveState = {
  v: 1;
  sessionId: string;
  currentIdx: number;
  followUpsUsed: number;
  questions: InterviewQuestion[];
  answers: TurnAnswer[];
  turnEvaluations: TurnEvaluation[];
  /** 本场方法论 id（恢复后 follow-up 仍带方法论）；旧快照可空 */
  methodologyId?: string;
};

export type SerializableLiveState = Omit<PersistedLiveState, "v">;

/** 纯函数：state → JSON 字符串（带版本号，便于将来兼容） */
export function serializeLiveState(state: SerializableLiveState): string {
  const persisted: PersistedLiveState = { v: 1, ...state };
  return JSON.stringify(persisted);
}

/** 纯函数：JSON 字符串 → PersistedLiveState（无效/旧版本/解析失败 → null） */
export function deserializeLiveState(raw: string): PersistedLiveState | null {
  try {
    const o = JSON.parse(raw) as Partial<PersistedLiveState>;
    if (!o || o.v !== 1) return null;
    if (typeof o.sessionId !== "string") return null;
    if (!Array.isArray(o.questions) || o.questions.length === 0) return null;
    if (!Array.isArray(o.answers) || !Array.isArray(o.turnEvaluations)) return null;
    if (typeof o.currentIdx !== "number") return null;
    return {
      v: 1,
      sessionId: o.sessionId,
      currentIdx: o.currentIdx,
      followUpsUsed: typeof o.followUpsUsed === "number" ? o.followUpsUsed : 0,
      questions: o.questions,
      answers: o.answers,
      turnEvaluations: o.turnEvaluations,
      methodologyId: typeof o.methodologyId === "string" ? o.methodologyId : "",
    };
  } catch {
    return null;
  }
}

/** 是否存在可恢复的未完成进度（至少答过 1 题、且未到最后） */
export function hasResumableProgress(p: PersistedLiveState): boolean {
  return p.answers.length > 0 && p.currentIdx < p.questions.length;
}
