/**
 * POST /api/m3/skills-summary — 把分类技能 + 已确认补强,改写成自然语句的核心技能描述
 *
 * 用户反馈:核心技能"只有关键词、太松散",要"正常语句描述",且补充技能要并进核心技能。
 * 这里把 skillGroups(简历真实技能)+ fills(用户在缺口里确认的补强)整理成 3-5 条书面语句。
 *
 * anti-fab:只重组给定技能/补强,绝不新增、不夸大、不编造证书工具。
 *
 * Body: { skillGroups: [{category, items}], fills: string[] }
 * 返回: { lines: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

const SYSTEM = `你是简历"核心技能"板块写手。我会给你候选人的【技能分类】和【已确认的补充技能】,把它们整理成 3~5 条自然、专业的核心技能描述句。

【铁律 — 违反即失败】
1. 只用我给的技能 / 补充,**绝不新增、不夸大、不编造**证书 / 工具 / 能力。
2. 每条一句话,中文书面语,按"能力族"自然归并(如 产品能力 / AI 技术 / 工具 / 语言与证书 / 软技能),**不要"类别:词、词、词"那种罗列腔**,要读起来像描述。
3. 3~5 条,简洁有信息量,**不要空话**(禁止"具备极强的…""优秀的…")。
4. 把【补充技能】自然融进对应那条,不要单独堆在最后。

输出严格 JSON:{ "lines": ["第一条…", "第二条…", ...] }`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const groups = Array.isArray(body.skillGroups) ? body.skillGroups : [];
    const fills = Array.isArray(body.fills) ? body.fills.map(String).filter(Boolean) : [];

    const groupText = groups
      .map((g: { category?: unknown; items?: unknown }) => {
        const items = Array.isArray(g?.items) ? g.items.map(String).join("、") : "";
        return `- ${String(g?.category ?? "")}:${items}`;
      })
      .join("\n");

    if (!groupText && fills.length === 0) {
      return NextResponse.json({ lines: [] });
    }

    const user = `【技能分类】
${groupText || "(无)"}

【已确认的补充技能(用户在 JD 缺口里确认会用,需融进描述)】
${fills.length > 0 ? fills.map((f: string) => `- ${f}`).join("\n") : "(无)"}

返回 JSON。`;

    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { model: "chat", temperature: 0.4, max_tokens: 700, jsonMode: true }
    );

    let parsed: { lines?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
    }
    const lines = Array.isArray(parsed.lines)
      ? parsed.lines.map((x) => String(x).trim()).filter(Boolean)
      : [];
    return NextResponse.json({ lines });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/skills-summary error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
