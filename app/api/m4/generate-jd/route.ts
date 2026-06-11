/**
 * POST /api/m4/generate-jd — 按岗位名生成一份贴近市场的中文 JD(纯文本)
 *
 * 用途:补项目里用户没贴真实 JD 时,让 AI 生成一份填进 JD 框给用户看(可编辑),
 *      再据此做差距分析。统一所有入口(m1 / m3 / 直接进来)的"岗位要求来源"。
 *
 * Body: { roleName: string, city?: string }
 * Resp: { jdText: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

export const maxDuration = 60; // 调 LLM,防 Vercel 默认 10s 静默超时

const MAX_ROLE_LEN = 60;

function buildPrompt(roleName: string, city?: string): string {
  return `你是资深招聘 HR。请按岗位名生成一份**贴近中国就业市场真实水平**的中文 JD(纯文本,不要 markdown 代码块)。

岗位名:${roleName}${city ? `\n城市:${city}` : ""}

要求:
- 结构清晰,包含这几段:岗位概述、岗位职责(3-5 条)、任职要求(硬性,4-6 条)、加分项(2-3 条)。
- 贴近该岗位**应届/初级**的真实要求,不要写成资深/总监级。
- 只写这个岗位本身的要求,**不要掺入其它岗位或跨领域**的内容。
- 简洁,总长 250-450 字。直接输出 JD 正文,不要任何额外说明。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const roleName = String(body.roleName ?? "").trim().slice(0, MAX_ROLE_LEN);
    const city = body.city ? String(body.city).trim().slice(0, 20) : undefined;

    if (!roleName) {
      return NextResponse.json({ error: "roleName required" }, { status: 400 });
    }

    const raw = await chat(
      [
        { role: "system", content: "你按岗位名生成贴近真实市场的中文 JD,只输出 JD 正文。" },
        { role: "user", content: buildPrompt(roleName, city) },
      ],
      { model: "chat", temperature: 0.4, max_tokens: 900 },
    );

    const jdText = (raw ?? "").trim();
    if (!jdText) {
      return NextResponse.json({ error: "生成失败,请重试" }, { status: 502 });
    }

    return NextResponse.json({ jdText });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m4/generate-jd error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
