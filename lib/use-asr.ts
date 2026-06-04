"use client";

/**
 * useASR — 三模式 ASR hook(client-only)
 *
 * 优先级:volc(火山 Seed ASR 2.0)→ web_speech(浏览器内置)→ text_input(用户打字)
 *
 * 用法:
 *   const asr = useASR({ onInterim, onFinal, onError });
 *   asr.start(micStream);   // micStream 来自 useCamera 的 getUserMedia
 *   asr.stop();
 *   asr.mode  // "volc" | "web_speech" | "text_input" | null
 *   asr.error // null | string
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchAsrToken,
  startVolcAsrSession,
  type AsrCallbacks,
  type AsrTokenResponse,
} from "./volc-asr-client";

export type AsrMode = "volc" | "web_speech" | "text_input" | null;

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onend: (() => void) | null;
};

type GlobalWithSR = typeof globalThis & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const g = window as unknown as GlobalWithSR;
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

export type UseAsrOpts = {
  onInterim?: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (msg: string) => void;
};

export function useASR(opts: UseAsrOpts) {
  const [mode, setMode] = useState<AsrMode>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  }, [opts]);

  const volcSessionRef = useRef<{
    stop: () => void;
    sendAudio: (chunk: Blob) => void;
  } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const sRecRef = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    setRunning(false);
    if (volcSessionRef.current) {
      try {
        volcSessionRef.current.stop();
      } catch {
        /* ignore */
      }
      volcSessionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        /* ignore */
      }
      mediaRecorderRef.current = null;
    }
    if (sRecRef.current) {
      try {
        sRecRef.current.stop();
      } catch {
        /* ignore */
      }
      sRecRef.current = null;
    }
  }, []);

  const startVolc = useCallback(
    async (
      token: AsrTokenResponse,
      micStream: MediaStream
    ): Promise<boolean> => {
      const callbacks: AsrCallbacks = {
        onInterim: (t) => optsRef.current.onInterim?.(t),
        onFinal: (t) => optsRef.current.onFinal?.(t),
        onError: (err) => {
          setError(err.message);
          optsRef.current.onError?.(err.message);
        },
        onClose: () => {
          setRunning(false);
        },
      };
      const session = startVolcAsrSession(token, callbacks);
      try {
        await Promise.race([
          session.ready,
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("volc ASR WS open timeout")), 4000)
          ),
        ]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[useASR] volc ws open failed, fallback to web_speech:", msg);
        try {
          session.stop();
        } catch {
          /* ignore */
        }
        return false;
      }
      volcSessionRef.current = session;
      // MediaRecorder timeslice=200ms 切 webm 切片送 WS
      try {
        const rec = new MediaRecorder(micStream, {
          mimeType: "audio/webm;codecs=opus",
        });
        rec.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            session.sendAudio(ev.data);
          }
        };
        rec.start(200);
        mediaRecorderRef.current = rec;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[useASR] MediaRecorder start failed:", msg);
        try {
          session.stop();
        } catch {
          /* ignore */
        }
        return false;
      }
      return true;
    },
    []
  );

  const startWebSpeech = useCallback((): boolean => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return false;
    try {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "zh-CN";
      rec.onresult = (ev: unknown) => {
        const e = ev as {
          resultIndex?: number;
          results: ArrayLike<{
            0: { transcript: string };
            isFinal: boolean;
          }>;
        };
        const startIdx = e.resultIndex ?? 0;
        let interim = "";
        for (let i = startIdx; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r) continue;
          if (r.isFinal) {
            optsRef.current.onFinal?.(r[0].transcript);
          } else {
            interim += r[0].transcript;
          }
        }
        if (interim) optsRef.current.onInterim?.(interim);
      };
      rec.onerror = (ev: unknown) => {
        const e = ev as { error?: string };
        const msg = `web speech error: ${e.error ?? "unknown"}`;
        setError(msg);
        optsRef.current.onError?.(msg);
      };
      rec.onend = () => {
        setRunning(false);
      };
      rec.start();
      sRecRef.current = rec;
      return true;
    } catch (err) {
      console.warn("[useASR] web speech start failed:", err);
      return false;
    }
  }, []);

  const start = useCallback(
    async (micStream: MediaStream | null) => {
      setError(null);
      setRunning(true);

      // 1. 尝试火山
      if (micStream) {
        try {
          const token = await fetchAsrToken();
          if (!token.fallback_mode && token.ws_url) {
            const ok = await startVolc(token, micStream);
            if (ok) {
              setMode("volc");
              return;
            }
          }
        } catch (err) {
          console.warn("[useASR] volc path failed:", err);
        }
      }

      // 2. 尝试 Web Speech API
      const wsOk = startWebSpeech();
      if (wsOk) {
        setMode("web_speech");
        return;
      }

      // 3. 兜底 text_input
      setMode("text_input");
      setError("浏览器不支持语音识别 — 请用文字输入答案");
      setRunning(false);
    },
    [startVolc, startWebSpeech]
  );

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { mode, running, error, start, stop };
}
