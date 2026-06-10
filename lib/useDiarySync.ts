"use client";

/**
 * useDiarySync — 日记双写 hook（localStorage + DB）
 *
 * 游客：只写 localStorage（同原来行为）
 * 登录：先写 localStorage，再异步同步到 diary_entries 表
 *
 * 关键设计：insert 时把 local entry.id（crypto.randomUUID）直接用作 DB row id，
 * 这样 delete 可以精准按 id 删，不需要额外字段。
 */

import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/auth/useUser";
import {
  addEntry as localAdd,
  deleteEntry as localDelete,
  clearAllEntries as localClear,
  mergeEntriesFromDB,
  type DiaryEntry,
  type DiaryEntrySource,
} from "@/lib/diary";

export function useDiarySync() {
  const { user, loading: userLoading } = useUser();

  const addEntry = useCallback(
    async (partial: Omit<DiaryEntry, "id" | "createdAt">): Promise<DiaryEntry> => {
      // 1. 写 localStorage（同步）
      const entry = localAdd(partial);

      // 2. 登录用户 → 写 diary_entries，用 local UUID 作为 DB id
      if (user) {
        try {
          const supabase = createClient();
          await supabase.from("diary_entries").insert({
            id: entry.id,
            user_id: user.id,
            content: entry.content,
            title: entry.title ?? null,
            source: entry.source ?? null,
            raw_dialog_json: entry.rawDialog ?? null,
            metadata_json: entry.metadata ?? null,
            summary_meta_json: entry.summary_meta ?? null,
            highlights_json: entry.highlights ?? null,
            image_url: entry.imageBase64 ?? null,
            created_at: entry.createdAt,
          });
        } catch (err) {
          console.warn("[useDiarySync] DB insert failed:", err);
        }
      }

      return entry;
    },
    [user],
  );

  const deleteEntry = useCallback(
    async (id: string): Promise<void> => {
      // 1. 删 localStorage
      localDelete(id);

      // 2. 登录用户 → 删 diary_entries（id 与 local id 对齐，精准删）
      if (user) {
        try {
          const supabase = createClient();
          await supabase
            .from("diary_entries")
            .delete()
            .eq("user_id", user.id)
            .eq("id", id);
        } catch (err) {
          console.warn("[useDiarySync] DB delete failed:", err);
        }
      }
    },
    [user],
  );

  const clearAllEntries = useCallback(async (): Promise<void> => {
    localClear();
    if (user) {
      try {
        const supabase = createClient();
        await supabase.from("diary_entries").delete().eq("user_id", user.id);
      } catch (err) {
        console.warn("[useDiarySync] DB clear failed:", err);
      }
    }
  }, [user]);

  /**
   * 从 DB 拉回全部日记并并进 localStorage(跨设备 / 清缓存恢复)。
   * 游客 → null(无 DB);登录 → 合并后的全量(已写回本地)。
   * 没有这个,登录用户在新设备只会看到空的本地日记(云端读不回)。
   */
  const loadFromDB = useCallback(async (): Promise<DiaryEntry[] | null> => {
    if (!user) return null;
    try {
      const { data } = await createClient()
        .from("diary_entries")
        .select(
          "id, content, title, source, raw_dialog_json, metadata_json, summary_meta_json, highlights_json, image_url, created_at",
        )
        .eq("user_id", user.id);
      if (!data || data.length === 0) return null;
      const entries: DiaryEntry[] = data.map((r) => ({
        id: r.id as string,
        createdAt: (r.created_at as string) ?? new Date().toISOString(),
        content: (r.content as string) ?? "",
        title: (r.title as string | null) ?? undefined,
        source: ((r.source as string | null) ?? "diary-page") as DiaryEntrySource,
        imageBase64: (r.image_url as string | null) ?? null,
        rawDialog: (r.raw_dialog_json as string[] | null) ?? undefined,
        metadata: (r.metadata_json as DiaryEntry["metadata"]) ?? undefined,
        summary_meta: (r.summary_meta_json as DiaryEntry["summary_meta"]) ?? undefined,
        highlights: (r.highlights_json as string[] | null) ?? undefined,
      }));
      return mergeEntriesFromDB(entries);
    } catch (err) {
      console.warn("[useDiarySync] loadFromDB failed:", err);
      return null;
    }
  }, [user]);

  return { addEntry, deleteEntry, clearAllEntries, loadFromDB, userLoading };
}
