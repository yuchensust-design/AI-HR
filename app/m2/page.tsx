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
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";

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

const PHASES = [
  "Anchor:目标方向 + 当前状态",
  "Timeline:经历轮廓(2-3 段)",
  "Per-role 挖掘:每段经历 metric mining",
  "Hero stories:挖 3-5 个 STAR 故事",
  "Gap 分析:跟目标 JD 差什么",
  "Synthesis:整合 + Skeptical Recruiter checkpoint",
];

const PHASE_HIGHLIGHT: Record<Phase, number[]> = {
  anchor: [0, 1],
  per_role: [2],
  hero_story: [3],
  skeptical: [5],
  synthesis: [4, 5],
};

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

  const highlightSet = new Set(PHASE_HIGHLIGHT[phase] ?? []);
  const maxHighlight = highlightSet.size > 0 ? Math.max(...highlightSet) : -1;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 02 · 经历挖掘
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              把零散经历讲明白
            </h1>
            <p className="text-ink-soft text-sm">
              没简历也行 — 我一段一段陪你挖,挖出来直接转 STAR bullet 进简历
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8">
          {/* 左:6 phase 进度 */}
          <aside className="space-y-5">
            <Card className="p-6 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                6-phase SOP
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">
                我们怎么挖
              </h3>
              <ol className="space-y-3">
                {PHASES.map((p, i) => {
                  const isActive = highlightSet.has(i);
                  const isPast = !done && maxHighlight > i && !isActive;
                  const isDoneAll = done;
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                          isDoneAll
                            ? "bg-esther-blue text-white"
                            : isActive
                            ? "bg-esther-blue text-white ring-2 ring-esther-blue/30"
                            : isPast
                            ? "bg-esther-blue/60 text-white"
                            : "bg-esther-blue/10 text-esther-blue"
                        }`}
                      >
                        {isDoneAll || isPast ? "✓" : i + 1}
                      </span>
                      <p
                        className={`text-xs leading-relaxed pt-1 ${
                          isActive ? "text-ink font-medium" : "text-ink"
                        }`}
                      >
                        {p}
                      </p>
                    </li>
                  );
                })}
              </ol>
            </Card>

            <Card className="p-6 border-2 border-esther-yellow/60 bg-esther-yellow/10">
              <p className="text-sm font-semibold text-ink mb-2">
                ⚡ 关键纪律: Skeptical Recruiter
              </p>
              <p className="text-xs text-ink leading-relaxed">
                hero story 拿出后 AI 会扮演「怀疑型 HR」提 3 个最尖锐的追问,
                提前暴露简历里的 weak spot — 把水分挑出来,
                而不是上线后被 HR 当面问倒。
              </p>
            </Card>

            <Card className="p-4 border border-border bg-card">
              <p className="text-[11px] text-ink-muted leading-relaxed">
                已挖 <b className="text-ink">{intake.roles.length}</b> 段经历 ·{" "}
                <b className="text-ink">{intake.stories.length}</b> 个故事 ·{" "}
                <b className="text-ink">{bullets.length}</b> 条候选 bullet
              </p>
              <button
                onClick={reset}
                className="mt-2 text-[11px] text-ink-soft hover:text-esther-red transition-colors underline"
              >
                清空重来
              </button>
            </Card>
          </aside>

          {/* 右:真聊天 */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-ink-soft">
                <span className="font-medium text-ink">经历挖掘对话</span>{" "}
                · 当前阶段:<span className="text-esther-blue">{phase}</span>
              </p>
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

        <BuerFloatingButton />
      </main>
    </>
  );
}
