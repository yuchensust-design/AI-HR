/**
 * 个人中心 — plan §8.24 §E.3
 *
 * 登录用户:聚合显示所有 conversations + 测评 + 日记 + 投递
 * 游客:redirect 到 /login
 */
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import {
  type Conversation,
  type ConversationModule,
  listConversations,
} from "@/lib/conversations";

const MODULE_META: Record<
  ConversationModule,
  { label: string; emoji: string; path: string; cta: string }
> = {
  m2: { label: "经历挖掘", emoji: "🔍", path: "/m2", cta: "新建经历会话" },
  m3: { label: "简历整理", emoji: "📄", path: "/m3", cta: "新建简历会话" },
  m4: { label: "项目陪练", emoji: "🛠️", path: "/m4", cta: "新建项目会话" },
  m5: { label: "模拟面试", emoji: "🎤", path: "/m5", cta: "开始新面试" },
};

type Counts = {
  hasAssessment: boolean;
  diaryCount: number;
  trackerCount: number;
};

export default function ProfilePage() {
  const { user, profile, loading: userLoading } = useUser();
  const router = useRouter();
  const [convs, setConvs] = useState<Record<ConversationModule, Conversation[]>>({
    m2: [],
    m3: [],
    m4: [],
    m5: [],
  });
  const [counts, setCounts] = useState<Counts>({
    hasAssessment: false,
    diaryCount: 0,
    trackerCount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      router.push("/login?next=/profile");
      return;
    }
    void loadAll();
    async function loadAll() {
      const [m2, m3, m4, m5] = await Promise.all([
        listConversations("m2"),
        listConversations("m3"),
        listConversations("m4"),
        listConversations("m5"),
      ]);
      setConvs({ m2, m3, m4, m5 });

      const supabase = createClient();
      const [assessmentRes, diaryRes, trackerRes] = await Promise.all([
        supabase.from("m1_assessments").select("user_id", { count: "exact", head: true }),
        supabase.from("diary_entries").select("id", { count: "exact", head: true }),
        supabase.from("tracker_applications").select("id", { count: "exact", head: true }),
      ]);
      setCounts({
        hasAssessment: (assessmentRes.count ?? 0) > 0,
        diaryCount: diaryRes.count ?? 0,
        trackerCount: trackerRes.count ?? 0,
      });
      setLoading(false);
    }
  }, [user, userLoading, router]);

  if (userLoading || !user) {
    return (
      <main className="min-h-screen bg-warm-bg">
        <Nav />
        <div className="pt-32 text-center text-ink-muted">加载中…</div>
      </main>
    );
  }

  const name = profile?.display_name || user.email?.split("@")[0] || "我";

  return (
    <main className="min-h-screen bg-warm-bg">
      <Nav />
      <div className="max-w-[1100px] mx-auto px-6 pt-28 pb-20">
        {/* Hero */}
        <div className="mb-10">
          <h1 className="font-display italic text-4xl md:text-5xl text-esther-blue mb-2">
            你好,{name}
          </h1>
          <p className="text-sm text-ink-soft">
            数据加密存云,跨设备同步 · {user.email}
          </p>
        </div>

        {/* 4 模块多会话 */}
        <section className="grid md:grid-cols-2 gap-5 mb-10">
          {(["m3", "m5", "m2", "m4"] as ConversationModule[]).map((m) => {
            const meta = MODULE_META[m];
            const list = convs[m];
            return (
              <div
                key={m}
                className="rounded-3xl bg-white border border-black/5 shadow-sm p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium text-ink">
                    <span className="mr-1.5">{meta.emoji}</span>
                    {meta.label}
                    {list.length > 0 && (
                      <span className="ml-2 text-sm text-ink-muted font-normal">
                        · {list.length}
                      </span>
                    )}
                  </h2>
                  <Link
                    href={meta.path}
                    className="text-xs text-esther-blue hover:underline"
                  >
                    {meta.cta} →
                  </Link>
                </div>

                {loading ? (
                  <div className="h-24 bg-black/5 rounded-xl animate-pulse" />
                ) : list.length === 0 ? (
                  <p className="text-sm text-ink-muted py-4 text-center">
                    还没有会话
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {list.slice(0, 5).map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`${meta.path}?c=${c.id}`}
                          className="block px-3 py-2 rounded-xl hover:bg-warm-bg-deep transition"
                        >
                          <p className="text-sm text-ink truncate">{c.title}</p>
                          <p className="text-xs text-ink-muted">
                            {new Date(c.updated_at).toLocaleDateString("zh-CN")}
                          </p>
                        </Link>
                      </li>
                    ))}
                    {list.length > 5 && (
                      <Link
                        href={meta.path}
                        className="block text-xs text-ink-muted hover:text-ink text-center pt-1"
                      >
                        还有 {list.length - 5} 份 →
                      </Link>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </section>

        {/* 单条数据(测评 / 日记 / 投递)*/}
        <section className="grid md:grid-cols-3 gap-4 mb-10">
          <Link
            href="/m1/result"
            className="rounded-3xl bg-white border border-black/5 p-5 hover:border-esther-blue/40 transition"
          >
            <p className="text-sm text-ink-soft mb-1">🎯 我的测评</p>
            <p className="text-lg text-ink">
              {counts.hasAssessment ? "已完成 →" : "去测一次 →"}
            </p>
          </Link>

          <Link
            href="/diary"
            className="rounded-3xl bg-white border border-black/5 p-5 hover:border-esther-blue/40 transition"
          >
            <p className="text-sm text-ink-soft mb-1">📔 我的日记</p>
            <p className="text-lg text-ink">{counts.diaryCount} 篇</p>
          </Link>

          <Link
            href="/tracker"
            className="rounded-3xl bg-white border border-black/5 p-5 hover:border-esther-blue/40 transition"
          >
            <p className="text-sm text-ink-soft mb-1">📊 我的投递</p>
            <p className="text-lg text-ink">{counts.trackerCount} 条</p>
          </Link>
        </section>

        {/* 设置入口 */}
        <div className="text-center">
          <Link
            href="/profile/settings"
            className="text-sm text-ink-soft hover:text-esther-blue"
          >
            ⚙️ 账号设置
          </Link>
        </div>
      </div>
    </main>
  );
}
