"use client";

/**
 * useTrackerDBSync — 求职记录双写 hook（localStorage + DB）
 *
 * 游客：只写 localStorage（调用方自行维护）
 * 登录：额外同步到 tracker_applications 表
 *   - add/edit → upsert（id 对齐，精准覆盖）
 *   - delete  → delete by id
 *   - 初次加载且 localStorage 无真实数据 → 从 DB 恢复
 *
 * isSample 数据永远不写 DB。
 */

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/auth/useUser";
import type { Application } from "@/lib/tracker-types";

export function useTrackerDBSync() {
  const { user, loading: userLoading } = useUser();

  const upsertApplication = useCallback(
    async (app: Application): Promise<void> => {
      if (!user || app.isSample) return;
      try {
        await createClient()
          .from("tracker_applications")
          .upsert({
            id: app.id,
            user_id: user.id,
            applied_at: app.appliedAt || null,
            status_updated_at: app.statusUpdatedAt || null,
            data_json: app,
          });
      } catch (err) {
        console.warn("[useTrackerDBSync] upsert failed:", err);
      }
    },
    [user],
  );

  const deleteApplication = useCallback(
    async (id: string): Promise<void> => {
      if (!user) return;
      try {
        await createClient()
          .from("tracker_applications")
          .delete()
          .eq("id", id)
          .eq("user_id", user.id);
      } catch (err) {
        console.warn("[useTrackerDBSync] delete failed:", err);
      }
    },
    [user],
  );

  /** 从 DB 加载全部真实记录（localStorage 无数据时的跨设备恢复） */
  const loadFromDB = useCallback(async (): Promise<Application[] | null> => {
    if (!user) return null;
    try {
      const { data } = await createClient()
        .from("tracker_applications")
        .select("data_json")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (!data || data.length === 0) return null;
      return data.map((r) => r.data_json as Application);
    } catch (err) {
      console.warn("[useTrackerDBSync] loadFromDB failed:", err);
      return null;
    }
  }, [user]);

  return { upsertApplication, deleteApplication, loadFromDB, userLoading };
}
