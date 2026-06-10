/**
 * 注册页 — plan §8.24 §E.1
 * 邮箱 + 密码 + 随机用户名(🎲 可重生)
 *
 * v1 不发邮件验证(plan §J),前提:Supabase Dashboard
 *   Authentication → Providers → Email → Confirm email = OFF
 * 否则用户注册后 session 为空,会显示"请去邮箱确认"提示
 */
"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { generateDisplayName } from "@/lib/auth/display-name";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(() => generateDisplayName());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needConfirm, setNeedConfirm] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
    });
    if (err) {
      setLoading(false);
      setError(err.message);
      return;
    }

    // 如果 email confirm 开着 → session 为空,提示用户去邮箱
    if (!data.session) {
      setLoading(false);
      setNeedConfirm(true);
      return;
    }

    // session 已存在 → 立即 upsert profiles row(RLS 允许 own insert)
    // upsert(幂等):避免重试/冲突时漏建 profile,否则该用户后续每页都会 406
    if (data.user) {
      await supabase
        .from("profiles")
        .upsert(
          { user_id: data.user.id, display_name: displayName },
          { onConflict: "user_id" },
        );
    }

    setLoading(false);
    // 硬跳转(而非 router.push + router.refresh):后者竞态会取消导航,导致注册成功却停在注册页
    window.location.assign("/");
  }

  if (needConfirm) {
    return (
      <>
        <h1 className="text-2xl font-heading text-ink mb-2">检查你的邮箱 📬</h1>
        <p className="text-sm text-ink-soft mb-6">
          我们给 {email} 发了一封确认邮件,点链接后就能登录。
        </p>
        <Link
          href="/login"
          className="block w-full text-center rounded-xl bg-esther-blue text-white py-2.5 hover:bg-esther-blue-dark transition"
        >
          去登录
        </Link>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-heading text-ink mb-1">创建账号</h1>
      <p className="text-sm text-ink-soft mb-6">数据加密存云,跨设备不丢</p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-ink-soft mb-1.5">你的名字</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 rounded-xl border border-black/10 px-4 py-2.5 focus:border-esther-blue focus:outline-none transition"
              maxLength={20}
            />
            <button
              type="button"
              onClick={() => setDisplayName(generateDisplayName())}
              className="rounded-xl border border-black/10 px-3 py-2.5 hover:bg-warm-bg-deep transition"
              title="再随机一个"
            >
              🎲
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-ink-soft mb-1.5">邮箱</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-black/10 px-4 py-2.5 focus:border-esther-blue focus:outline-none transition"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="block text-sm text-ink-soft mb-1.5">密码</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-black/10 px-4 py-2.5 focus:border-esther-blue focus:outline-none transition"
            placeholder="≥ 8 位"
            minLength={8}
          />
          <p className="text-xs text-ink-muted mt-1.5">
            v1 暂不支持找回密码,请妥善保管
          </p>
        </div>

        {error && (
          <p className="text-sm text-esther-red bg-esther-red/10 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-esther-blue text-white rounded-xl py-2.5 font-medium hover:bg-esther-blue-dark transition disabled:opacity-50"
        >
          {loading ? "注册中…" : "注册"}
        </button>
      </form>

      <div className="mt-6 text-sm text-ink-soft text-center">
        已有账号?{" "}
        <Link href="/login" className="text-esther-blue hover:underline">
          去登录
        </Link>
      </div>
    </>
  );
}
