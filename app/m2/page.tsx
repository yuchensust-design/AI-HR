"use client";

/**
 * 模块 2 · 经历挖掘 — 真 chat(P1 真 LLM 接入版)
 * 路由 /m2
 *
 * TODO(parallel-dev): localStorage key "intake_artifact" / "candidate_bullets"
 * 当前是字面量,待主开发者把它们加进 lib/use-local-state.ts STORAGE_KEYS 常量
 * (lib/use-local-state.ts 是 §3 共享文件 lock,本 worktree 不动)。
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";

type Phase =
  | "anchor"
  | "per_role"
  | "hero_story"
  | "skeptical"
  | "synthesis";

type StoryCategory =
  | "Peak"
  | "Challenge"
  | "Impact"
  | "Failure"
  | "LearningSprint"
  | "Praise";

type IntakeRole = {
  org_type: string;
  role: string;
  period: string;
  charter: string;
  scale?: string;
  excavation_depth: "shallow" | "medium" | "deep" | "thin";
};

type IntakeStory = {
  id: string;
  title: string;
  category: StoryCategory;
  strength: 1 | 2 | 3 | 4 | 5;
  star: {
    situation: string;
    task: string;
    action: string;
    result: string;
  };
  earned_secret?: string;
  jd_keywords?: string[];
};

type SkepticalFlag = { weak_spot: string; story_id?: string };

type IntakeArtifact = {
  roles: IntakeRole[];
  stories: IntakeStory[];
  skeptical_flags?: SkepticalFlag[];
};

type CandidateBullet = {
  source_story_id: string;
  text: string;
  star_breakdown?: { s: string; t: string; a: string; r: string };
};

type ChatMsg = { from: "ai" | "user"; text: string };

type UserProfile = { persona_tag?: string; selected_at?: string };

type Depth = "shallow" | "medium" | "deep";

const DEPTH_OPTIONS: { value: Depth; label: string; hint: string }[] = [
  { value: "shallow", label: "浅", hint: "简单聊聊,3-5 turn 收尾" },
  { value: "medium", label: "中", hint: "平衡挖掘(默认)" },
  { value: "deep", label: "深", hint: "详细 metric 追问" },
];

const CATEGORY_BADGE: Record<StoryCategory, { label: string; cls: string }> = {
  Peak: { label: "Peak", cls: "bg-esther-blue/15 text-esther-blue" },
  Challenge: { label: "Challenge", cls: "bg-esther-red/15 text-esther-red" },
  Impact: { label: "Impact", cls: "bg-esther-blue/15 text-esther-blue" },
  Failure: { label: "Failure", cls: "bg-ink-soft/15 text-ink-soft" },
  LearningSprint: { label: "Learning", cls: "bg-esther-yellow/40 text-ink" },
  Praise: { label: "Praise", cls: "bg-esther-yellow/40 text-ink" },
};

function buildResumeMarkdown(intake: IntakeArtifact): string {
  const lines: string[] = [];
  if (intake.roles.length > 0) {
    lines.push("## 经历");
    lines.push("");
    intake.roles.forEach((r) => {
      const titleParts = [r.role, r.org_type, r.period].filter(Boolean);
      lines.push(`**${r.role}** | ${r.org_type}${r.period ? ` | ${r.period}` : ""}`);
      if (r.charter) lines.push(`- 核心: ${r.charter}`);
      if (r.scale) lines.push(`- 规模: ${r.scale}`);
      lines.push("");
      void titleParts;
    });
  }
  if (intake.stories.length > 0) {
    lines.push("## Hero Stories");
    lines.push("");
    intake.stories.forEach((s) => {
      const stars = "⭐".repeat(s.strength || 0);
      lines.push(`### ${s.title || "未命名故事"}(${s.category}${stars ? `,${stars}` : ""})`);
      if (s.earned_secret) lines.push(`- 反直觉洞察: ${s.earned_secret}`);
      if (s.star?.situation) lines.push(`- 情境: ${s.star.situation}`);
      if (s.star?.task) lines.push(`- 任务: ${s.star.task}`);
      if (s.star?.action) lines.push(`- 行动: ${s.star.action}`);
      if (s.star?.result) lines.push(`- 结果: ${s.star.result}`);
      lines.push("");
    });
  }
  return lines.join("\n").trim() || "(还没素材 — 跟 AI 聊几轮就会有)";
}

const EXPERIENCE_CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: "course_project", label: "课程项目", hint: "任何 final project / 小组作业" },
  { key: "club", label: "社团 / 学生组织", hint: "任职 / 办活动 / 当过部长" },
  { key: "teaching", label: "助教 / 教学", hint: "给同学补习 / 课程 TA / 答疑" },
  { key: "competition", label: "比赛", hint: "编程 / 学科 / 商赛 / 设计 / 数模" },
  { key: "internship", label: "实习", hint: "1 周也算 / 短期项目也算" },
  { key: "personal", label: "个人项目", hint: "自学时做的东西 / Github / 博客" },
  { key: "volunteer", label: "志愿者 / 公益", hint: "支教 / 公益 / 校园服务" },
  { key: "campus_event", label: "校园活动", hint: "辩论 / 演讲 / 文艺 / 体育" },
  { key: "parttime", label: "兼职", hint: "家教 / 翻译 / 任何赚过钱的事" },
  { key: "hobby", label: "兴趣深挖", hint: "自学 / 收藏研究一年以上" },
];

function isAmbitiousPersonaTag(personaTag?: string): boolean {
  if (!personaTag) return false;
  const p = personaTag.toLowerCase();
  return (
    p.includes("chen") ||
    p.includes("陈昊") ||
    p.includes("ambitious") ||
    p.includes("拔高")
  );
}

function buildOpener(personaTag?: string, categories: string[] = []): string {
  if (isAmbitiousPersonaTag(personaTag)) {
    return "嗨 — 看你目标偏拔高型 offer,我们直接挖最近这段最有分量的经历。先说:你最近做的这段(实习 / 项目 / 课程),负责的核心 charter 是什么?";
  }
  if (categories.length > 0) {
    const labels = categories
      .map((k) => EXPERIENCE_CATEGORIES.find((c) => c.key === k)?.label ?? k)
      .join("、");
    return `嗨 — 你勾了 ${labels}。我们一类一类挖,沾边都算简历素材。\n先说:这几类里,你最近(or 印象最深)的是哪段经历?简单几句描述就行,我会帮你 reframe 成简历语言。`;
  }
  return "嗨 — 大学里做过任何事都可能是简历素材,先不用想'有没有价值'。\n下方勾一下你沾边做过的类(沾边都算),然后我帮你逐个挖 → 翻译成简历能用的句子。";
}

function mergeIntake(
  prev: IntakeArtifact,
  delta: {
    roles?: IntakeRole[];
    stories?: IntakeStory[];
    skeptical_flags?: SkepticalFlag[];
  }
): IntakeArtifact {
  const mergedRoles = [...(prev.roles ?? [])];
  for (const r of delta.roles ?? []) {
    const idx = mergedRoles.findIndex(
      (x) => x.role === r.role && x.period === r.period
    );
    if (idx >= 0) {
      mergedRoles[idx] = { ...mergedRoles[idx], ...r };
    } else {
      mergedRoles.push(r);
    }
  }
  const mergedStories = [...(prev.stories ?? [])];
  for (const s of delta.stories ?? []) {
    const idx = mergedStories.findIndex((x) => x.id === s.id);
    if (idx >= 0) {
      mergedStories[idx] = { ...mergedStories[idx], ...s };
    } else {
      mergedStories.push(s);
    }
  }
  const mergedFlags = [
    ...(prev.skeptical_flags ?? []),
    ...(delta.skeptical_flags ?? []),
  ];
  return {
    roles: mergedRoles,
    stories: mergedStories,
    skeptical_flags: mergedFlags,
  };
}

export default function Module2Page() {
  const [profile] = useLocalState<UserProfile>(STORAGE_KEYS.USER_PROFILE, {});
  const [intake, setIntake] = useLocalState<IntakeArtifact>(
    "intake_artifact",
    { roles: [], stories: [] }
  );
  const [bullets, setBullets] = useLocalState<CandidateBullet[]>(
    "candidate_bullets",
    []
  );
  const [categories, setCategories] = useLocalState<string[]>(
    "m2_categories",
    []
  );

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("anchor");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCats, setPendingCats] = useState<string[]>([]);
  const [expandedBullets, setExpandedBullets] = useState<Set<number>>(new Set());
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [depth, setDepth] = useLocalState<Depth>("m2_depth", "medium");

  // 拔高型 persona / 已勾过类别 / 已有 stories → 进 chat;否则进类别枚举
  const ambitious = isAmbitiousPersonaTag(profile.persona_tag);
  const [enumerating, setEnumerating] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const needEnum =
      !ambitious && categories.length === 0 && intake.stories.length === 0;
    setEnumerating(needEnum);
    setPendingCats(categories);
    setMessages([
      { from: "ai", text: buildOpener(profile.persona_tag, categories) },
    ]);
  }, [profile.persona_tag, ambitious, categories, intake.stories.length]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    const newMessages: ChatMsg[] = [
      ...messages,
      { from: "user", text },
    ];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/m2/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          history: newMessages.map((m) => ({
            role: m.from === "ai" ? "assistant" : "user",
            content: m.text,
          })),
          persona_tag: profile.persona_tag,
          categories,
          depth,
          current_intake: intake,
          current_bullets: bullets,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();

      if (data.delta_intake) {
        setIntake((prev) => mergeIntake(prev, data.delta_intake));
      }
      if (Array.isArray(data.delta_bullets) && data.delta_bullets.length > 0) {
        setBullets((prev) => [...prev, ...data.delta_bullets]);
      }
      if (data.phase) setPhase(data.phase as Phase);
      if (data.done) setDone(true);

      const next = (data.next_question ?? "").trim();
      if (next) {
        setMessages((prev) => [...prev, { from: "ai", text: next }]);
      } else if (data.done) {
        setMessages((prev) => [
          ...prev,
          {
            from: "ai",
            text: data.reason ?? "我们挖得够了 — 可以去整理简历啦。",
          },
        ]);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "网络或服务异常,稍后再试";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [
    input,
    loading,
    messages,
    profile.persona_tag,
    categories,
    depth,
    intake,
    bullets,
    setIntake,
    setBullets,
  ]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const reset = () => {
    if (!confirm("清空本次挖掘,从头开始?(intake + bullets + 类别勾选 都会清)")) return;
    setIntake({ roles: [], stories: [] });
    setBullets([]);
    setCategories([]);
    setPendingCats([]);
    setEnumerating(!ambitious);
    setMessages([{ from: "ai", text: buildOpener(profile.persona_tag, []) }]);
    setPhase("anchor");
    setDone(false);
    setError(null);
    setExpandedBullets(new Set());
  };

  const confirmCategories = () => {
    setCategories(pendingCats);
    setEnumerating(false);
    setMessages([
      { from: "ai", text: buildOpener(profile.persona_tag, pendingCats) },
    ]);
  };

  const toggleCat = (key: string) => {
    setPendingCats((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleBulletExpand = (i: number) => {
    setExpandedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const copyBullet = async (i: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(i);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      setError("复制失败,请手动选中复制");
    }
  };

  const copyAllSummary = async () => {
    try {
      await navigator.clipboard.writeText(buildResumeMarkdown(intake));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      setError("复制失败,请手动选中复制");
    }
  };

  const hasAnySummary = intake.roles.length > 0 || intake.stories.length > 0;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <div className="flex">
          <Suspense fallback={<aside className="w-60 flex-shrink-0" />}>
            <ConversationSwitcher module="m2" basePath="/m2" defaultTitle="经历" />
          </Suspense>
          <div className="flex-1 min-w-0">

        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              把零散经历讲明白
            </h1>
            <p className="text-ink-soft text-sm">
              没简历也行 — 我一段一段陪你挖,挖出来直接转 STAR bullet 进简历
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8">
          {/* 左:你的素材积累 + 统计 */}
          <aside className="space-y-5">
            <Card className="p-5 border-2 border-border">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-ink">
                  📄 你的素材积累
                </p>
                {hasAnySummary && (
                  <button
                    onClick={copyAllSummary}
                    className="px-2 py-0.5 text-[10px] rounded-md bg-esther-yellow/30 text-ink hover:bg-esther-yellow/50 transition-colors"
                  >
                    {copiedAll ? "✓ 已复制" : "📋 全部"}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-ink-muted mb-3 italic">
                {hasAnySummary
                  ? "(随你说的内容慢慢成形,可直接复制到简历)"
                  : "(还没素材 — 跟 AI 聊几轮,这里会自动累积)"}
              </p>
              {intake.roles.length > 0 && (
                <div className="space-y-3">
                  {intake.roles.map((r, i) => (
                    <div
                      key={`r-${i}`}
                      className="bg-warm-bg-deep/30 border border-border rounded-lg p-2.5"
                    >
                      <p className="text-[11px] text-ink-muted mb-0.5">
                        经历 {i + 1}
                      </p>
                      <p className="text-xs font-medium text-ink leading-tight">
                        {r.role}{" "}
                        <span className="text-ink-soft">· {r.org_type}</span>
                      </p>
                      {r.period && (
                        <p className="text-[11px] text-ink-muted mt-0.5">
                          {r.period}
                        </p>
                      )}
                      {r.charter && (
                        <p className="text-[11px] text-ink mt-1 leading-snug">
                          核心: {r.charter}
                        </p>
                      )}
                      {r.scale && (
                        <p className="text-[11px] text-ink leading-snug">
                          规模: {r.scale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {intake.stories.length > 0 && (
                <>
                  <div className="flex items-center gap-2 mt-4 mb-2">
                    <div className="flex-1 h-px bg-border" />
                    <p className="text-[10px] text-ink-muted">故事</p>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="space-y-2.5">
                    {intake.stories.map((s, i) => {
                      const badge = CATEGORY_BADGE[s.category];
                      return (
                        <div
                          key={`s-${i}`}
                          className="bg-warm-bg-deep/30 border border-border rounded-lg p-2.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-medium text-ink leading-tight flex-1">
                              {s.title || `故事 ${i + 1}`}
                            </p>
                            <span
                              className={`inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.cls}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-[10px] text-esther-yellow leading-none mt-1">
                            {"⭐".repeat(s.strength || 0)}
                          </p>
                          {s.earned_secret && (
                            <p className="text-[11px] text-ink-soft italic mt-1.5 leading-snug">
                              「{s.earned_secret}」
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </Card>

            <Card className="p-4 border border-border bg-card">
              <p className="text-[11px] text-ink-muted leading-relaxed">
                已挖 <b className="text-ink">{intake.roles.length}</b> 段经历 ·{" "}
                <b className="text-ink">{intake.stories.length}</b> 个故事 ·{" "}
                <b className="text-ink">{bullets.length}</b> 条候选 bullet
              </p>

              {/* 已识别证据 panel(plan offer-1-sparkling-hippo P1)
                  从 roles 的 charter + scale 和 stories 的 star.result 抽取数字 / 规模 / 角色名等
                  让用户看到 "原来这些细节已经被记住了" */}
              {(() => {
                const evidence: string[] = [];
                // 从 roles 拿 scale 和 role
                intake.roles.forEach((r) => {
                  if (r.scale) evidence.push(`${r.scale}(${r.role ?? "角色"})`);
                  else if (r.role) evidence.push(r.role);
                });
                // 从 stories 抽数字证据
                const NUM_RE = /\d+\.?\d*[+]?[%]?(?:\s*(?:人|份|个|场|条|篇|轮|款|家|位|名|周|月|小时|分钟))?/g;
                intake.stories.forEach((s) => {
                  const result = s.star?.result ?? "";
                  const matches = result.match(NUM_RE);
                  if (matches) matches.slice(0, 2).forEach((m) => evidence.push(m));
                });
                const unique = Array.from(new Set(evidence)).slice(0, 8);
                if (unique.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-[10px] text-ink-muted mb-1 font-display italic uppercase tracking-wider">
                      Evidence captured
                    </p>
                    <p className="text-[10px] text-ink-soft mb-2">已识别证据:</p>
                    <div className="flex flex-wrap gap-1">
                      {unique.map((ev, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-1.5 py-0.5 rounded bg-esther-blue/10 text-esther-blue text-[10px]"
                        >
                          {ev}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <button
                onClick={reset}
                className="mt-3 text-[11px] text-ink-soft hover:text-esther-red transition-colors underline"
              >
                清空重来
              </button>
            </Card>
          </aside>

          {/* 右:真聊天 */}
          <div>
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">经历挖掘对话</span>{" "}
                · 当前阶段:<span className="text-esther-blue">{phase}</span>
              </p>
              <div className="flex items-center gap-2">
                <label className="text-[11px] text-ink-soft flex items-center gap-1">
                  🎚 追问深度
                  <select
                    value={depth}
                    onChange={(e) => setDepth(e.target.value as Depth)}
                    className="ml-1 px-2 py-1 rounded-md border border-border bg-card text-xs text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40 cursor-pointer"
                    title={
                      DEPTH_OPTIONS.find((d) => d.value === depth)?.hint
                    }
                  >
                    {DEPTH_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} — {opt.hint}
                      </option>
                    ))}
                  </select>
                </label>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                    done
                      ? "bg-esther-blue/15 text-esther-blue border-esther-blue/40"
                      : "bg-warm-bg-deep text-ink-muted border-border"
                  }`}
                >
                  {done ? "✓ 挖完了" : "P1 真 LLM"}
                </span>
              </div>
            </div>

            <Card className="border-2 border-border overflow-hidden">
              <div className="bg-warm-bg-deep/40 px-5 py-3 border-b border-border flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-base">
                  🤖
                </div>
                <p className="text-xs text-ink">
                  <span className="font-medium">经历挖掘 AI</span> ·
                  一段一段问,一 turn 一问
                </p>
              </div>

              <div
                ref={scrollRef}
                className="p-5 space-y-4 max-h-[600px] overflow-y-auto"
              >
                {enumerating && (
                  <div className="bg-esther-yellow/10 border border-esther-yellow/40 rounded-xl p-4 mb-2">
                    <p className="text-xs font-semibold text-ink mb-1">
                      📋 Step 1 · 勾你大学里沾边做过的事(多选,沾边都算)
                    </p>
                    <p className="text-[11px] text-ink-soft mb-3 leading-relaxed">
                      不用想"有没有价值" — 帮室友补习、组织聚餐、写过宿舍群通知都算。
                      勾完点确认,AI 会按勾的类逐个挖 + 翻译成简历能用的句子。
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {EXPERIENCE_CATEGORIES.map((cat) => {
                        const selected = pendingCats.includes(cat.key);
                        return (
                          <button
                            key={cat.key}
                            onClick={() => toggleCat(cat.key)}
                            className={`text-left p-2.5 rounded-lg border transition-colors ${
                              selected
                                ? "bg-esther-blue text-white border-esther-blue"
                                : "bg-card border-border hover:border-esther-blue/50 text-ink"
                            }`}
                          >
                            <p className="text-xs font-medium">
                              {selected ? "✓ " : ""}
                              {cat.label}
                            </p>
                            <p
                              className={`text-[10px] mt-0.5 ${
                                selected ? "text-white/80" : "text-ink-muted"
                              }`}
                            >
                              {cat.hint}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] text-ink-muted">
                        已勾 <b className="text-ink">{pendingCats.length}</b> 类
                        {pendingCats.length === 0
                          ? " · 0 也行,我会主动追问"
                          : ""}
                      </p>
                      <button
                        onClick={confirmCategories}
                        className="px-4 py-1.5 rounded-full text-xs font-medium bg-esther-blue text-white hover:bg-esther-blue/90 transition-colors"
                      >
                        确认 → 开始挖
                      </button>
                    </div>
                  </div>
                )}
                {messages.map((d, i) => (
                  <div
                    key={i}
                    className={`flex gap-3 ${
                      d.from === "user" ? "flex-row-reverse" : "flex-row"
                    }`}
                  >
                    <div
                      className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                        d.from === "user"
                          ? "bg-esther-yellow/30"
                          : "bg-esther-blue/15"
                      }`}
                    >
                      {d.from === "user" ? "👤" : "🤖"}
                    </div>
                    <div
                      className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                        d.from === "user"
                          ? "bg-esther-yellow text-ink rounded-tr-sm"
                          : i === messages.length - 1
                          ? "bg-esther-blue text-white rounded-tl-sm"
                          : "bg-warm-bg-deep text-ink rounded-tl-sm"
                      }`}
                    >
                      {d.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3 flex-row">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-sm">
                      🤖
                    </div>
                    <div className="max-w-[80%] p-3 rounded-2xl text-sm bg-warm-bg-deep text-ink-muted rounded-tl-sm italic">
                      正在思考下一个问题…
                    </div>
                  </div>
                )}
                {error && (
                  <div className="text-xs text-esther-red bg-esther-red/10 border border-esther-red/30 rounded-lg p-2">
                    出错了: {error}
                  </div>
                )}
              </div>

              <div className="border-t border-border px-3 py-3 bg-warm-bg-deep/30 flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={
                    enumerating
                      ? "请先勾选上方类别,点确认后再聊"
                      : done
                      ? "已挖完 — 可以去简历整理啦,或继续补"
                      : "Enter 发送 · Shift+Enter 换行"
                  }
                  disabled={loading || enumerating}
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-esther-blue/40 resize-none disabled:opacity-60"
                />
                <button
                  onClick={send}
                  disabled={loading || enumerating || !input.trim()}
                  className={`px-4 py-2 rounded-full text-white text-xs font-medium transition-colors flex-shrink-0 ${
                    loading || enumerating || !input.trim()
                      ? "bg-esther-blue/50 cursor-not-allowed"
                      : "bg-esther-blue hover:bg-esther-blue/90"
                  }`}
                >
                  {loading ? "..." : "发送"}
                </button>
              </div>
            </Card>

            {bullets.length > 0 && (
              <Card className="mt-6 border-2 border-esther-blue/30 bg-esther-blue/5 overflow-hidden">
                <div className="bg-esther-blue/10 px-5 py-3 border-b border-esther-blue/20 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink flex items-center gap-2">
                    📝 你的候选 bullets ·{" "}
                    <span className="text-esther-blue">{bullets.length}</span> 条
                  </p>
                  <p className="text-[10px] text-ink-muted">
                    复制即可贴到简历,或下一步给 m3 整理
                  </p>
                </div>
                <div className="p-4 space-y-3">
                  {bullets.map((b, i) => {
                    const expanded = expandedBullets.has(i);
                    const star = b.star_breakdown;
                    return (
                      <div
                        key={i}
                        className="bg-card border border-border rounded-xl p-3"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <p className="text-xs text-ink leading-relaxed flex-1 whitespace-pre-wrap">
                            <span className="text-esther-blue font-medium mr-1.5">
                              {i + 1}.
                            </span>
                            {b.text}
                          </p>
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => copyBullet(i, b.text)}
                              className="px-2 py-0.5 text-[10px] rounded-md bg-esther-yellow/30 text-ink hover:bg-esther-yellow/50 transition-colors"
                            >
                              {copiedIdx === i ? "✓ 已复制" : "复制"}
                            </button>
                            {star && (
                              <button
                                onClick={() => toggleBulletExpand(i)}
                                className="px-2 py-0.5 text-[10px] rounded-md bg-warm-bg-deep text-ink-soft hover:bg-warm-bg-deep/70 transition-colors"
                              >
                                {expanded ? "收起 ▴" : "STAR ▾"}
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && star && (
                          <div className="mt-2 pt-2 border-t border-border space-y-1.5">
                            <div className="text-[11px] text-ink">
                              <b className="text-esther-blue">S</b>{" "}
                              <span className="text-ink-soft">情境 ·</span>{" "}
                              {star.s ||
                                (
                                  star as unknown as {
                                    situation?: string;
                                  }
                                ).situation ||
                                "-"}
                            </div>
                            <div className="text-[11px] text-ink">
                              <b className="text-esther-blue">T</b>{" "}
                              <span className="text-ink-soft">任务 ·</span>{" "}
                              {star.t ||
                                (star as unknown as { task?: string }).task ||
                                "-"}
                            </div>
                            <div className="text-[11px] text-ink">
                              <b className="text-esther-blue">A</b>{" "}
                              <span className="text-ink-soft">行动 ·</span>{" "}
                              {star.a ||
                                (
                                  star as unknown as { action?: string }
                                ).action ||
                                "-"}
                            </div>
                            <div className="text-[11px] text-ink">
                              <b className="text-esther-blue">R</b>{" "}
                              <span className="text-ink-soft">结果 ·</span>{" "}
                              {star.r ||
                                (
                                  star as unknown as { result?: string }
                                ).result ||
                                "-"}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <Link
                href="/m3"
                className={`block p-4 rounded-xl border-2 bg-card transition-colors ${
                  done
                    ? "border-esther-blue ring-2 ring-esther-blue/30 hover:bg-esther-blue/5"
                    : "border-border hover:border-esther-blue"
                }`}
              >
                <p className="text-sm font-medium text-esther-blue mb-1 flex items-center gap-2">
                  挖完了 → 整理成简历 →
                  {done && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-esther-blue text-white">
                      就绪
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink-soft">
                  AI 把挖出的故事直接写成 STAR bullet 进 Word
                </p>
              </Link>
              <Link
                href="/m4"
                className="block p-4 rounded-xl border-2 border-border bg-card hover:border-esther-blue transition-colors"
              >
                <p className="text-sm font-medium text-esther-blue mb-1">
                  发现 gap → 设计项目补 →
                </p>
                <p className="text-xs text-ink-soft">
                  挖完发现缺真用户研究?2-4 周可以做一个
                </p>
              </Link>
            </div>
          </div>
        </div>

          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
