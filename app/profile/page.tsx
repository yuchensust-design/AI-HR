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
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(false);
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
      // 拉最近一份简历的原文(给「查看上传简历」用)
      if (m3.length > 0) {
        const { data: rRow } = await supabase
          .from("m3_resumes")
          .select("parsed_resume_json")
          .eq("conversation_id", m3[0].id)
          .maybeSingle();
        const pr = rRow?.parsed_resume_json as { raw_text?: string } | null;
        if (pr?.raw_text) setResumeText(pr.raw_text);
      }
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
  // 演示账号:简历以 PDF 模版展示;其他用户展示上传的原文
  const isDemoUser = user.email === "linzhou.demo@offercatcher.app";
  const demoResumePdf = "/demo/linzhou-resume.pdf";

  return (
    <main className="min-h-screen bg-warm-bg">
      <Nav />
      <div className="max-w-[1100px] mx-auto px-6 pt-28 pb-20">
        {/* Hero */}
        <div className="mb-8">
          <h1 className="font-display italic text-4xl md:text-5xl text-esther-blue mb-2">
            你好,{name}
          </h1>
          <p className="text-sm text-ink-soft">
            数据加密存云,跨设备同步 · {user.email}
          </p>
        </div>

        {/* 下一步推荐 — 根据完成度决定 */}
        <NextStepCard
          hasAssessment={counts.hasAssessment}
          hasResume={convs.m3.length > 0}
          hasInterview={convs.m5.length > 0}
        />

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

        {/* 我的简历 — 查看上传的原始简历 */}
        {(resumeText || isDemoUser) && (
          <section className="mb-6">
            <button
              type="button"
              onClick={() => setShowResume(true)}
              className="w-full text-left rounded-3xl bg-white border border-black/5 p-5 hover:border-esther-blue/40 transition flex items-center justify-between"
            >
              <span>
                <span className="block text-sm text-ink-soft mb-1">📄 我的简历</span>
                <span className="block text-lg text-ink">查看上传的原始简历 →</span>
              </span>
              <span className="text-xs text-ink-muted hidden sm:inline">点击查看全文</span>
            </button>
          </section>
        )}

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

      {/* 简历弹窗:演示账号展示 PDF 模版,其他用户展示上传原文 */}
      {showResume && (resumeText || isDemoUser) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowResume(false)}
        >
          <div
            className={`bg-white rounded-3xl shadow-2xl w-full flex flex-col ${
              isDemoUser ? "max-w-4xl h-[90vh]" : "max-w-2xl max-h-[80vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
              <h3 className="text-lg font-medium text-ink">📄 我上传的简历</h3>
              <div className="flex items-center gap-4">
                {isDemoUser && (
                  <a
                    href={demoResumePdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-esther-blue hover:underline"
                  >
                    新窗口打开 ↗
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setShowResume(false)}
                  className="text-ink-muted hover:text-ink text-xl leading-none"
                  aria-label="关闭"
                >
                  ×
                </button>
              </div>
            </div>
            {isDemoUser ? (
              <iframe
                src={demoResumePdf}
                title="林舟简历"
                className="flex-1 w-full rounded-b-3xl"
              />
            ) : (
              <pre className="overflow-auto px-6 py-5 text-sm text-ink whitespace-pre-wrap font-sans leading-relaxed">
                {resumeText}
              </pre>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

/**
 * 下一步推荐卡 — 4 状态决策树:
 *   1) 没测评 → 1·找方向(蓝大卡)
 *   2) 测了但没简历 → 3·改简历
 *   3) 有简历但没练面试 → 4·练面试
 *   4) 三件都有 → 鼓励继续 / 看会话
 */
function NextStepCard({
  hasAssessment,
  hasResume,
  hasInterview,
}: {
  hasAssessment: boolean;
  hasResume: boolean;
  hasInterview: boolean;
}) {
  let next: { icon: string; title: string; sub: string; href: string; cta: string };
  if (!hasAssessment) {
    next = {
      icon: "🧭",
      title: "先花 3 分钟找一下方向",
      sub: "做一遍职业兴趣测评 → 看 3 个推荐方向",
      href: "/m1",
      cta: "去测评 →",
    };
  } else if (!hasResume) {
    next = {
      icon: "📄",
      title: "把简历改成更能过筛的版本",
      sub: "上传简历 + 粘 JD,AI 帮你逐条优化",
      href: "/m3",
      cta: "改简历 →",
    };
  } else if (!hasInterview) {
    next = {
      icon: "🎤",
      title: "练一场面试,看实际能不能讲清楚",
      sub: "3 类面试 × 3 种风格 + 4 维复盘",
      href: "/m5",
      cta: "练面试 →",
    };
  } else {
    next = {
      icon: "🚀",
      title: "继续完善任意模块",
      sub: "或者从左侧会话里继续上次进度",
      href: "/m3",
      cta: "去简历 →",
    };
  }
  return (
    <Link
      href={next.href}
      className="block mb-10 rounded-3xl bg-esther-blue text-white px-6 py-5 hover:bg-esther-blue-dark transition shadow-sm"
    >
      <div className="flex items-center gap-4">
        <span className="text-3xl">{next.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display italic text-xs text-white/70 mb-1">Next step</p>
          <p className="text-lg font-medium leading-tight">{next.title}</p>
          <p className="text-sm text-white/80 mt-0.5">{next.sub}</p>
        </div>
        <span className="text-sm font-medium whitespace-nowrap hidden sm:inline">
          {next.cta}
        </span>
      </div>
    </Link>
  );
}
