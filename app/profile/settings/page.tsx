/**
 * 账号设置 — plan §8.24 §D.1
 *
 * v1:改 display_name + 改密码 + 登出
 * v2:删账号(需 admin client + 邮箱验证)/ 找回密码(SMTP)
 */
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const { user, profile, loading } = useUser();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.push("/login?next=/profile/settings");
      return;
    }
    setDisplayName(profile?.display_name ?? "");
  }, [user, profile, loading, router]);

  async function saveDisplayName(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !displayName.trim()) return;
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim() })
      .eq("user_id", user.id);
    setSaving(false);
    setMsg(
      error
        ? { text: error.message, ok: false }
        : { text: "已保存", ok: true },
    );
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      setMsg({ text: "密码至少 8 位", ok: false });
      return;
    }
    setSaving(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSaving(false);
    if (error) setMsg({ text: error.message, ok: false });
    else {
      setNewPassword("");
      setMsg({ text: "密码已更新", ok: true });
    }
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (loading || !user) {
    return (
      <main className="min-h-screen bg-warm-bg">
        <Nav />
        <div className="pt-32 text-center text-ink-muted">加载中…</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warm-bg">
      <Nav />
      <div className="max-w-2xl mx-auto px-6 pt-28 pb-20">
        <Link
          href="/profile"
          className="text-sm text-ink-soft hover:text-esther-blue mb-4 inline-block"
        >
          ← 返回个人中心
        </Link>

        <h1 className="text-3xl font-heading text-ink mb-1">账号设置</h1>
        <p className="text-sm text-ink-soft mb-8">{user.email}</p>

        {msg && (
          <div
            className={`mb-6 px-4 py-3 rounded-xl text-sm ${
              msg.ok
                ? "bg-esther-yellow/30 text-ink"
                : "bg-esther-red/10 text-esther-red"
            }`}
          >
            {msg.text}
          </div>
        )}

        {/* 改名 */}
        <section className="bg-white rounded-3xl border border-black/5 p-6 mb-5">
          <h2 className="font-medium text-ink mb-3">显示名</h2>
          <form onSubmit={saveDisplayName} className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={20}
              className="flex-1 rounded-xl border border-black/10 px-4 py-2 focus:border-esther-blue focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving}
              className="bg-esther-blue text-white rounded-xl px-5 hover:bg-esther-blue-dark transition disabled:opacity-50"
            >
              保存
            </button>
          </form>
        </section>

        {/* 改密码 */}
        <section className="bg-white rounded-3xl border border-black/5 p-6 mb-5">
          <h2 className="font-medium text-ink mb-3">改密码</h2>
          <form onSubmit={changePassword} className="flex gap-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              minLength={8}
              placeholder="新密码 ≥ 8 位"
              className="flex-1 rounded-xl border border-black/10 px-4 py-2 focus:border-esther-blue focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving || !newPassword}
              className="bg-esther-blue text-white rounded-xl px-5 hover:bg-esther-blue-dark transition disabled:opacity-50"
            >
              更新
            </button>
          </form>
        </section>

        {/* 危险区 */}
        <section className="bg-white rounded-3xl border border-esther-red/20 p-6">
          <h2 className="font-medium text-esther-red mb-3">危险操作</h2>
          <button
            onClick={signOut}
            className="text-sm text-ink-soft hover:text-esther-red border border-black/10 hover:border-esther-red rounded-xl px-4 py-2 transition mr-3"
          >
            登出
          </button>
          <span className="text-xs text-ink-muted">
            (删账号 v2 开放,如需立即删除请联系)
          </span>
        </section>
      </div>
    </main>
  );
}
