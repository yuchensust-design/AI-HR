import { describe, it, expect } from "vitest";
import { bulletToHiddenExperience, type M2BulletLike } from "./m2-bullet";

const full: M2BulletLike = {
  id: "b1",
  text: "搭建宿舍楼快递代取小程序,3 周内覆盖 4 栋楼、日均代取 80 单",
  star_breakdown: {
    s: "宿舍楼快递点排长队",
    t: "想用技术解决取件效率",
    a: "用微信小程序做了预约代取",
    r: "日均 80 单,平均取件时间从 12 分降到 3 分",
  },
  competency: "执行落地",
  anti_fab_note: "数字由你口述",
};

describe("bulletToHiddenExperience", () => {
  it("question_id 用 m2- 前缀 + id", () => {
    expect(bulletToHiddenExperience(full).question_id).toBe("m2-b1");
  });

  it("STAR {s,t,a,r} 映射到 {situation,task,action,result}", () => {
    const sb = bulletToHiddenExperience(full).star_breakdown!;
    expect(sb.situation).toBe("宿舍楼快递点排长队");
    expect(sb.result).toContain("80 单");
  });

  it("raw_user_material 含 STAR 各段", () => {
    const raw = bulletToHiddenExperience(full).raw_user_material;
    expect(raw).toContain("情境:");
    expect(raw).toContain("结果:");
  });

  it("candidate_bullet text = 已拼好的 bullet 文本,带反编造 note", () => {
    const b = bulletToHiddenExperience(full).candidate_bullets[0]!;
    expect(b.text).toContain("日均代取 80 单");
    expect(b.anti_fab_note).toBe("数字由你口述");
  });

  it("无 id → 用 text 兜底 key(稳定去重)", () => {
    const noId: M2BulletLike = { text: "帮室友补习高数,期末全员及格" };
    const q = bulletToHiddenExperience(noId).question_id;
    expect(q.startsWith("m2-")).toBe(true);
    // 同一条再转一次 → 同一个 id(可去重)
    expect(bulletToHiddenExperience(noId).question_id).toBe(q);
  });

  it("无 STAR → star_breakdown 为 null,raw 退回 text", () => {
    const noStar: M2BulletLike = { id: "x", text: "组织院运动会,统筹 200 人" };
    const he = bulletToHiddenExperience(noStar);
    expect(he.star_breakdown).toBeNull();
    expect(he.raw_user_material).toBe("组织院运动会,统筹 200 人");
  });

  it("缺 anti_fab_note → 用默认反编造提示", () => {
    const he = bulletToHiddenExperience({ id: "y", text: "x" });
    expect(he.candidate_bullets[0]!.anti_fab_note).toMatch(/不得脑补/);
  });
});
