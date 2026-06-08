/**
 * POST /api/m3/refine-edit — m3 简历对比的两种"再改"
 *
 * mode = "regen"   : 换个写法 — 对单条 edit 重生成 suggested_text(同 id,新文案)
 * mode = "instruct": 跟 AI 再改 — 用户自然语言指令(eg "把项目经历改得更技术"),
 *                    基于现有 edits 产出 新增/替换的 edit(s) 合并回去
 *
 * Anti-fabrication:两种模式都不许编造用户简历里没有的数字 / 工具 / 经历。
 *
 * Body:
 *   { mode: "regen", edit: EditSuggestion, parsedResume, jdContext }
 *   { mode: "instruct", instruction: string, edits: EditSuggestion[], parsedResume, jdContext }
 *
 * 返回:
 *   regen:    { edit: { suggested_text, reason } }
 *   instruct: { edits: EditSuggestion[], reply: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

const ANTI_FAB = `【铁律 — anti-fabrication】
- 绝不编造用户简历 / 经历里没有的数字、工具、公司、成果
- 只能改写表达 / 调整角度 / 补 JD 关键词(前提是简历真有对应能力)
- 需要用户填的具体数字,用占位符【请补充 X】,不要自己编
- 不绝对化、不夸大`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode === "instruct" ? "instruct" : "regen";
    const parsedResume = body.parsedResume ?? null;
    const jdContext = body.jdContext ?? null;
    const jdLine = jdContext
      ? `目标 JD:${jdContext.jd_summary ?? ""} / must_have: ${(jdContext.must_have ?? []).join("、")}`
      : "无 JD(通用优化)";

    if (mode === "regen") {
      const edit = body.edit;
      if (!edit || !edit.original_text) {
        return NextResponse.json({ error: "edit required" }, { status: 400 });
      }
      const prompt = `你是资深简历优化师。下面这条简历改写建议,用户想要"换个写法"。请用**不同的角度/措辞**重写一版,质量不低于原版。

${ANTI_FAB}

${jdLine}

原文:${edit.original_text}
当前改写:${edit.suggested_text}
改写理由:${edit.reason ?? ""}

请只返 JSON:{ "suggested_text": "新的改写(≤ 80 字,和当前版本明显不同)", "reason": "1 句新理由 ≤ 40 字" }`;

      const raw = await chat([{ role: "user", content: prompt }], {
        model: "chat",
        temperature: 0.8,
        max_tokens: 500,
        jsonMode: true,
      });
      let parsed: { suggested_text?: string; reason?: string };
      try {
        parsed = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "LLM 返回格式异常" }, { status: 502 });
      }
      return NextResponse.json({
        edit: {
          suggested_text: String(parsed.suggested_text ?? edit.suggested_text),
          reason: String(parsed.reason ?? edit.reason ?? ""),
        },
      });
    }

    // ===== instruct 模式 =====
    const instruction = String(body.instruction ?? "").trim();
    const edits = Array.isArray(body.edits) ? body.edits : [];
    if (!instruction) {
      return NextResponse.json({ error: "instruction required" }, { status: 400 });
    }

    const editsBrief = edits
      .map(
        (e: { id: string; target?: string; original_text?: string; suggested_text?: string; category?: string }) =>
          `- [${e.id}] (${e.category ?? ""}) ${e.target ?? ""}\n  原文: ${e.original_text ?? ""}\n  现建议: ${e.suggested_text ?? ""}`,
      )
      .join("\n");

    const prompt = `你是资深简历优化师,正在和用户对话帮他再改简历。用户给了一条指令,你要据此**修改已有建议**或**新增建议**。

${ANTI_FAB}

${jdLine}

用户简历(结构化):
${JSON.stringify(parsedResume, null, 2).slice(0, 4000)}

当前已有的改写建议清单:
${editsBrief || "(暂无)"}

用户指令:"${instruction}"

要求:
- 如果指令针对已有某条建议(eg "第 2 条改得更技术"/"项目经历加 SQL"),复用它的 id,产出修改后的同 id edit
- 如果指令要求新角度的改进,产出新 edit(id 用 "refine-" 前缀 + 数字,eg "refine-1")
- 每条 edit 必须含:id, target, original_text, suggested_text, reason, category, priority, claim_type, source, confidence
- target 用已有建议的 target,或简历里真实的位置(eg "projects[0].bullets[1]")
- 最多产 4 条
- reply 用一句自然口语回应用户(像朋友帮忙,≤ 40 字)

只返 JSON:
{
  "edits": [ { "id":"...", "target":"...", "original_text":"...", "suggested_text":"...", "reason":"...", "category":"ats-keyword|narrative-tools|quantification|tech-deepening", "priority":"high|medium|low", "claim_type":"explicit|inferred|needs_confirmation", "source":"resume|jd|experience", "confidence":0.8 } ],
  "reply": "一句口语回应"
}`;

    const raw = await chat([{ role: "user", content: prompt }], {
      model: "chat",
      temperature: 0.6,
      max_tokens: 2000,
      jsonMode: true,
    });
    let parsed: { edits?: unknown[]; reply?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
    }
    const outEdits = Array.isArray(parsed.edits) ? parsed.edits.slice(0, 4) : [];
    return NextResponse.json({
      edits: outEdits,
      reply: String(parsed.reply ?? `好,改了 ${outEdits.length} 处。`),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    console.error("/api/m3/refine-edit error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
