/**
 * Auth 路由组布局(login / register)— plan §8.24 §E.1
 * esther 暖色 + 卡片居中 + 顶部 logo
 */
import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12 bg-warm-bg">
      <Link
        href="/"
        className="mb-8 text-2xl font-display italic text-esther-blue hover:opacity-70 transition"
      >
        Offer 捕手
      </Link>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-black/5 p-8">
        {children}
      </div>
      <p className="mt-6 text-xs text-ink-muted text-center max-w-md">
        认识自己,踏实成长,从容求职
      </p>
    </main>
  );
}
