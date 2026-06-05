/**
 * POST /api/m3/rewrite-bullet — "🔁 换个拟法"单条重生
 *
 * Body: { edit: EditSuggestion, parsedResume, jdContext? }
 * 输出:{ suggested_text: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import {
  buildSourceCorpus,
  normalizeSuggestedText,
} from "@/lib/m3-normalize";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { edit, parsedResume, jdContext, hiddenExperiences, fromDebriefHighlight } = body;

    if (!edit || !edit.original_text) {
      return NextResponse.json({ error: "edit + original_text required" }, { status: 400 });
    }

    const systemPrompt = `你是「Offer 捕手」改写引擎。

【任务】
用户对某条建议"想换个拟法"。请用**不同的角度 / 不同的动词 / 不同的量化方式**重写。

【硬约束】
1. 永远不输出公司名
2. Anti-fabrication:不编造原始素材没有的数字
3. STAR / X-Y-Z 格式,30-80 字
4. 不能跟用户上一次看到的 suggested_text 太像(必须明显不同)

【输出 JSON】
{ "suggested_text": "新的改写..." }`;

    const userPrompt = `原文:
${edit.original_text}

之前的改写(请避免雷同):
${edit.suggested_text}

reason 上下文:
${edit.reason}

category: ${edit.category}

JD context: ${JSON.stringify(jdContext ?? null, null, 2).slice(0, 800)}

用户简历 basic: ${JSON.stringify((parsedResume as { basic?: unknown })?.basic ?? {})}

返 JSON。`;

    const raw = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "chat", temperature: 0.7, max_tokens: 500, jsonMode: true }
    );

    let parsed: { suggested_text?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "LLM JSON parse failed", raw: raw.slice(0, 300) }, { status: 502 });
    }

    // 反编造 normalize:数字溯源校验 + 强承诺词审查(offer-1-sparkling-hippo)
    const corpus = buildSourceCorpus({
      parsedResume,
      jdContext,
      hiddenExperiences,
      fromDebriefHighlight,
    });
    const [safeText, report] = normalizeSuggestedText(
      String(parsed.suggested_text ?? ""),
      corpus,
      edit.claim_type,
    );

    return NextResponse.json({
      suggested_text: safeText,
      claim_type: report.resolvedClaimType,
      fab_normalized: report.modified,
      replaced_tokens: report.replacedTokens,
      strong_claims_hit: report.strongClaimsHit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/rewrite-bullet error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
