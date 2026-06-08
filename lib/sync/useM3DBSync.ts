/**
 * m3 子页通用 DB 同步 hook — plan §8.24
 *
 * 在 m3 子页(upload / jd / excavate / result)用 — 提供:
 *   - convId / convQs("?c=xxx" 或 "")
 *   - 登录但没 convId → 自动 redirect 回 /m3
 *   - 从 m3_resumes 读全行数据(单次 fetch)
 *   - saveField(field, value) 写 DB
 *
 * 游客分支不在此 hook 里 — 子页继续用 useLocalState 走 localStorage 单轨(plan §E.4)
 */
"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";

export type M3Row = {
  conversation_id: string;
  parsed_resume_json: unknown | null;
  jd_context_json: unknown | null;
  hidden_experience_json: unknown[] | null;
  final_resume_md: string | null;
  final_resume_docx_url: string | null;
  // 分析产物落库(m3-db-persistence)
  edits_json: unknown | null;
  decisions_json: unknown | null;
  metrics_json: unknown | null;
  interview_prep_json: unknown | null;
  keyword_match_json: unknown | null;
  updated_at: string;
};

export function useM3DBSync() {
  const sp = useSearchParams();
  const convId = sp.get("c");
  const { user, loading: userLoading } = useUser();
  // 只认 user.id —— token 刷新换了 user 对象引用但 id 不变时,不重拉数据(避免切走切回闪 loading)
  const userId = user?.id ?? null;
  const router = useRouter();
  const convQs = convId ? `?c=${convId}` : "";

  // 登录但没 conv → 回 /m3 让用户选/新建
  useEffect(() => {
    if (!userLoading && userId && !convId) {
      router.replace("/m3");
    }
  }, [userId, userLoading, convId, router]);

  const [dbData, setDbData] = useState<Partial<M3Row> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (userLoading) return;
    if (!userId || !convId) {
      if (!cancelled) {
        setDbData(null);
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }
    const supabase = createClient();
    setLoading(true);
    supabase
      .from("m3_resumes")
      .select("*")
      .eq("conversation_id", convId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDbData((data as Partial<M3Row>) ?? {});
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, userLoading, convId]);

  const saveField = useCallback(
    async (field: keyof M3Row, value: unknown) => {
      if (!user || !convId) return false;
      const supabase = createClient();
      const { error } = await supabase
        .from("m3_resumes")
        .update({ [field]: value })
        .eq("conversation_id", convId);
      if (error) {
        console.error("[m3 sync] save failed:", field, error);
        return false;
      }
      setDbData((prev) => ({ ...(prev ?? {}), [field]: value }));
      return true;
    },
    [user, convId],
  );

  return {
    user,
    convId,
    convQs,
    dbData,
    loading,
    saveField,
    isLoggedInWithConv: !!(user && convId),
    isGuest: !user,
  };
}
