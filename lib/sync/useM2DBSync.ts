"use client";

/**
 * useM2DBSync — M2 经历挖掘数据双写 hook（localStorage + DB）
 *
 * 游客：只走 localStorage（同原来行为）
 * 登录：额外同步到 m2_intakes 表（master conversation 模式，同 useM4Projects）
 *
 * DB 存储结构：m2_intakes.intake_json = { intake: IntakeArtifact, bullets: CandidateBullet[] }
 */

import { useCallback, useEffect, useState } from "react";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { listConversations, createConversation } from "@/lib/conversations";

const CONV_CACHE_KEY = "m2_master_conv_id";

export function useM2DBSync() {
  const { user } = useUser();
  const [masterConvId, setMasterConvId] = useState<string | null>(null);

  // 找或创建"主 M2 会话"
  useEffect(() => {
    if (!user) return;
    const cached =
      typeof window !== "undefined"
        ? window.localStorage.getItem(CONV_CACHE_KEY)
        : null;
    if (cached) {
      setMasterConvId(cached);
      return;
    }
    listConversations("m2").then((convs) => {
      if (convs.length > 0) {
        const id = convs[0].id;
        window.localStorage.setItem(CONV_CACHE_KEY, id);
        setMasterConvId(id);
      } else {
        createConversation("m2", "我的经历挖掘").then((id) => {
          if (id) {
            window.localStorage.setItem(CONV_CACHE_KEY, id);
            setMasterConvId(id);
          }
        });
      }
    });
  }, [user]);

  /** 将 intake + bullets 同步到 DB（fire-and-forget） */
  const syncToDb = useCallback(
    async (intake: unknown, bullets: unknown): Promise<void> => {
      if (!user || !masterConvId) return;
      try {
        await createClient()
          .from("m2_intakes")
          .update({ intake_json: { intake, bullets } })
          .eq("conversation_id", masterConvId);
      } catch (err) {
        console.warn("[useM2DBSync] DB sync failed:", err);
      }
    },
    [user, masterConvId],
  );

  /** 从 DB 恢复（localStorage 为空时的跨设备场景） */
  const loadFromDB = useCallback(async (): Promise<{
    intake: unknown;
    bullets: unknown;
  } | null> => {
    if (!user || !masterConvId) return null;
    try {
      const { data } = await createClient()
        .from("m2_intakes")
        .select("intake_json")
        .eq("conversation_id", masterConvId)
        .maybeSingle();
      if (!data?.intake_json) return null;
      const j = data.intake_json as { intake?: unknown; bullets?: unknown };
      return { intake: j.intake ?? null, bullets: j.bullets ?? null };
    } catch (err) {
      console.warn("[useM2DBSync] loadFromDB failed:", err);
      return null;
    }
  }, [user, masterConvId]);

  return { syncToDb, loadFromDB, isReady: !!(user && masterConvId) };
}
