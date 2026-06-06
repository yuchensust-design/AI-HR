/**
 * POST /api/m4/generate-from-role — 从 M1 推荐岗位直接生成补经历计划
 *
 * Body:
 *   {
 *     targetRole: string,        // 目标职位名（eg "AI产品经理"）
 *     targetIndustry: string,    // 行业（eg "互联网"）
 *     evidenceSummary?: string,  // 简历摘要（来自 M1 evidence.summary）
 *     evidenceTags?: string[],   // 简历标签
 *     n?: 2 | 3,                // 生成项目数，默认 2
 *   }
 *
 * 返回:
 *   {
 *     gaps: M4SourceGap[],       // LLM 推断出的经历缺口
 *     projects: M4ProjectDraft[] // 对应的补强项目
 *   }
 *
 * 与 generate-projects 的区别：不需要用户先贴 JD，直接从岗位名 + 简历推断 gap。
 * 推断出的 gap 比有 JD 时更通用，但对方向探索阶段的用户已经足够。
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type { M4ProjectDraft, M4SourceGap } from "@/lib/m4-types";

type RequestBody = {
  targetRole: string;
  targetIndustry?: string;
  evidenceSummary?: string | null;
  evidenceTags?: string[] | null;
  n?: 2 | 3;
};

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」模块 4 的项目设计师。用户从 M1 测评发现了一个目标岗位方向，你的任务分两步：

【步骤 1 — 识别经历缺口（gaps）】
根据用户的目标岗位和简历摘要，推断出 3-5 个该岗位通常要求、但用户简历中暂时欠缺的经历/技能缺口。
- gap 必须具体（不是"需要沟通能力"，而是"缺乏跨团队项目协作的实战案例"）
- 结合简历摘要判断用户"已有什么"，只列出真正缺的
- why_gap 说明这个 gap 对该岗位的重要性

【步骤 2 — 设计补强项目】
基于这些 gap，设计 2-3 个可在 2-4 周内独立完成的补强项目。

【反编造硬约束 — 永远不许违反】
1. 永远不输出公司名 / 产品名 / 学校名
2. weekly_plan 里的 task 是"计划"，不能写"已完成 N 次访谈"这种事实
3. 不承诺具体成果数字（"可使命中率提升 30%"→禁止）
4. deliverables 必须是真实可拿出来的东西（数据集/Dashboard/PRD/访谈纪要等）

【输出格式 — 严格 JSON，无任何 markdown 包裹】
{
  "gaps": [
    { "jd_requirement": "<该岗位要求的经历/技能>", "why_gap": "<为什么这个缺口重要 ≤40字>", "fixable": "<2-4周内如何弥补>" }
  ],
  "projects": [
    {
      "source_gaps": [{ "jd_requirement": "...", "why_gap": "..." }],
      "target_role": null,
      "target_company": null,
      "title": "<≤24字，具体场景化>",
      "why": "<≤120字，解释为什么这个项目能补这些 gap>",
      "weeks": 2,
      "weekly_plan": [
        {
          "week": 1,
          "goal": "<本周里程碑>",
          "tasks": [
            { "id": "w1-d1-a1b2", "day": "Day 1", "task": "...", "hours": "2h" }
          ]
        }
      ],
      "deliverables": ["<可拿出来的具体产出>"],
      "metrics_dictionary": [
        { "name": "<指标名>", "definition": "<定义>", "data_source": "<数据来源>" }
      ],
      "skills_required": ["<技能>"]
    }
  ]
}`;
}

function buildUserPrompt(body: RequestBody): string {
  const { targetRole, targetIndustry, evidenceSummary, evidenceTags, n = 2 } = body;
  const industryStr = targetIndustry ? `（${targetIndustry}行业）` : "";
  const resumeBlock = evidenceSummary
    ? `\n[用户简历摘要]\n${evidenceSummary}${evidenceTags?.length ? `\n标签：${evidenceTags.join("、")}` : ""}`
    : "\n[简历摘要]\n用户未提供简历，请根据该岗位的通用要求推断缺口。";

  return `目标岗位：${targetRole}${industryStr}
${resumeBlock}

请：
1. 推断 3-5 个该岗位的经历缺口（结合简历判断用户真正缺什么）
2. 设计 ${n} 个 2-4 周可完成的补强项目
返回 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const { targetRole } = body;

    if (!targetRole || typeof targetRole !== "string" || !targetRole.trim()) {
      return NextResponse.json(
        { error: "targetRole is required" },
        { status: 400 },
      );
    }

    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(body) },
      ],
      {
        model: "chat",
        temperature: 0.7,
        max_tokens: 2500,
        jsonMode: true,
      },
    );

    let parsed: { gaps?: M4SourceGap[]; projects?: M4ProjectDraft[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[generate-from-role] JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常，请重试", raw },
        { status: 502 },
      );
    }

    const gaps = Array.isArray(parsed.gaps) ? parsed.gaps : [];
    const projects = Array.isArray(parsed.projects) ? parsed.projects : [];

    if (projects.length === 0) {
      return NextResponse.json(
        { error: "LLM 未返回有效项目，请重试" },
        { status: 502 },
      );
    }

    return NextResponse.json({ gaps, projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[generate-from-role] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
