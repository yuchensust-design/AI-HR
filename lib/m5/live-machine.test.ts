import { describe, it, expect } from "vitest";
import {
  enterThinking,
  advanceToNext,
  isStaleResolve,
  resolveFollowUp,
  shouldStartEvaluate,
  serializeLiveState,
  deserializeLiveState,
  hasResumableProgress,
  type AdvanceState,
  type SerializableLiveState,
} from "./live-machine";
import type { InterviewQuestion } from "@/lib/interview-types";

const q = (id: string): InterviewQuestion => ({
  id,
  text: `题 ${id}`,
  intent: "",
  ideal_hints: [],
  category: "project",
  source: "main",
});

const baseState = (overrides: Partial<AdvanceState> = {}): AdvanceState => ({
  status: "thinking",
  currentIdx: 0,
  questions: [q("Q1"), q("Q2"), q("Q3")],
  followUpsUsed: 0,
  ...overrides,
});

describe("enterThinking", () => {
  it("不推进 index，只切 thinking", () => {
    const s = enterThinking(baseState({ status: "listening" }));
    expect(s.status).toBe("thinking");
    expect(s.currentIdx).toBe(0);
  });
});

describe("advanceToNext", () => {
  it("推进到下一题", () => {
    const s = advanceToNext(baseState({ currentIdx: 0 }));
    expect(s.currentIdx).toBe(1);
    expect(s.status).toBe("asking");
  });
  it("越界 → finished", () => {
    const s = advanceToNext(baseState({ currentIdx: 2 }));
    expect(s.status).toBe("finished");
  });
});

describe("isStaleResolve (B1 幂等守卫)", () => {
  it("非 thinking 态（暂停）→ stale", () => {
    expect(isStaleResolve(baseState({ status: "paused" }), "Q1")).toBe(true);
  });
  it("非 thinking 态（已结束）→ stale", () => {
    expect(isStaleResolve(baseState({ status: "finished" }), "Q1")).toBe(true);
  });
  it("决议针对的题 ≠ 当前母题 → stale", () => {
    expect(isStaleResolve(baseState({ currentIdx: 0 }), "Q2")).toBe(true);
  });
  it("thinking + 当前母题匹配 → 不 stale", () => {
    expect(isStaleResolve(baseState({ currentIdx: 0 }), "Q1")).toBe(false);
  });
});

describe("resolveFollowUp", () => {
  it("B1：暂停态下迟到的 follow-up → no-op（不吹暂停、不推进）", () => {
    const s = baseState({ status: "paused", currentIdx: 0 });
    const r = resolveFollowUp(s, "Q1", q("FU"));
    expect(r).toBe(s); // 原样返回
  });
  it("B1：结束态下迟到的 follow-up → no-op", () => {
    const s = baseState({ status: "finished", currentIdx: 2 });
    expect(resolveFollowUp(s, "Q3", q("FU"))).toBe(s);
  });
  it("有追问 → insert 到母题后(currentIdx+1)、推进、followUpsUsed+1、不追加队尾", () => {
    const s = baseState({ currentIdx: 0 });
    const r = resolveFollowUp(s, "Q1", q("FU"));
    expect(r.questions.map((x) => x.id)).toEqual(["Q1", "FU", "Q2", "Q3"]);
    expect(r.currentIdx).toBe(1); // 指向刚插入的 FU
    expect(r.questions[1].source).toBe("follow_up");
    expect(r.questions[1].parent_id).toBe("Q1");
    expect(r.followUpsUsed).toBe(1);
    expect(r.status).toBe("asking");
  });
  it("无追问 → 推进到下一题", () => {
    const r = resolveFollowUp(baseState({ currentIdx: 0 }), "Q1", null);
    expect(r.currentIdx).toBe(1);
    expect(r.followUpsUsed).toBe(0);
  });
  it("无追问 + 最后一题 → finished", () => {
    const r = resolveFollowUp(baseState({ currentIdx: 2 }), "Q3", null);
    expect(r.status).toBe("finished");
  });
});

describe("shouldStartEvaluate (G2 在途去重)", () => {
  it("已评分 → 不再发", () => {
    expect(shouldStartEvaluate("Q1", new Set(["Q1"]), new Set())).toBe(false);
  });
  it("在途中 → 不重复发（挡住 G2 重放窗口）", () => {
    expect(shouldStartEvaluate("Q1", new Set(), new Set(["Q1"]))).toBe(false);
  });
  it("未评分且不在途 → 发", () => {
    expect(shouldStartEvaluate("Q1", new Set(), new Set())).toBe(true);
  });
});

describe("rehydrate 序列化（v5-R1）", () => {
  const snap: SerializableLiveState = {
    sessionId: "m5_x",
    currentIdx: 2,
    followUpsUsed: 1,
    questions: [q("Q1"), q("Q2"), q("Q3")],
    answers: [
      { question_id: "Q1", transcript: "答1", answered_at: "t1" },
    ],
    turnEvaluations: [],
  };
  it("serialize→deserialize 往返等价", () => {
    const back = deserializeLiveState(serializeLiveState(snap));
    expect(back).not.toBeNull();
    expect(back!.sessionId).toBe("m5_x");
    expect(back!.currentIdx).toBe(2);
    expect(back!.followUpsUsed).toBe(1);
    expect(back!.questions.map((x) => x.id)).toEqual(["Q1", "Q2", "Q3"]);
    expect(back!.answers.length).toBe(1);
  });
  it("解析失败 → null", () => {
    expect(deserializeLiveState("{bad json")).toBeNull();
  });
  it("旧版本/缺字段 → null", () => {
    expect(deserializeLiveState(JSON.stringify({ v: 0 }))).toBeNull();
    expect(deserializeLiveState(JSON.stringify({ v: 1, sessionId: "x" }))).toBeNull();
  });
  it("hasResumableProgress：答过题且未到尾 → true", () => {
    const p = deserializeLiveState(serializeLiveState(snap))!;
    expect(hasResumableProgress(p)).toBe(true);
  });
  it("hasResumableProgress：没答过 → false", () => {
    const p = deserializeLiveState(
      serializeLiveState({ ...snap, answers: [] }),
    )!;
    expect(hasResumableProgress(p)).toBe(false);
  });
});
