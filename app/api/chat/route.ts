import { NextRequest, NextResponse } from "next/server";
import { chat, type ChatMessage } from "@/lib/llm";

/**
 * POST /api/chat — 通用 LLM 对话 endpoint
 *
 * Body:
 *   {
 *     messages: [{ role, content }, ...],
 *     model?: 'chat' | 'reasoner',
 *     temperature?: number
 *   }
 *
 * 返回:
 *   { content: string }
 *
 * v1 客户端调用统一通过这个 proxy(API key 留后端,前端不持)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, model, temperature, max_tokens } = body as {
      messages: ChatMessage[];
      model?: "chat" | "reasoner";
      temperature?: number;
      max_tokens?: number;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages required" },
        { status: 400 }
      );
    }

    const content = await chat(messages, { model, temperature, max_tokens });

    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LLM API error:", err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chat — 健康检查 + key 配置检查
 */
export async function GET() {
  const hasKey = !!process.env.DEEPSEEK_API_KEY;
  return NextResponse.json({
    status: "ok",
    provider: "DeepSeek (V3.1)",
    keyConfigured: hasKey,
    message: hasKey
      ? "Ready to chat"
      : "⚠️ DEEPSEEK_API_KEY not set — see .env.example",
  });
}
