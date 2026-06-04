/**
 * POST /api/m5/tts — 模块 5 模拟面试 TTS server-side proxy
 *
 * Body: { text: string, persona: "gentle"|"strict"|"rigor", speed?: number }
 * 返回: { audio_base64: "data:audio/mp3;base64,...", voice_id: string }
 *
 * 火山 SeedTTS HTTP v1 单次合成(15-30 字 < 2s)。
 * key 全留 server env,绝不下发前端。
 * 失败 → 前端降级到纯文字模式(右半屏大字渲染问题)。
 */

import { NextRequest, NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/volc-tts";
import type { PersonaKey } from "@/lib/interview-types";

const VALID_PERSONAS: readonly PersonaKey[] = [
  "gentle",
  "strict",
  "rigor",
] as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      text?: string;
      persona?: string;
      speed?: number;
    };

    const text = (body.text ?? "").toString();
    const personaRaw = (body.persona ?? "") as PersonaKey;
    const persona = VALID_PERSONAS.includes(personaRaw)
      ? personaRaw
      : "gentle";
    const speed =
      typeof body.speed === "number" && body.speed >= 0.5 && body.speed <= 2
        ? body.speed
        : 1.0;

    if (!text.trim()) {
      return NextResponse.json(
        { error: "text 必填" },
        { status: 400 }
      );
    }
    if (text.length > 1000) {
      return NextResponse.json(
        { error: "text 超长(≤ 1000)" },
        { status: 400 }
      );
    }

    const { audio_base64, voice_id } = await synthesizeSpeech(text, persona, {
      speed,
    });

    return NextResponse.json({
      audio_base64: `data:audio/mp3;base64,${audio_base64}`,
      voice_id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m5/tts error:", err);
    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
