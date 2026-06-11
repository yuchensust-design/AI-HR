/**
 * M4 项目陪练 — 数据模型。
 *
 * 设计原则:
 * 1. 一个项目对应一个 JD gap(或多个相关 gap),帮学生用 2-4 周做出可以写进简历的证据
 * 2. 反编造守则:committable === true 仅在 status === "DONE" 时为真,M3 simulate-edits 看到这个 flag 才会把项目当成"已完成项目"喂给 prompt
 * 3. weekly_plan 是计划骨架,不是"已完成事实";day-level task progress 用 task_progress[taskId]=true 跟踪
 * 4. metrics_dictionary 是项目要追踪的指标定义,用于让"补 SQL/BI"这种 gap 有可证明的产出
 */

import type { ParsedResume } from "@/lib/sync/useM3Data";

export type M4ProjectStatus = "PROPOSED" | "IN_PROGRESS" | "DONE";

export type M4SourceGap = {
  jd_requirement: string;
  why_gap: string;
  fixable?: string;
};

/** ============================================================
 * 时间感知推荐(2026-06-10):时间档 + 深度 gap 报告 + 两种卡
 * ============================================================ */

/** 可准备时间档 —— 用户必选,无默认 */
export type TimeTier = "sprint" | "standard" | "deep"; // 冲刺3-7天 / 标准2-4周 / 深耕1-2月+

export const TIME_TIERS: Record<
  TimeTier,
  { label: string; daysHint: string; emoji: string }
> = {
  sprint: { label: "冲刺", daysHint: "3-7 天 / 周末", emoji: "🏃" },
  standard: { label: "标准", daysHint: "2-4 周", emoji: "🚶" },
  deep: { label: "深耕", daysHint: "1-2 个月+", emoji: "🧗" },
};

/**
 * 岗位与"独立项目补强"模型的适配度 —— 决定 recommend 兜底策略,避免库外岗位被静默糊弄。
 *  covered  = 命中内置项目原型库(AI PM / SWE / 数据 / 市场 / 设计 / 销售),高置信
 *  digital  = 库外但属知识/数字工作,可独立做项目,只是无种子库锚定 → 通用建议、中等可靠
 *  hands_on = 实验/临床/制造/动手类,独立项目替代不了真实环境 → 不硬塞项目,改给可迁移数字证据
 */
export type BridgeFit = "covered" | "digital" | "hands_on";

/** 简历对某条 JD 要求的覆盖程度 —— 逼 LLM 引用简历判定,治"分析不准" */
export type GapCoverage = "none" | "partial" | "have";

/** 打分后的单条 gap */
export type ScoredGap = {
  jd_requirement: string;
  current_coverage: GapCoverage;
  evidence: string; // 判定依据,引用简历/JD 原文
  why_matters: string;
  impact: 1 | 2 | 3 | 4 | 5; // 对拿这个 offer 多关键
  fixable_in: { sprint: boolean; standard: boolean; deep: boolean };
};

/** ① analyze-gaps 产出的差距报告 */
export type GapReport = {
  overall_fit: 1 | 2 | 3 | 4 | 5;
  matched: { jd_requirement: string; resume_evidence: string }[]; // 已具备 → 不用补
  gaps: ScoredGap[];
  summary: string;
  bridge_fit: BridgeFit; // 这个岗位适不适合用"独立项目"补强 → 决定兜底策略
};

/** 学习资源(冲刺学习卡 / 项目内需学的) */
export type M4Resource = {
  type: "book" | "video" | "doc";
  title: string;
  note: string;
  url?: string;
  lang?: "zh" | "en";
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

/** 项目/学习卡共用的生命周期字段(前端补齐,LLM 不产出) */
export type M4Lifecycle = {
  id: string;
  generated_at: string;
  /** 这张卡是哪个时间档生成的 */
  time_budget: TimeTier;

  status: M4ProjectStatus;
  started_at: string | null;
  done_at: string | null;

  /** 用户自己记的笔记(实际成果数字 / 访谈 N 人 / 看板 link / 学到了什么) */
  notes: string;
  /** taskId → 已完成 */
  task_progress: Record<string, boolean>;

  /**
   * 反编造守则:仅在 status === "DONE" 且用户填了实际 notes 时为 true。
   * M3 / 简历回写只读 committable === true 的卡,避免把"提案"写成"已完成"。
   */
  committable: boolean;

  /**
   * 防串简历(类① 根治):这张卡是基于【哪份简历 / 哪个 JD】生成的,生成时由前端快照。
   * 采纳回流到改简历时用它种入新 m3 会话,绝不回头读全局 localStorage.PARSED_RESUME
   * (那是 last-writer-wins 单 key,多简历会串成别份)。可选 → 旧持久化卡缺省时回退到总线。
   */
  source_resume?: ParsedResume | null;
  source_jd?: { raw_jd_text?: string; role_name?: string } | null;
};

/** 项目卡的 LLM 产出部分(标准 / 深耕档) */
export type M4ProjectDraftCore = {
  kind: "project";
  /** 关联的 JD gap */
  source_gaps: M4SourceGap[];
  target_role: string | null;
  target_company: string | null;

  title: string;
  /** 为什么这个项目能补这些 gap(LLM 解释) */
  why: string;
  weeks: number;
  /** ≤1 月按天拆(day),>1 月按周拆(week) */
  plan_unit: "day" | "week";

  weekly_plan: M4WeekPlan[];
  /** 项目结束时可拿出来的产出物 */
  deliverables: string[];
  metrics_dictionary: M4MetricDef[];
  /** 做这个项目需要的技能(可能要边做边学) */
  skills_required: string[];
  /** Skeptical Recruiter 自检产出的风险 + 缓解 */
  risks: { risk: string; mitigation: string }[];
  /** 项目内需要学/查的资源 */
  learning_resources?: M4Resource[];
};

/** 学习卡的 LLM 产出部分(冲刺档:看书/视频快速补概念) */
export type M4LearningDraftCore = {
  kind: "learning";
  /** 覆盖的 gap(jd_requirement 文本) */
  covers_gaps: string[];
  title: string;
  /** 为什么这张卡能补这些 gap */
  why: string;
  /** 要搞懂的核心概念清单 */
  concepts: string[];
  resources: M4Resource[];
  /** 轻量可验证产出:一页总结 / 一条帖 / 笔记 */
  micro_deliverable: string;
  est_hours: string;
  /** 诚实落点:这是"了解/入门",不是"做过项目" */
  honest_use: string;
};

/**
 * 卡片生成的 LLM 返回 schema(recommend API 返回的单条)。
 * 与落地卡的区别:LLM 不知道 id/status/进度/time_budget,这些在前端补齐。
 */
export type M4ProjectDraft = M4ProjectDraftCore | M4LearningDraftCore;

/** 落地后的项目卡 */
export type M4ProjectItem = M4Lifecycle & M4ProjectDraftCore;
/** 落地后的学习卡 */
export type M4LearningItem = M4Lifecycle & M4LearningDraftCore;

/** 落地后的卡(判别符 kind) */
export type M4Project = M4ProjectItem | M4LearningItem;

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

  if (p.kind === "learning") {
    // 学习卡:诚实落点是"了解/入门 + 轻量产出",不冒充做过项目
    const concepts = (p.concepts ?? []).filter(Boolean).join("、");
    const bulletText = [
      p.title,
      notes ? `学习成果:${notes}` : "",
      p.micro_deliverable ? `产出:${p.micro_deliverable}` : "",
    ]
      .filter(Boolean)
      .join(";");
    return {
      question_id: `m4-${p.id}`,
      topic_name: `补能力 · ${(p.title ?? "").slice(0, 30)}${date ? ` · ${date}` : ""}`,
      raw_user_material: [
        `快速补强:${p.title}`,
        p.why ? `补的 gap:${p.why}` : "",
        concepts ? `搞懂的概念:${concepts}` : "",
        notes ? `我的实际学习成果(notes):${notes}` : "",
        p.micro_deliverable ? `轻量产出:${p.micro_deliverable}` : "",
        p.honest_use ? `诚实落点:${p.honest_use}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
      star_breakdown: null,
      candidate_bullets: [
        {
          text: bulletText,
          anti_fab_note:
            "来自补能力(学习型):只能写成'了解/入门级 + 轻量产出',不得包装成做过完整项目;数字/产出以 notes 为准",
        },
      ],
    };
  }

  // 项目卡
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
