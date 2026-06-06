"use client";

/**
 * useM4Projects — M4 项目列表双写 hook（localStorage + DB）
 *
 * 游客：只写 localStorage（同原来行为）
 * 登录：localStorage 优先；异步 upsert 到 m4_projects.learning_cards_json
 *
 * 关键设计：
 * - DB 用一个"主项目会话"（M4 master conv）保存整个 M4Project[] JSON
 * - convId 缓存在 localStorage（m4_master_conv_id）避免重复创建
 * - localStorage 为空时从 DB 反查（跨设备恢复）
 */

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, useLocalState } from "@/lib/use-local-state";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { listConversations, createConversation } from "@/lib/conversations";
import type { M4Project } from "@/lib/m4-types";

const CONV_CACHE_KEY = "m4_master_conv_id";

export function useM4Projects(): [
  M4Project[],
  (updater: M4Project[] | ((prev: M4Project[]) => M4Project[])) => void,
] {
  const { user } = useUser();
  const [projects, setProjectsLocal] = useLocalState<M4Project[]>(
    STORAGE_KEYS.M4_PROJECTS,
    [],
  );
  const [masterConvId, setMasterConvId] = useState<string | null>(null);

  // Step 1: 找或创建"主 M4 会话"（只在登录态执行）
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
    listConversations("m4").then((convs) => {
      if (convs.length > 0) {
        const id = convs[0].id;
        window.localStorage.setItem(CONV_CACHE_KEY, id);
        setMasterConvId(id);
      } else {
        createConversation("m4", "我的项目陪练").then((id) => {
          if (id) {
            window.localStorage.setItem(CONV_CACHE_KEY, id);
            setMasterConvId(id);
          }
        });
      }
    });
  }, [user]);

  // Step 2: localStorage 为空时从 DB 恢复（跨设备场景）
  useEffect(() => {
    if (!user || !masterConvId || projects.length > 0) return;
    createClient()
      .from("m4_projects")
      .select("learning_cards_json")
      .eq("conversation_id", masterConvId)
      .maybeSingle()
      .then(({ data }) => {
        if (
          data?.learning_cards_json &&
          Array.isArray(data.learning_cards_json) &&
          data.learning_cards_json.length > 0
        ) {
          setProjectsLocal(data.learning_cards_json as M4Project[]);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, masterConvId]);

  // DB 同步 — upsert 保证行存在时更新、不存在时插入
  const syncToDb = useCallback(
    async (next: M4Project[]) => {
      if (!user || !masterConvId) return;
      try {
        await createClient()
          .from("m4_projects")
          .upsert(
            { conversation_id: masterConvId, learning_cards_json: next },
            { onConflict: "conversation_id" },
          );
      } catch (err) {
        console.warn("[useM4Projects] DB sync failed:", err);
      }
    },
    [user, masterConvId],
  );

  const setProjects = useCallback(
    (updater: M4Project[] | ((prev: M4Project[]) => M4Project[])) => {
      setProjectsLocal((prev: M4Project[]) => {
        const next =
          typeof updater === "function" ? updater(prev) : updater;
        void syncToDb(next);
        return next;
      });
    },
    [setProjectsLocal, syncToDb],
  );

  return [projects, setProjects];
}
