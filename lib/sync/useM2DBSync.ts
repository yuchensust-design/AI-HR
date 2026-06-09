"use client";

/**
 * useM2DBSync — M2「挖经历」per-conversation 数据同步(plan §8.24,照 useM3DBSync 模式)
 *
 * 游客:不落 DB(页面走 localStorage 单轨,按会话 scope)
 * 登录:按 ?c={conversationId} 读写 m2_intakes 表 → 每个会话独立数据(多会话隔离)
 *
 * DB:m2_intakes.intake_json = { intake, bullets, fills }
 */

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";

export type M2Payload = { intake?: unknown; bullets?: unknown; fills?: unknown };

export function useM2DBSync() {
  const convId = useSearchParams().get("c");
  const { user, loading: userLoading } = useUser();
  const userId = user?.id ?? null;

  const [dbData, setDbData] = useState<M2Payload | null>(null);
  const [loading, setLoading] = useState(true);
  // isReady = 已知该用哪条数据(游客立即 ready;登录则 DB 拉完才 ready)
  const isReady = !userLoading && (!userId || !loading);

  useEffect(() => {
    let cancelled = false;
    if (userLoading) return;
    if (!userId || !convId) {
      setDbData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    createClient()
      .from("m2_intakes")
      .select("intake_json")
      .eq("conversation_id", convId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const j = (data?.intake_json as M2Payload) ?? null;
        setDbData(j);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, userLoading, convId]);

  /** 写回当前会话(fire-and-forget) */
  const syncToDb = useCallback(
    async (intake: unknown, bullets: unknown, fills: unknown): Promise<void> => {
      if (!userId || !convId) return;
      try {
        await createClient()
          .from("m2_intakes")
          .update({ intake_json: { intake, bullets, fills } })
          .eq("conversation_id", convId);
      } catch (err) {
        console.warn("[useM2DBSync] sync failed:", err);
      }
    },
    [userId, convId],
  );

  /** 读当前会话(登录 + 有 conv 时) */
  const loadFromDB = useCallback(async (): Promise<M2Payload | null> => {
    if (!userId || !convId) return null;
    try {
      const { data } = await createClient()
        .from("m2_intakes")
        .select("intake_json")
        .eq("conversation_id", convId)
        .maybeSingle();
      return (data?.intake_json as M2Payload) ?? null;
    } catch {
      return null;
    }
  }, [userId, convId]);

  return { user, convId, dbData, loading, isReady, syncToDb, loadFromDB, isGuest: !userId };
}
