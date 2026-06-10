import { describe, it, expect } from "vitest";
import {
  projectToHiddenExperience,
  type M4ProjectItem,
  type M4LearningItem,
} from "./m4-types";

function project(over: Partial<M4ProjectItem> = {}): M4ProjectItem {
  return {
    kind: "project",
    id: "p1",
    generated_at: "2026-06-01T00:00:00.000Z",
    time_budget: "standard",
    source_gaps: [],
    target_role: "数据分析师",
    target_company: null,
    title: "校园外卖履约数据看板",
    why: "补 SQL + BI 看板 gap",
    weeks: 3,
    plan_unit: "day",
    weekly_plan: [],
    deliverables: ["Metabase 看板", "复盘报告"],
    metrics_dictionary: [],
    skills_required: ["SQL", "Metabase"],
    risks: [],
    status: "DONE",
    started_at: "2026-05-01T00:00:00.000Z",
    done_at: "2026-05-28T00:00:00.000Z",
    notes: "采集 1200 单,做了 6 张看板,平均出餐时长从 28 分压到 19 分",
    task_progress: {},
    committable: true,
    ...over,
  };
}

function learning(over: Partial<M4LearningItem> = {}): M4LearningItem {
  return {
    kind: "learning",
    id: "l1",
    generated_at: "2026-06-01T00:00:00.000Z",
    time_budget: "sprint",
    covers_gaps: ["A/B 测试基础"],
    title: "快速补 A/B 测试概念",
    why: "补实验设计概念 gap",
    concepts: ["假设检验", "显著性", "样本量"],
    resources: [{ type: "book", title: "《赠品》", note: "看前 3 章", lang: "zh" }],
    micro_deliverable: "一页 A/B 测试核心概念总结",
    est_hours: "6-10h",
    honest_use: "面试里只写成'了解 A/B 测试基础概念'",
    status: "DONE",
    started_at: "2026-05-26T00:00:00.000Z",
    done_at: "2026-05-28T00:00:00.000Z",
    notes: "看完 3 章,整理了一页概念笔记发在知乎",
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

describe("projectToHiddenExperience · 学习卡(冲刺档)", () => {
  it("topic_name 用'补能力'标签(区别于项目)", () => {
    expect(projectToHiddenExperience(learning()).topic_name).toContain("补能力 ·");
  });

  it("raw_user_material 含概念 + 学习成果 + 诚实落点", () => {
    const he = projectToHiddenExperience(learning());
    expect(he.raw_user_material).toContain("搞懂的概念");
    expect(he.raw_user_material).toContain("一页概念笔记");
    expect(he.raw_user_material).toContain("诚实落点");
  });

  it("反编造 note 强制写成了解/入门级,不冒充项目", () => {
    const b = projectToHiddenExperience(learning()).candidate_bullets[0]!;
    expect(b.anti_fab_note).toMatch(/了解\/入门级/);
    expect(b.anti_fab_note).toMatch(/不得包装成做过完整项目/);
  });
});
