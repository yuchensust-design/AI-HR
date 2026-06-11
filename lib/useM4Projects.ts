"use client";

/**
 * useM4Projects — M4 项目列表 hook，按会话隔离（仿 m3 useM3Data）
 *
 * 游客：单轨 localStorage(key=m4_projects)，全站约定不支持多会话
 * 登录 + convId：从 m4_projects 表按 conversation_id 读/写该会话独占的一行
 * 登录 + 无 convId：返回空（由 m4 page 的编排 effect 负责建/选会话）
 *
 * 关键修复（2026-06-11）：旧版用「单一 master 会话」把所有卡堆在一起，
 * 切会话/从测评带新目标进来都看到同一堆卡。现在每个会话独占一行，真正隔离。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { STORAGE_KEYS } from "@/lib/use-local-state";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import type { M4Project } from "@/lib/m4-types";

function readGuestLocal(): M4Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.M4_PROJECTS);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? (arr as M4Project[]) : [];
  } catch {
    return [];
  }
}

export type SaveCloudResult = { ok: boolean; guest: boolean; error?: string };

export function useM4Projects(convId: string | null): [
  M4Project[],
  (updater: M4Project[] | ((prev: M4Project[]) => M4Project[])) => void,
  { loading: boolean; saveToCloud: () => Promise<SaveCloudResult> },
] {
  const { user, loading: userLoading } = useUser();
  const [projects, setProjectsState] = useState<M4Project[]>([]);
  const [loading, setLoading] = useState(true);
  // 显式「保存到云端」用:始终拿到最新 projects(避免 useCallback 闭包旧值)
  const projectsRef = useRef<M4Project[]>([]);
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    if (userLoading) return;

    // 游客：单轨 localStorage
    if (!user) {
      if (!cancelled) {
        setProjectsState(readGuestLocal());
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    // 登录无会话：空（编排 effect 会建/选会话后带上 convId 再来）
    if (!convId) {
      if (!cancelled) {
        setProjectsState([]);
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    // 登录 + convId：从 DB 按会话读
    setLoading(true);
    createClient()
      .from("m4_projects")
      .select("learning_cards_json")
      .eq("conversation_id", convId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const arr = data?.learning_cards_json;
        setProjectsState(Array.isArray(arr) ? (arr as M4Project[]) : []);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, userLoading, convId]);

  const setProjects = useCallback(
    (updater: M4Project[] | ((prev: M4Project[]) => M4Project[])) => {
      setProjectsState((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        if (typeof window !== "undefined") {
          if (!user) {
            try {
              window.localStorage.setItem(
                STORAGE_KEYS.M4_PROJECTS,
                JSON.stringify(next),
              );
            } catch {
              /* ignore */
            }
          } else if (convId) {
            void createClient()
              .from("m4_projects")
              .upsert(
                { conversation_id: convId, learning_cards_json: next },
                { onConflict: "conversation_id" },
              )
              .then(({ error }) => {
                if (error) console.warn("[useM4Projects] DB sync failed:", error);
              });
          }
        }
        return next;
      });
    },
    [user, convId],
  );

  // 显式保存到云端(登录态):把当前会话的所有卡 upsert 到 DB
  const saveToCloud = useCallback(async (): Promise<SaveCloudResult> => {
    if (!user) return { ok: false, guest: true };
    if (!convId) return { ok: false, guest: false, error: "当前没有会话,无法保存到云端" };
    try {
      const { error } = await createClient()
        .from("m4_projects")
        .upsert(
          { conversation_id: convId, learning_cards_json: projectsRef.current },
          { onConflict: "conversation_id" },
        );
      if (error) return { ok: false, guest: false, error: error.message };
      return { ok: true, guest: false };
    } catch (e) {
      return { ok: false, guest: false, error: e instanceof Error ? e.message : "保存失败" };
    }
  }, [user, convId]);

  return [projects, setProjects, { loading, saveToCloud }];
}
