/**
 * 火山 SeedTTS 2.0 HTTP v3 unidirectional client(server-side)
 *
 * 文档:豆包语音 v3 - https://www.volcengine.com/docs/6561/1096680
 *      音色列表 - https://www.volcengine.com/docs/6561/1257544
 *      接入手册 - https://blog.ax0x.ai/doubao-tts-runbook-zh
 *
 * 关键差异(v3 vs 我们最早写的 v1):
 *   - URL:/api/v1/tts → /api/v3/tts/unidirectional
 *   - 鉴权:Authorization: Bearer;token → X-Api-App-Id / X-Api-Access-Key / X-Api-Resource-Id
 *   - Resource:cluster body 字段 → X-Api-Resource-Id header (seed-tts-2.0)
 *   - Body:{app, user, audio, request} → {user, req_params: {text, speaker, audio_params}}
 *   - voice 字段名:voice_type → speaker
 *   - voice 命名:zh_female_qiniang_v2 → zh_female_<name>_moon_bigtts
 *   - Response:单 JSON {data: base64} → NDJSON 流(每行 {code, data}),需拼 base64 chunks
 *
 * 3 性格 voice hardcode(试用免费档,Day 1 实测可调到付费档):
 *   - gentle 亲切姐姐 → 双快思思(女声活泼亲切)
 *   - strict 严厉压力 → 京腔卡爷(男声沉稳带 energy)
 *   - rigor 严谨技术 → 温暖阿虎(男声温暖理性)
 */

import type { PersonaKey } from "./interview-types";

/**
 * voice + speech_rate 双信号区分性格(账号实测开通 3 voice,刚好对应 3 性格)
 *   gentle 亲切姐姐 → 思思活泼女声 · 语速适中(0%)
 *   strict 严厉压力 → vv 知性女声 · 语速快(+25%,有压迫感)
 *   rigor 严谨技术 → 阿虎温暖男声 · 语速稍快(+10%,理性紧凑)
 */
export const VOICE_MAP: Record<PersonaKey, string> = {
  gentle: "zh_female_shuangkuaisisi_uranus_bigtts",
  strict: "zh_female_vv_uranus_bigtts",
  rigor: "zh_male_wennuanahu_uranus_bigtts",
};

export const SPEECH_RATE_MAP: Record<PersonaKey, number> = {
  gentle: 0,
  strict: 25,
  rigor: 10,
};

export const FALLBACK_VOICE = "zh_female_vv_uranus_bigtts";

const TTS_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/tts/unidirectional";
const TTS_RESOURCE_ID = "seed-tts-2.0";
const STREAM_END_CODE = 20000000;

export type SynthesizeResult = {
  audio_base64: string;
  voice_id: string;
};

function generateReqId(): string {
  const ts = Date.now().toString(36);
  const rand = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join("");
  return `m5_tts_${ts}_${rand}`;
}

async function callTtsV3(
  appId: string,
  accessToken: string,
  voice: string,
  text: string,
  opts: { speechRate?: number; sampleRate?: number }
): Promise<string> {
  const body = {
    user: { uid: "m5_user" },
    req_params: {
      text,
      speaker: voice,
      audio_params: {
        format: "mp3",
        sample_rate: opts.sampleRate ?? 24000,
        ...(opts.speechRate ? { speech_rate: opts.speechRate } : {}),
      },
    },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(TTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-App-Id": appId,
        "X-Api-Access-Key": accessToken,
        "X-Api-Resource-Id": TTS_RESOURCE_ID,
        "X-Api-Request-Id": generateReqId(),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`火山 TTS HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const raw = await res.text();
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let audioB64 = "";
  let lastErr: { code: number; message: string } | null = null;
  for (const line of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const code = Number(obj.code ?? obj.Code ?? -1);
    const dataStr =
      typeof obj.data === "string"
        ? obj.data
        : typeof obj.audio === "string"
          ? obj.audio
          : "";
    if (code === 0 && dataStr) {
      audioB64 += dataStr;
    } else if (code === STREAM_END_CODE) {
      break;
    } else if (code !== 0 && code !== -1) {
      lastErr = {
        code,
        message: String(obj.message ?? obj.Message ?? "(无 message)"),
      };
    }
  }

  if (!audioB64) {
    if (lastErr) {
      throw new Error(`火山 TTS 返回 code=${lastErr.code} msg=${lastErr.message}`);
    }
    throw new Error(`火山 TTS 返回空音频 (raw len=${raw.length})`);
  }
  return audioB64;
}

export async function synthesizeSpeech(
  text: string,
  persona: PersonaKey,
  opts: { speed?: number; sampleRate?: number } = {}
): Promise<SynthesizeResult> {
  const appId = process.env.VOLC_APP_ID;
  const accessToken = process.env.VOLC_ACCESS_TOKEN;

  if (!appId || !accessToken) {
    throw new Error("VOLC_APP_ID / VOLC_ACCESS_TOKEN 未配置 — TTS 不可用");
  }

  const trimmed = text.trim().slice(0, 1000);
  if (!trimmed) {
    throw new Error("空文本");
  }

  const voiceId = VOICE_MAP[persona];
  // 性格基线语速 + 调用方 opts.speed 微调
  const baseRate = SPEECH_RATE_MAP[persona] ?? 0;
  const userDelta =
    opts.speed && opts.speed !== 1 ? Math.round((opts.speed - 1) * 100) : 0;
  const speechRate = Math.max(-50, Math.min(100, baseRate + userDelta));

  try {
    const audio = await callTtsV3(appId, accessToken, voiceId, trimmed, {
      speechRate,
      sampleRate: opts.sampleRate,
    });
    return { audio_base64: audio, voice_id: voiceId };
  } catch (err) {
    if (voiceId === FALLBACK_VOICE) throw err;
    const msg = err instanceof Error ? err.message : "";
    if (/voice|speaker|invalid|not found|权限|未授权|not granted/i.test(msg)) {
      console.warn(
        `[volc-tts] voice ${voiceId} 不可用, fallback → ${FALLBACK_VOICE}: ${msg}`
      );
      const audio = await callTtsV3(
        appId,
        accessToken,
        FALLBACK_VOICE,
        trimmed,
        { speechRate, sampleRate: opts.sampleRate }
      );
      return { audio_base64: audio, voice_id: FALLBACK_VOICE };
    }
    throw err;
  }
}
