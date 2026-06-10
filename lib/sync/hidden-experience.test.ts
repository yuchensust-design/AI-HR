import { describe, it, expect } from "vitest";
import {
  mergeHiddenExperience,
  asHiddenList,
  type HiddenExperience,
} from "./hidden-experience";

function he(id: string, text = "t"): HiddenExperience {
  return {
    question_id: id,
    topic_name: `topic-${id}`,
    raw_user_material: text,
    star_breakdown: null,
    candidate_bullets: [{ text, anti_fab_note: null }],
  };
}

describe("mergeHiddenExperience", () => {
  it("空 + 空 → 空", () => {
    expect(mergeHiddenExperience([], [])).toEqual([]);
  });

  it("追加全新条目:existing 在前、保序", () => {
    const out = mergeHiddenExperience([he("a"), he("b")], [he("c"), he("d")]);
    expect(out.map((x) => x.question_id)).toEqual(["a", "b", "c", "d"]);
  });

  it("按 question_id 去重:已存在的丢弃,不堆重复", () => {
    const out = mergeHiddenExperience([he("a"), he("b")], [he("b"), he("c")]);
    expect(out.map((x) => x.question_id)).toEqual(["a", "b", "c"]);
  });

  it("同一批 toAdd 内部也去重", () => {
    const out = mergeHiddenExperience([], [he("x"), he("x"), he("y")]);
    expect(out.map((x) => x.question_id)).toEqual(["x", "y"]);
  });

  it("不改原数组(existing 在前,返回新数组)", () => {
    const existing = [he("a")];
    const toAdd = [he("b")];
    const out = mergeHiddenExperience(existing, toAdd);
    expect(existing).toHaveLength(1);
    expect(toAdd).toHaveLength(1);
    expect(out).toHaveLength(2);
  });

  it("已存在条目保留的是 existing 版本(不被 toAdd 覆盖)", () => {
    const out = mergeHiddenExperience([he("a", "old")], [he("a", "new")]);
    expect(out).toHaveLength(1);
    expect(out[0]!.raw_user_material).toBe("old");
  });

  it("缺 question_id 的条目一律保留、不参与去重", () => {
    const noId = { ...he("x"), question_id: "" } as HiddenExperience;
    const out = mergeHiddenExperience([noId], [noId]);
    expect(out).toHaveLength(2); // 两条都保留,不因空 id 互相去重
  });
});

describe("asHiddenList", () => {
  it("数组原样返回,非数组 → 空数组", () => {
    expect(asHiddenList([he("a")])).toHaveLength(1);
    expect(asHiddenList(null)).toEqual([]);
    expect(asHiddenList(undefined)).toEqual([]);
    expect(asHiddenList({})).toEqual([]);
    expect(asHiddenList("x")).toEqual([]);
  });
});
