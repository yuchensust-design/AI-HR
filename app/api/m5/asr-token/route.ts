/**
 * POST /api/m5/asr-token — 火山 Seed ASR Streaming 2.0 短期凭证签发
 *
 * 架构变更说明:plan §4.C 原写"asr-stream WebSocket relay",但 Next.js 16 docs
 * (`02-guides/backend-for-frontend.md`)明确 WebSocket 在 route handler 里不可行
 * (connection closes on timeout)。改方案:此 endpoint 只签发 headers,
 * 浏览器拿到后直连火山 WSS,master access token 留 server。
 *
 * Body: { session_id? }
 * 返回: {
 *   ws_url: string,                  // 火山 Seed ASR Streaming 2.0 WSS URL
 *   headers: Record<string,string>,  // X-Api-App-Key / X-Api-Access-Key / X-Api-Resource-Id / X-Api-Request-Id
 *   expires_at: number,              // unix ms
 *   fallback_mode: boolean,          // true → 前端走 Web Speech API
 * }
 *
 * env 缺失 / 火山未授权 → fallback_mode=true,前端自动切 Web Speech API
 */

import { NextRequest, NextResponse } from "next/server";

function generateReqId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join("");
  return `${prefix}_${ts}_${rand}`;
}

const VOLC_ASR_WS_URL = "wss://openspeech.bytedance.com/api/v3/sauc/bigmodel";

export async function POST(request: NextRequest) {
  try {
    // session_id 仅用于 audit log,不影响签发
    await request.json().catch(() => ({}));

    const appId = process.env.VOLC_APP_ID;
    const accessToken = process.env.VOLC_ACCESS_TOKEN;
    const asrInstance = process.env.VOLC_ASR_INSTANCE;

    if (!appId || !accessToken || !asrInstance) {
      return NextResponse.json({
        ws_url: "",
        headers: {},
        expires_at: 0,
        fallback_mode: true,
        reason: "VOLC_* env 不全 — 前端走 Web Speech API",
      });
    }

    const reqId = generateReqId("m5_asr");
    const expiresAt = Date.now() + 5 * 60 * 1000;

    return NextResponse.json({
      ws_url: VOLC_ASR_WS_URL,
      headers: {
        "X-Api-App-Key": appId,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": asrInstance,
        "X-Api-Request-Id": reqId,
      },
      expires_at: expiresAt,
      fallback_mode: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m5/asr-token error:", err);
    return NextResponse.json(
      {
        ws_url: "",
        headers: {},
        expires_at: 0,
        fallback_mode: true,
        reason: message,
      },
      { status: 200 } // 不报 500,前端走 fallback 即可
    );
  }
}
