/**
 * M4 项目陪练 — 数据模型。
 *
 * 设计原则:
 * 1. 一个项目对应一个 JD gap(或多个相关 gap),帮学生用 2-4 周做出可以写进简历的证据
 * 2. 反编造守则:committable === true 仅在 status === "DONE" 时为真,M3 simulate-edits 看到这个 flag 才会把项目当成"已完成项目"喂给 prompt
 * 3. weekly_plan 是计划骨架,不是"已完成事实";day-level task progress 用 task_progress[taskId]=true 跟踪
 * 4. metrics_dictionary 是项目要追踪的指标定义,用于让"补 SQL/BI"这种 gap 有可证明的产出
 */

export type M4ProjectStatus = "PROPOSED" | "IN_PROGRESS" | "DONE";

export type M4SourceGap = {
  jd_requirement: string;
  why_gap: string;
  fixable?: string;
};

export type M4Task = {
  /** 唯一 id,用于 task_progress 索引,格式 "w<week>-d<day>-<rand>" */
  id: string;
  day: string; // "Day 1" / "Day 2" ...
  task: string;
  hours: string; // "2h" / "0.5h" ...
};

export type M4WeekPlan = {
  week: number; // 1-4
  goal: string; // 本周里程碑
  tasks: M4Task[];
};

export type M4MetricDef = {
  name: string;
  definition: string;
  data_source: string; // "公开数据集 / 自采 / 校园问卷 / WebSearch ..."
};

export type M4Project = {
  id: string;
  generated_at: string;
  /** 关联的 JD gap(从 M3 JD_CONTEXT.gaps 来) */
  source_gaps: M4SourceGap[];
  /** 关联的目标岗位名 + 公司(仅做展示用) */
  target_role: string | null;
  target_company: string | null;

  title: string;
  /** 为什么这个项目能补这些 gap(LLM 解释) */
  why: string;
  weeks: 2 | 3 | 4;

  weekly_plan: M4WeekPlan[];
  /** 项目结束时可拿出来的产出物(数据集 / Dashboard / PRD / 复盘报告 / Prompt 评测集...) */
  deliverables: string[];
  metrics_dictionary: M4MetricDef[];
  /** 做这个项目需要的技能(用户可能要边做边学) */
  skills_required: string[];

  status: M4ProjectStatus;
  started_at: string | null;
  done_at: string | null;

  /** 用户自己记的项目笔记(实际成果数字 / 访谈 N 人 / 看板 link) */
  notes: string;
  /** taskId → 已完成 */
  task_progress: Record<string, boolean>;

  /**
   * 反编造守则:仅在 status === "DONE" 且用户填了实际 notes 时为 true。
   * M3 / 简历回写只读 committable === true 的项目,避免把"提案项目"写成"已完成项目"。
   */
  committable: boolean;
};

/**
 * 项目生成的 LLM 返回 schema(generate-projects API 返回的单条)。
 * 与 M4Project 区别:LLM 不知道 id/status/进度,这些字段在前端补齐。
 */
export type M4ProjectDraft = Omit<
  M4Project,
  | "id"
  | "generated_at"
  | "status"
  | "started_at"
  | "done_at"
  | "notes"
  | "task_progress"
  | "committable"
>;

/**
 * 补项目 → 改简历素材池转换器(飞轮:补项目→改简历)。
 * 只在 committable===true 时被调用(已完成 + 有实际成果 notes,反编造)。
 * question_id 用 m4-${id} 前缀,跨来源(面试 m5- / 挖经历 m2-)稳定去重。
 * 纯函数 → 可单测;不脑补数字,bullet 以用户 notes 实际成果为准。
 */
export function projectToHiddenExperience(
  p: M4Project,
): import("@/lib/sync/hidden-experience").HiddenExperience {
  const date = (p.done_at ?? p.generated_at ?? "").slice(0, 10);
  const notes = (p.notes ?? "").trim();
  const deliverables = (p.deliverables ?? []).filter(Boolean).join("、");
  const skills = (p.skills_required ?? []).filter(Boolean).join(", ");
  const bulletText = [
    p.title,
    notes ? `成果:${notes}` : "",
    deliverables ? `产出:${deliverables}` : "",
  ]
    .filter(Boolean)
    .join(";");
  return {
    question_id: `m4-${p.id}`,
    topic_name: `补项目 · ${(p.title ?? "").slice(0, 30)}${date ? ` · ${date}` : ""}`,
    raw_user_material: [
      `项目:${p.title}`,
      p.why ? `补的 gap:${p.why}` : "",
      notes ? `我的实际成果(notes):${notes}` : "",
      deliverables ? `产出物:${deliverables}` : "",
      skills ? `用到技能:${skills}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    star_breakdown: null,
    candidate_bullets: [
      {
        text: bulletText,
        anti_fab_note:
          "来自补项目,用户已填实际成果 notes;数字/产出以 notes 为准,不得脑补未发生的结果",
      },
    ],
  };
}
