/**
 * POST /api/m3/fill-keyword — JD 关键词缺口"我会用/略懂"→ 生成可直接进简历的补法
 *
 * 用户在关键词缺口里自评"会用/略懂"(简历没写),这里生成一条真实、可落地的补充表述,
 * 把这个技能/能力自然带进简历。采纳后该关键词命中、并写入最终简历(走 finalize-resume 的 new: 通道)。
 *
 * anti-fab:只补"措辞",绝不编经历/数字/项目。level 区分 会用 vs 略懂 的措辞强度。
 *
 * Body: { keyword, level, resumeText, jdContext?, instruction?, previous? }
 *   - instruction + previous:用户对上一版补法的反馈(如"会用 Figma 但不会 Axure"),据此改写
 * 返回: { suggestion, where }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

const SYSTEM = `你是简历优化助手。用户在"JD 关键词缺口"里自评了某个技能 —— 他【会用】或【略懂】,但简历里没写出来。
帮他生成一条**真实、可直接放进简历**的补充表述,把这个技能/能力自然带出来。

【铁律(anti-fabrication)— 违反即失败】
1. 只补"措辞表达",**绝不编造**新经历 / 新项目 / 数字 / 成果。用户说会用,就用稳妥方式把这个词写进"技能"或挂到他已有的某段经历上。
2. level=can(会用)→ 可写"熟练使用 / 能独立用 X 完成…";level=vague(略懂)→ **只能**写"了解 / 接触过 / 熟悉基本 X",不得夸大成熟练。
3. 一句话,简洁,中文,贴合简历书面语气,不要解释、不要前后缀。
4. 给出建议放在哪("技能区" 或 "结合某段经历补一句")。

输出严格 JSON:{ "suggestion": "可直接放进简历的一句话", "where": "技能区 / 经历补充" }`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const keyword = String(body.keyword ?? "").trim();
    const level = body.level === "can" ? "can" : "vague";
    const resumeText = String(body.resumeText ?? "").slice(0, 8000);
    const jdSummary =
      (body.jdContext && typeof body.jdContext === "object"
        ? String((body.jdContext as { jd_summary?: unknown }).jd_summary ?? "")
        : "") || "(未提供)";

    if (!keyword) {
      return NextResponse.json({ error: "keyword 不能为空" }, { status: 400 });
    }

    const instruction = String(body.instruction ?? "").trim();
    const previous = String(body.previous ?? "").trim();

    const refineBlock =
      instruction && previous
        ? `\n\n【上一版补法】${previous}\n【用户反馈,据此改写】${instruction}\n(严格遵循用户反馈 —— 比如他说"会 Figma 不会 Axure",就只保留 Figma、去掉 Axure,绝不写他否认的工具/技能)`
        : "";

    const user = `目标关键词:${keyword}
用户自评:${level === "can" ? "我会用(熟练)" : "略懂(了解/接触过)"}
目标岗位:${jdSummary}

【简历全文(用来判断挂到哪段经历更自然)】
${resumeText || "(未提供)"}${refineBlock}

返回 JSON。`;

    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { model: "chat", temperature: 0.3, max_tokens: 400, jsonMode: true }
    );

    let parsed: { suggestion?: unknown; where?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
    }

    const suggestion = String(parsed.suggestion ?? "").trim();
    if (!suggestion) {
      return NextResponse.json({ error: "未能生成补法,请重试" }, { status: 502 });
    }

    return NextResponse.json({
      suggestion,
      where: String(parsed.where ?? "技能区").trim(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/fill-keyword error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
