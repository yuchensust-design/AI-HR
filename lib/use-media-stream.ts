"use client";

/**
 * useMediaStream — getUserMedia 包装(client-only)
 *
 * 返回 stream 给摄像头预览 + ASR 麦克风;权限被拒 → 自动 fallback 到纯音频。
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type MediaPermission = "unknown" | "granted" | "denied" | "audio_only";

export function useMediaStream(opts: {
  wantVideo: boolean;
  enabled: boolean;
}) {
  const { wantVideo, enabled } = opts;
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<MediaPermission>("unknown");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setStream(null);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let acquired: MediaStream | null = null;

    async function acquire() {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: wantVideo,
          audio: true,
        });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        acquired = s;
        streamRef.current = s;
        setStream(s);
        setPermission("granted");
        setError(null);
      } catch (err) {
        if (cancelled) return;
        if (wantVideo) {
          // video 拒绝 → 尝试纯音频
          try {
            const s = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true,
            });
            if (cancelled) {
              s.getTracks().forEach((t) => t.stop());
              return;
            }
            acquired = s;
            streamRef.current = s;
            setStream(s);
            setPermission("audio_only");
            setError("摄像头被拒,已切换纯语音模式");
            return;
          } catch (err2) {
            const msg = err2 instanceof Error ? err2.message : String(err2);
            setPermission("denied");
            setError(`麦克风也被拒:${msg}`);
            return;
          }
        }
        const msg = err instanceof Error ? err.message : String(err);
        setPermission("denied");
        setError(msg);
      }
    }

    acquire();

    return () => {
      cancelled = true;
      if (acquired) {
        acquired.getTracks().forEach((t) => t.stop());
      }
    };
  }, [enabled, wantVideo]);

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { stream, permission, error, stop };
}
