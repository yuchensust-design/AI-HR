/**
 * Nav 右侧用户菜单 — plan §8.24 §E.4
 *
 * 游客 → "登录 / 注册" 按钮
 * 登录 → 头像首字 + 下拉(我的 / 设置 / 登出)
 */
"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { clearLocalUserData } from "@/lib/use-local-state";

export default function UserMenu() {
  const { user, profile, loading } = useUser();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点外部关闭
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function onSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    clearLocalUserData();
    setOpen(false);
    // 硬跳转(而非 router.push 软导航):软导航不卸载页面组件,
    // 已挂载页面的 React state 仍保留上个用户的简历/测评等个人数据照常显示
    // (清了 localStorage 也没用,屏幕显示的是内存 state)。硬重载彻底销毁所有
    // client state,并用清空后的 localStorage + 已登出 session 重新加载。
    window.location.assign("/");
  }

  if (loading) {
    return <div className="w-8 h-8 rounded-full bg-black/5 animate-pulse" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm px-3 py-1.5 rounded-full bg-esther-blue text-white hover:bg-esther-blue-dark transition"
      >
        登录 / 注册
      </Link>
    );
  }

  const name = profile?.display_name || user.email?.split("@")[0] || "我";
  const initial = name.charAt(0);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-2 py-1 rounded-full hover:bg-black/5 transition"
      >
        <span className="w-8 h-8 rounded-full bg-esther-yellow text-ink font-medium flex items-center justify-center text-sm">
          {initial}
        </span>
        <span className="text-sm text-ink hidden sm:inline">{name}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl bg-white border border-black/10 shadow-lg py-1.5 z-50">
          <div className="px-3 py-2 border-b border-black/5">
            <p className="text-sm text-ink truncate">{name}</p>
            <p className="text-xs text-ink-muted truncate">{user.email}</p>
          </div>
          <Link
            href="/tracker"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-ink hover:bg-warm-bg-deep transition"
          >
            📊 复盘投递
          </Link>
          <Link
            href="/diary"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-ink hover:bg-warm-bg-deep transition"
          >
            📔 日记
          </Link>
          <div className="my-1 border-t border-black/5" />
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-ink hover:bg-warm-bg-deep transition"
          >
            👤 我的
          </Link>
          <Link
            href="/profile/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm text-ink hover:bg-warm-bg-deep transition"
          >
            ⚙️ 设置
          </Link>
          <button
            onClick={onSignOut}
            className="w-full text-left block px-3 py-2 text-sm text-esther-red hover:bg-warm-bg-deep transition"
          >
            ↩ 登出
          </button>
        </div>
      )}
    </div>
  );
}
