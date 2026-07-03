/**
 * POST /api/m3/finalize-resume — 用户 lock 完 → 组装最终 markdown
 *
 * Body:
 *   { parsedResume, jdContext?, hiddenExperiences?, acceptedEdits: EditSuggestion[] }
 *
 * 流程:
 *   1. 把 parsedResume 渲染成 markdown 基底
 *   2. 应用 acceptedEdits 的 target → suggested_text 替换
 *   3. 应用 "new:" 的新增 bullet
 *   4. 产出 candidate_bullets(改进 5: 3-5 个 STAR bullet 给用户 copy)
 *
 * 注意:不再调 LLM —— 纯组装。因为 LLM 已在 suggest-edits 时算过了。
 */

import { NextRequest, NextResponse } from "next/server";
import { skillGroupsOf } from "@/lib/resume-skills";

type Bullet = string | { text?: string; narrative_tag?: string };

type ParsedResume = {
  basic?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    school?: string | null;
    major?: string | null;
    year_level?: string | null;
    gpa?: string | null;
  };
  education?: {
    school?: string;
    major?: string;
    degree?: string | null;
    period?: string;
    gpa?: string | null;
    rank?: string | null;
    research_direction?: string | null;
    advisor?: string | null;
    courses?: string[];
    awards?: string[];
  }[];
  experience?: { org?: string; role?: string; period?: string; bullets?: Bullet[] }[];
  projects?: { name?: string; period?: string; role?: string | null; tech_stack?: string[]; bullets?: Bullet[] }[];
  activities?: { org?: string; role?: string; period?: string; bullets?: Bullet[] }[];
  self_eval?: { bullets?: Bullet[] }[];
  skills?: { languages?: string[]; frameworks?: string[]; tools?: string[]; domain?: string[] };
  skill_groups?: { category: string; items: string[] }[];
};

type EditApplied = {
  id: string;
  target: string;
  original_text: string;
  suggested_text: string;
  category: string;
  priority: string;
  source?: "jd" | "resume" | "experience" | "interview";
  confidence?: number;
  linked_jd_keyword?: string | null;
  new_project_name?: string | null;
  new_project_period?: string | null;
};

function bulletText(b: Bullet): string {
  return typeof b === "string" ? b : b.text ?? "";
}

export const maxDuration = 60; // 线上防 Vercel 默认 10s 静默超时(整篇简历定稿调 LLM,长简历会超 10s)

type JdCtx = {
  jd_summary?: string;
  role_name?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedResume = body.parsedResume as ParsedResume;
    const jdContext = (body.jdContext ?? null) as JdCtx | null;
    const acceptedEdits = (body.acceptedEdits ?? []) as EditApplied[];

    if (!parsedResume) {
      return NextResponse.json({ error: "parsedResume required" }, { status: 400 });
    }

    // Deep clone
    const finalResume: ParsedResume = JSON.parse(JSON.stringify(parsedResume));

    // 索引 edits by target
    const editByTarget = new Map<string, EditApplied>();
    const newSectionEdits: EditApplied[] = [];
    for (const e of acceptedEdits) {
      if (e.target.startsWith("new:")) newSectionEdits.push(e);
      else editByTarget.set(e.target, e);
    }
    // 新增素材按落点分流(补经历飞轮:项目→STAR项目经历 / 纯学习→技能 / 自我评价)
    const newSkills = newSectionEdits.filter((e) =>
      e.target.startsWith("new:skills"),
    );
    const newSelfEval = newSectionEdits.filter((e) =>
      e.target.startsWith("new:self_eval"),
    );
    const newProjectBullets = newSectionEdits.filter(
      (e) =>
        !e.target.startsWith("new:skills") &&
        !e.target.startsWith("new:self_eval"),
    );

    // Apply per-target edits
    type Section = "experience" | "projects" | "activities" | "self_eval";
    const sections: Section[] = ["experience", "projects", "activities", "self_eval"];
    for (const section of sections) {
      const arr = (finalResume[section] ?? []) as { bullets?: Bullet[] }[];
      for (let sIdx = 0; sIdx < arr.length; sIdx++) {
        const bullets = arr[sIdx].bullets ?? [];
        for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
          const target = `${section}[${sIdx}].bullets[${bIdx}]`;
          const e = editByTarget.get(target);
          if (e) {
            bullets[bIdx] = { text: e.suggested_text, narrative_tag: "strong" };
          }
        }
      }
    }

    // Render markdown
    const lines: string[] = [];

    const b = finalResume.basic ?? {};
    const targetRole = jdContext?.role_name ?? jdContext?.jd_summary ?? "";
    if (b.name) lines.push(`# ${b.name}`);
    const subline = [
      b.major,
      b.year_level,
      b.school,
      b.gpa ? `GPA ${b.gpa}` : null,
    ].filter(Boolean).join(" · ");
    if (subline) lines.push(subline);
    const contact = [b.phone, b.email].filter(Boolean).join(" · ");
    if (contact) lines.push(contact);
    lines.push("");

    if (targetRole) {
      lines.push("## 求职意向");
      lines.push(`- 目标岗位: ${targetRole}`);
      lines.push("");
    }

    const skillGroups = skillGroupsOf(finalResume);
    if (skillGroups.length > 0 || newSkills.length > 0) {
      lines.push("## 核心技能");
      for (const g of skillGroups) {
        lines.push(`- ${g.category}: ${g.items.join(" / ")}`);
      }
      // 补经历(学习型)带来的技能
      for (const ne of newSkills) {
        lines.push(`- ${ne.suggested_text}`);
      }
      lines.push("");
    }

    // 工作/实习经历
    if (finalResume.experience && finalResume.experience.length > 0) {
      lines.push("## 工作经历");
      for (const e of finalResume.experience) {
        const head = `**${e.org ?? ""}** · ${e.role ?? ""}`;
        const right = e.period ? ` (${e.period})` : "";
        lines.push(`${head}${right}`);
        for (const bul of e.bullets ?? []) {
          lines.push(`- ${bulletText(bul)}`);
        }
        lines.push("");
      }
    }

    // 项目
    if (finalResume.projects && finalResume.projects.length > 0) {
      lines.push("## 项目经验");
      for (const p of finalResume.projects) {
        const head = `**${p.name ?? ""}**${p.role ? ` · ${p.role}` : ""}`;
        const right = p.period ? ` (${p.period})` : "";
        lines.push(`${head}${right}`);
        if (p.tech_stack && p.tech_stack.length > 0) {
          lines.push(`*技术栈: ${p.tech_stack.join(" / ")}*`);
        }
        for (const bul of p.bullets ?? []) {
          lines.push(`- ${bulletText(bul)}`);
        }
        lines.push("");
      }
    }

    // 补经历(项目型)带来的新经历:作为项目经历补充。
    // 带 new_project_name 的(来自补项目 m4)→ 以「名称(时间)」表头 + 成果 bullet 渲染成正经项目;
    // 不带名称的(挖经历 / 面试回流)→ 归到「补充项目经历」。
    if (newProjectBullets.length > 0) {
      if (!finalResume.projects || finalResume.projects.length === 0) {
        lines.push("## 项目经验");
      }
      const named = new Map<string, { period: string; texts: string[] }>();
      const unnamed: string[] = [];
      for (const ne of newProjectBullets) {
        const name = (ne.new_project_name ?? "").trim();
        if (name) {
          const g = named.get(name) ?? { period: (ne.new_project_period ?? "").trim(), texts: [] };
          g.texts.push(ne.suggested_text);
          named.set(name, g);
        } else {
          unnamed.push(ne.suggested_text);
        }
      }
      for (const [name, g] of named) {
        lines.push(`**${name}**${g.period ? ` (${g.period})` : ""}`);
        for (const t of g.texts) lines.push(`- ${t}`);
        lines.push("");
      }
      if (unnamed.length > 0) {
        lines.push("**补充项目经历**");
        for (const t of unnamed) lines.push(`- ${t}`);
        lines.push("");
      }
    }

    // 社团/活动
    if (finalResume.activities && finalResume.activities.length > 0) {
      lines.push("## 社团活动");
      for (const a of finalResume.activities) {
        const head = `**${a.org ?? ""}** · ${a.role ?? ""}`;
        const right = a.period ? ` (${a.period})` : "";
        lines.push(`${head}${right}`);
        for (const bul of a.bullets ?? []) {
          lines.push(`- ${bulletText(bul)}`);
        }
        lines.push("");
      }
    }

    // 自我评价(含补经历学习型带来的一句诚实评价)
    {
      const selfBullets = (finalResume.self_eval ?? []).flatMap(
        (s) => s.bullets ?? [],
      );
      if (selfBullets.length > 0 || newSelfEval.length > 0) {
        lines.push("## 自我评价");
        for (const bul of selfBullets) {
          lines.push(`- ${bulletText(bul)}`);
        }
        for (const ne of newSelfEval) {
          lines.push(`- ${ne.suggested_text}`);
        }
        lines.push("");
      }
    }

    // 教育背景放最后,对齐 Skill 规范
    if (finalResume.education && finalResume.education.length > 0) {
      lines.push("## 教育背景");
      for (const ed of finalResume.education) {
        const headParts = [ed.school, ed.major, ed.degree].filter(Boolean).join(" · ");
        const right = `${ed.period ?? ""} ${ed.gpa ? `GPA ${ed.gpa}` : ""}`.trim();
        lines.push(`**${headParts}**${right ? ` (${right})` : ""}`);
        if (ed.research_direction) {
          lines.push(`- 研究方向: ${ed.research_direction}${ed.advisor ? ` · 导师: ${ed.advisor}` : ""}`);
        } else if (ed.advisor) {
          lines.push(`- 导师: ${ed.advisor}`);
        }
        if (ed.rank) lines.push(`- 专业排名: ${ed.rank}`);
        if (ed.awards && ed.awards.length > 0) lines.push(`- 荣誉: ${ed.awards.join("、")}`);
        if (ed.courses && ed.courses.length > 0) lines.push(`- 相关课程: ${ed.courses.join("、")}`);
        lines.push("");
      }
    }

    const markdown = lines.join("\n");

    // 改进 5: 收集 3-5 个 candidate bullets(从 high priority accepted edits)
    // 06 §3.4 升级:每条 carry source + confidence + linked_jd_keyword,前端能继续展示能力证据
    const candidates = acceptedEdits
      .filter((e) => e.priority === "high")
      .slice(0, 5)
      .map((e) => ({
        source: e.source ?? (e.target.startsWith("new:") ? "experience" : "resume"),
        text: e.suggested_text,
        category: e.category,
        confidence: typeof e.confidence === "number" ? e.confidence : 0.78,
        linked_jd_keyword: e.linked_jd_keyword ?? null,
        origin_kind: e.target.startsWith("new:") ? "hidden" : "original",
      }));

    return NextResponse.json({
      markdown,
      candidate_bullets: candidates,
      applied_edits_count: acceptedEdits.length,
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/finalize-resume error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
