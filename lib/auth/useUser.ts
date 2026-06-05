/**
 * React hook 读当前用户 + 订阅 auth 变化 — plan §8.24 §D.1
 *
 * 用法:在任何 Client Component 里
 *   const { user, profile, loading } = useUser();
 *   if (loading) return <Spinner />;
 *   if (!user) return <LoginPrompt />;
 *
 * 返回:
 *   user      — Supabase auth.users 的 User 对象,null = 游客
 *   profile   — 我们的 profiles 表 row(含 display_name / persona_tag),null = 游客或刚注册未拉到
 *   loading   — 初次加载中
 */
"use client";
import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { hasMigrated, migrateGuestDataOnLogin } from "@/lib/sync/migrate-guest-data";

export type Profile = {
  user_id: string;
  display_name: string;
  avatar_url?: string | null;
  persona_tag?: string | null;
  created_at?: string;
};

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const migratingRef = useRef(false);

  useEffect(() => {
    const supabase = createClient();

    async function fetchProfile(userId: string) {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      setProfile((data as Profile) ?? null);
    }

    async function maybeMigrate(userId: string) {
      if (hasMigrated() || migratingRef.current) return;
      migratingRef.current = true;
      try {
        const report = await migrateGuestDataOnLogin(userId, supabase);
        const totalCount =
          (report.m1 ? 1 : 0) +
          (report.m3 ? 1 : 0) +
          report.m5 +
          report.diary +
          report.tracker;
        if (totalCount > 0) {
          console.info("[useUser] 游客数据已同步到云:", report);
        }
        if (report.errors.length > 0) {
          console.warn("[useUser] 迁移部分错误:", report.errors);
        }
      } catch (err) {
        console.error("[useUser] migrate failed:", err);
      } finally {
        migratingRef.current = false;
      }
    }

    // 初次拉取
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
      if (data.user) {
        fetchProfile(data.user.id);
        void maybeMigrate(data.user.id);
      }
    });

    // 订阅 auth state 变化(登录 / 登出 / token 刷新)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
        if (event === "SIGNED_IN") void maybeMigrate(session.user.id);
      } else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
}
