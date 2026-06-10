import { describe, it, expect } from "vitest";
import { projectToHiddenExperience, type M4Project } from "./m4-types";

function project(over: Partial<M4Project> = {}): M4Project {
  return {
    id: "p1",
    generated_at: "2026-06-01T00:00:00.000Z",
    source_gaps: [],
    target_role: "数据分析师",
    target_company: null,
    title: "校园外卖履约数据看板",
    why: "补 SQL + BI 看板 gap",
    weeks: 3,
    weekly_plan: [],
    deliverables: ["Metabase 看板", "复盘报告"],
    metrics_dictionary: [],
    skills_required: ["SQL", "Metabase"],
    status: "DONE",
    started_at: "2026-05-01T00:00:00.000Z",
    done_at: "2026-05-28T00:00:00.000Z",
    notes: "采集 1200 单,做了 6 张看板,平均出餐时长从 28 分压到 19 分",
    task_progress: {},
    committable: true,
    ...over,
  };
}

describe("projectToHiddenExperience", () => {
  it("question_id 用 m4- 前缀(跨来源稳定去重)", () => {
    expect(projectToHiddenExperience(project()).question_id).toBe("m4-p1");
  });

  it("topic_name 带补项目标签 + done_at 日期", () => {
    expect(projectToHiddenExperience(project()).topic_name).toContain("补项目 ·");
    expect(projectToHiddenExperience(project()).topic_name).toContain("2026-05-28");
  });

  it("raw_user_material 含用户实际 notes(成果数字来源)", () => {
    const he = projectToHiddenExperience(project());
    expect(he.raw_user_material).toContain("28 分压到 19 分");
    expect(he.raw_user_material).toContain("Metabase 看板");
  });

  it("candidate_bullet 带反编造 note,且 text 含成果", () => {
    const b = projectToHiddenExperience(project()).candidate_bullets[0]!;
    expect(b.anti_fab_note).toMatch(/不得脑补/);
    expect(b.text).toContain("成果:");
  });

  it("done_at 缺失时回退 generated_at 日期", () => {
    const he = projectToHiddenExperience(project({ done_at: null }));
    expect(he.topic_name).toContain("2026-06-01");
  });

  it("notes/deliverables 为空也不崩(只保留 title)", () => {
    const he = projectToHiddenExperience(
      project({ notes: "", deliverables: [], skills_required: [] }),
    );
    expect(he.candidate_bullets[0]!.text).toBe("校园外卖履约数据看板");
    expect(he.raw_user_material).toContain("项目:校园外卖履约数据看板");
  });
});
