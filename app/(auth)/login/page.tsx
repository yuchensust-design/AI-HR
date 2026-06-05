/**
 * 登录页 — plan §8.24 §E.1
 * 邮箱 + 密码 / 链到注册 / "以游客继续"按钮
 */
"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (err) {
      setError(err.message === "Invalid login credentials" ? "邮箱或密码不对" : err.message);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-heading text-ink mb-1">欢迎回来</h1>
      <p className="text-sm text-ink-soft mb-6">登录后数据加密存云,跨设备同步不丢</p>

      <form onSubmit={onSubmit} className="space-y-4">
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
          {loading ? "登录中…" : "登录"}
        </button>
      </form>

      <div className="mt-6 text-sm text-ink-soft text-center">
        还没账号?{" "}
        <Link href="/register" className="text-esther-blue hover:underline">
          立即注册
        </Link>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-black/10" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-2 bg-white text-ink-muted">或</span>
        </div>
      </div>

      <Link
        href="/"
        className="block w-full text-center rounded-xl border border-black/10 py-2.5 text-sm text-ink-soft hover:bg-warm-bg-deep transition"
      >
        以游客身份继续(数据可能丢失)
      </Link>
    </>
  );
}
