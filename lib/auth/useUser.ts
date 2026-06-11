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
import { clearLocalUserData } from "@/lib/use-local-state";

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
  // 记录当前用户 id —— 用于区分"真的换人了"vs"只是 token 刷新(切走再切回触发)"
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function fetchProfile(userId: string) {
      // maybeSingle:profile 行不存在时返回 null 而非 406 报错
      // (.single() 在 0 行时抛 406 — 注册时 profile insert 若失败,用户会每页刷红错)
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
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
      lastUserIdRef.current = data.user?.id ?? null;
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
      const nextUser = session?.user ?? null;
      // token 刷新(切走再切回浏览器触发)= 同一个用户 → 保持原 user 引用,
      // 否则下游 useM3DBSync 依赖变化会重拉 dbData、整页闪 loading、看着像"重新分析"
      if ((lastUserIdRef.current ?? null) === (nextUser?.id ?? null)) {
        return;
      }
      const prevUserId = lastUserIdRef.current;
      lastUserIdRef.current = nextUser?.id ?? null;
      setUser(nextUser);
      // 隐私:从某个登录用户切走(登出 / 换号)→ 清掉本地缓存的个人数据,
      // 防止公用电脑上残留上一个用户的简历 / 测评 / 面试 / 推荐等。
      // 放在 maybeMigrate 之前,避免把上一个用户的本地数据迁进新账号。
      // 游客→登录(prevUserId 为空)不清,保留本地数据待迁移。
      if (prevUserId) {
        clearLocalUserData();
      }
      if (nextUser) {
        fetchProfile(nextUser.id);
        if (event === "SIGNED_IN") void maybeMigrate(nextUser.id);
      } else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
}
