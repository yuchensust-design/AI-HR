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
  education?: { school?: string; major?: string; period?: string; gpa?: string | null; courses?: string[] }[];
  experience?: { org?: string; role?: string; period?: string; bullets?: Bullet[] }[];
  projects?: { name?: string; period?: string; role?: string | null; tech_stack?: string[]; bullets?: Bullet[] }[];
  activities?: { org?: string; role?: string; period?: string; bullets?: Bullet[] }[];
  skills?: { languages?: string[]; frameworks?: string[]; tools?: string[]; domain?: string[] };
};

type EditApplied = {
  id: string;
  target: string;
  original_text: string;
  suggested_text: string;
  category: string;
  priority: string;
};

function bulletText(b: Bullet): string {
  return typeof b === "string" ? b : b.text ?? "";
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedResume = body.parsedResume as ParsedResume;
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

    // Apply per-target edits
    type Section = "experience" | "projects" | "activities";
    const sections: Section[] = ["experience", "projects", "activities"];
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

    // 教育
    if (finalResume.education && finalResume.education.length > 0) {
      lines.push("## 教育背景");
      for (const ed of finalResume.education) {
        const head = `**${ed.school ?? ""}** · ${ed.major ?? ""}`;
        const right = `${ed.period ?? ""} ${ed.gpa ? `GPA ${ed.gpa}` : ""}`.trim();
        lines.push(`${head}${right ? ` (${right})` : ""}`);
        if (ed.courses && ed.courses.length > 0) {
          lines.push(`- 相关课程: ${ed.courses.join("、")}`);
        }
        lines.push("");
      }
    }

    // 实习
    if (finalResume.experience && finalResume.experience.length > 0) {
      lines.push("## 实习经历");
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

    // Append new section edits as projects
    if (newSectionEdits.length > 0) {
      for (const ne of newSectionEdits) {
        lines.push(`- ${ne.suggested_text}`);
      }
      lines.push("");
    }

    // 社团
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

    // 技能
    if (finalResume.skills) {
      lines.push("## 专业技能");
      const sk = finalResume.skills;
      if (sk.languages?.length) lines.push(`- 语言: ${sk.languages.join(" / ")}`);
      if (sk.frameworks?.length) lines.push(`- 框架: ${sk.frameworks.join(" / ")}`);
      if (sk.tools?.length) lines.push(`- 工具: ${sk.tools.join(" / ")}`);
      if (sk.domain?.length) lines.push(`- 领域: ${sk.domain.join(" / ")}`);
    }

    const markdown = lines.join("\n");

    // 改进 5: 收集 3-5 个 candidate bullets(从 high priority accepted edits)
    const candidates = acceptedEdits
      .filter((e) => e.priority === "high")
      .slice(0, 5)
      .map((e) => ({
        source: e.target.startsWith("new:") ? "hidden" : "original",
        text: e.suggested_text,
        category: e.category,
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
