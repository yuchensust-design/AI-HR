/**
 * 火山 Seed ASR Streaming 2.0 浏览器 client(client-side only)
 *
 * 流程:
 *   1. 前端 fetch /api/m5/asr-token 拿 ws_url + headers(后端签发)
 *   2. 这里 new WebSocket(ws_url) — 注:浏览器 WebSocket 不能加自定义 headers,
 *      所以 v1 把 token 拼到 query string(火山 ASR 也支持 query auth)
 *   3. MediaRecorder 切片(timeslice=200ms),onmessage 接 transcript 回调
 *
 * Day 2 实测要 fine-tune:
 *   - 实际 WSS URL(火山 Seed ASR 2.0 / SAUC 区别)
 *   - 是否需要 binary 协议 first frame(config json)
 *   - 鉴权方式(query token vs subprotocol)
 */

export type AsrTokenResponse = {
  ws_url: string;
  headers: Record<string, string>;
  expires_at: number;
  fallback_mode: boolean;
  reason?: string;
};

export type AsrCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: Error) => void;
  onClose: () => void;
};

export async function fetchAsrToken(): Promise<AsrTokenResponse> {
  const res = await fetch("/api/m5/asr-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    throw new Error(`asr-token fetch failed: ${res.status}`);
  }
  return (await res.json()) as AsrTokenResponse;
}

/**
 * 启动火山 ASR streaming session
 *
 * 返回 { stop, sendAudio }:
 *   - sendAudio(chunk): MediaRecorder ondataavailable 时调,把 Blob 切片送 WS
 *   - stop(): 关 WS + 通知 onClose
 *
 * 注意:浏览器 new WebSocket() 不能加 custom headers,所以鉴权需要走 query / subprotocol。
 * v1 假设火山支持 query token(`?token=xxx`),Day 2 实测调整。
 */
export function startVolcAsrSession(
  token: AsrTokenResponse,
  callbacks: AsrCallbacks
): { stop: () => void; sendAudio: (chunk: Blob) => void; ready: Promise<void> } {
  const params = new URLSearchParams({
    app_key: token.headers["X-Api-App-Key"] ?? "",
    access_key: token.headers["X-Api-Access-Key"] ?? "",
    resource_id: token.headers["X-Api-Resource-Id"] ?? "",
    request_id: token.headers["X-Api-Request-Id"] ?? "",
  });
  const fullUrl = `${token.ws_url}?${params.toString()}`;

  let ws: WebSocket | null = null;
  let closed = false;

  const ready = new Promise<void>((resolve, reject) => {
    try {
      ws = new WebSocket(fullUrl);
      ws.binaryType = "arraybuffer";
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    ws.onopen = () => {
      // 火山 ASR 2.0 通常第一帧是 config JSON
      const initFrame = {
        type: "config",
        format: "webm-opus", // MediaRecorder 默认产 audio/webm;codecs=opus
        sample_rate: 16000,
        bits: 16,
        channel: 1,
        lang: "zh-CN",
      };
      try {
        ws?.send(JSON.stringify(initFrame));
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    };

    ws.onerror = (ev) => {
      const err = new Error(`volc ASR WS error: ${String(ev)}`);
      callbacks.onError(err);
      reject(err);
    };

    ws.onmessage = (ev) => {
      try {
        const payload =
          typeof ev.data === "string"
            ? JSON.parse(ev.data)
            : { type: "binary" };
        const text =
          (payload.text as string) ??
          (payload.transcript as string) ??
          (payload.result as string) ??
          "";
        const isFinal =
          Boolean(payload.is_final ?? payload.final ?? payload.eos) ||
          payload.type === "final";
        if (!text) return;
        if (isFinal) callbacks.onFinal(text);
        else callbacks.onInterim(text);
      } catch (err) {
        console.warn("[volc-asr] parse message failed", err);
      }
    };

    ws.onclose = () => {
      closed = true;
      callbacks.onClose();
    };
  });

  const sendAudio = (chunk: Blob) => {
    if (!ws || closed) return;
    if (ws.readyState !== WebSocket.OPEN) return;
    chunk
      .arrayBuffer()
      .then((buf) => {
        try {
          ws?.send(buf);
        } catch (err) {
          console.warn("[volc-asr] send failed", err);
        }
      })
      .catch((err) => console.warn("[volc-asr] arrayBuffer failed", err));
  };

  const stop = () => {
    if (!ws || closed) return;
    try {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end" }));
      }
      ws.close();
    } catch {
      // ignore
    }
  };

  return { stop, sendAudio, ready };
}
