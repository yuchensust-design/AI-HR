"use client";

/**
 * 模块 2 · 挖经历 — v2.2 重构(plan 09 §0.7)
 * 三段流程 spread→illuminate→wrap;认领多选(识别代替回忆)+ 实时素材台 + 结构化 reframe。
 * 路由 /m2
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";
import { useM2DBSync } from "@/lib/sync/useM2DBSync";
import { EXPERIENCE_CATEGORIES } from "@/lib/prompts/excavate-options";

type Phase = "spread" | "illuminate" | "wrap";

type StoryCategory =
  | "Peak" | "Challenge" | "Impact" | "Failure" | "LearningSprint" | "Praise";

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
  star: { situation: string; task: string; action: string; result: string };
  earned_secret?: string;
  jd_keywords?: string[];
};

type SkepticalFlag = { weak_spot: string; story_id?: string };

type IntakeArtifact = {
  roles: IntakeRole[];
  stories: IntakeStory[];
  skeptical_flags?: SkepticalFlag[];
};

type Sufficiency = "thin" | "draftable" | "strong";

type CandidateBullet = {
  id?: string;
  source_story_id?: string;
  source_category?: string;
  text: string;
  star_breakdown?: { s: string; t: string; a: string; r: string };
  competency?: string;
  sufficiency?: Sufficiency;
  depth_met?: boolean;
  anti_fab_note?: string;
  hidden_value?: boolean;
};

type AskOption = { label: string; competency: string; high_signal?: boolean };
type ResolvedAsk =
  | { type: "multi_select"; prompt: string; option_set: string; options: AskOption[]; other_label: string }
  | { type: "open"; prompt: string };

type ChatMsg = { from: "ai" | "user"; text: string; ask?: ResolvedAsk | null; picked?: string[] };

type UserProfile = { persona_tag?: string; selected_at?: string };

type Depth = "shallow" | "medium" | "deep";

const DEPTH_OPTIONS: { value: Depth; label: string; hint: string }[] = [
  { value: "shallow", label: "浅(默认)", hint: "认一认 + 轻问一次量化就成稿,最省事" },
  { value: "medium", label: "中", hint: "每段多追 1-2 个量化/影响维度" },
  { value: "deep", label: "深", hint: "尽量补全 STAR + 反直觉收获" },
];
const DEPTH_ORDER: Record<Depth, number> = { shallow: 0, medium: 1, deep: 2 };

const SUFFICIENCY_BADGE: Record<Sufficiency, { label: string; cls: string }> = {
  thin: { label: "待补", cls: "bg-ink-soft/15 text-ink-soft" },
  draftable: { label: "可用", cls: "bg-esther-blue/15 text-esther-blue" },
  strong: { label: "强", cls: "bg-esther-yellow/40 text-ink" },
};

const PHASE_LABEL: Record<Phase, string> = {
  spread: "铺开经历",
  illuminate: "逐段点亮",
  wrap: "收口成稿",
};

const CATEGORY_BADGE: Record<StoryCategory, { label: string; cls: string }> = {
  Peak: { label: "Peak", cls: "bg-esther-blue/15 text-esther-blue" },
  Challenge: { label: "Challenge", cls: "bg-esther-red/15 text-esther-red" },
  Impact: { label: "Impact", cls: "bg-esther-blue/15 text-esther-blue" },
  Failure: { label: "Failure", cls: "bg-ink-soft/15 text-ink-soft" },
  LearningSprint: { label: "Learning", cls: "bg-esther-yellow/40 text-ink" },
  Praise: { label: "Praise", cls: "bg-esther-yellow/40 text-ink" },
};

// F1:导出 = roles/stories(story STAR 长名不动,修 N)+ 追加可用候选 bullets(滤掉 thin 草稿)
function buildResumeMarkdown(intake: IntakeArtifact, bullets: CandidateBullet[]): string {
  const lines: string[] = [];
  if (intake.roles.length > 0) {
    lines.push("## 经历", "");
    intake.roles.forEach((r) => {
      lines.push(`**${r.role}** | ${r.org_type}${r.period ? ` | ${r.period}` : ""}`);
      if (r.charter) lines.push(`- 核心: ${r.charter}`);
      if (r.scale) lines.push(`- 规模: ${r.scale}`);
      lines.push("");
    });
  }
  if (intake.stories.length > 0) {
    lines.push("## Hero Stories", "");
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
  const usable = bullets.filter((b) => (b.sufficiency ?? "draftable") !== "thin");
  if (usable.length > 0) {
    lines.push("## 可用 bullets(可直接放进简历,【请补充】处填上你的真实数字)", "");
    usable.forEach((b) => lines.push(`- ${b.text}`));
    lines.push("");
  }
  return lines.join("\n").trim() || "(还没素材 — 跟 AI 聊几轮就会有)";
}

function isAmbitiousPersonaTag(personaTag?: string): boolean {
  if (!personaTag) return false;
  const p = personaTag.toLowerCase();
  return (
    p.includes("chen") || p.includes("陈昊") ||
    p.includes("ambitious") || p.includes("拔高")
  );
}

function openerText(personaTag?: string): string {
  if (isAmbitiousPersonaTag(personaTag)) {
    return "嗨 — 看你目标偏拔高型,我们直接挖最近最有分量的那段。先说:这段你负责的核心是什么?";
  }
  return "嗨 — 大学里做过任何事都可能是简历素材,先不用想'有没有价值'。\n下面勾一下你沾边做过的类(沾边都算),我帮你一类一类挖、翻译成简历能用的句子;懒得勾也可以直接开聊。";
}

function mergeIntake(
  prev: IntakeArtifact,
  delta: { roles?: IntakeRole[]; stories?: IntakeStory[]; skeptical_flags?: SkepticalFlag[] }
): IntakeArtifact {
  const mergedRoles = [...(prev.roles ?? [])];
  for (const r of delta.roles ?? []) {
    const idx = mergedRoles.findIndex((x) => x.role === r.role && x.period === r.period);
    if (idx >= 0) mergedRoles[idx] = { ...mergedRoles[idx], ...r };
    else mergedRoles.push(r);
  }
  const mergedStories = [...(prev.stories ?? [])];
  for (const s of delta.stories ?? []) {
    const idx = mergedStories.findIndex((x) => x.id === s.id);
    if (idx >= 0) mergedStories[idx] = { ...mergedStories[idx], ...s };
    else mergedStories.push(s);
  }
  return {
    roles: mergedRoles,
    stories: mergedStories,
    skeptical_flags: [...(prev.skeptical_flags ?? []), ...(delta.skeptical_flags ?? [])],
  };
}

// upsert by id(plan 修 F:替代纯 append);老 bullet 无 id → 用 text 兜底匹配
function mergeBullets(prev: CandidateBullet[], delta: CandidateBullet[]): CandidateBullet[] {
  const out = [...prev];
  for (const b of delta) {
    const idx = out.findIndex((x) => (b.id && x.id === b.id) || x.text === b.text);
    if (idx >= 0) out[idx] = { ...out[idx], ...b };
    else out.push(b);
  }
  return out;
}

// ===== 内联填空(复用 m3 思路:【请补充…】→ 可编辑输入框)=====
const FILL_RE = /【请补充[^】]*?】/;
const FILL_RE_G = /(【请补充[^】]*?】)/g;

function gradeBulletFE(text: string): Sufficiency {
  if (!text || /【请补充具体职责】/.test(text)) return "thin";
  const stripped = text.replace(/【[^】]*】/g, "");
  return /[0-9０-９]/.test(stripped) ? "strong" : "draftable";
}

// 把 canonical(含【请补充】)+ 用户填值 → 成稿文本(空白处保留占位)
function assembleBullet(canonical: string, vals: string[]): string {
  let i = -1;
  return canonical.replace(FILL_RE_G, (m) => {
    i++;
    const v = (vals[i] ?? "").trim();
    return v || m;
  });
}

function FillableBulletText({
  canonical,
  vals,
  onChange,
}: {
  canonical: string;
  vals: string[];
  onChange: (i: number, v: string) => void;
}) {
  const parts = canonical.split(FILL_RE_G);
  let blank = -1;
  return (
    <span className="leading-relaxed">
      {parts.map((p, i) => {
        if (FILL_RE.test(p)) {
          blank++;
          const idx = blank;
          const hint = p.replace(/[【】]/g, "").replace(/^请补充/, "") || "填这里";
          const v = vals[idx] ?? "";
          // 中文 ~1.8ch、其它 ~1ch,再留 padding,避免裁切
          const shown = v || hint;
          const w = Array.from(shown).reduce((a, ch) => a + (/[一-龥]/.test(ch) ? 1.8 : 1), 0) + 2.5;
          return (
            <input
              key={i}
              value={v}
              onChange={(e) => onChange(idx, e.target.value)}
              placeholder={hint}
              className="inline-block mx-0.5 px-1.5 py-0 align-baseline rounded border border-esther-yellow bg-esther-yellow/15 text-ink text-xs text-center focus:outline-none focus:ring-1 focus:ring-esther-blue/50"
              style={{ width: `${Math.max(w, 4)}ch` }}
            />
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

function categoryLabel(key?: string): string {
  if (!key) return "其他";
  return EXPERIENCE_CATEGORIES.find((c) => c.key === key)?.label ?? "其他";
}

export default function Module2Page() {
  const [profile] = useLocalState<UserProfile>(STORAGE_KEYS.USER_PROFILE, {});
  const [intake, setIntake] = useLocalState<IntakeArtifact>(STORAGE_KEYS.M2_INTAKE, { roles: [], stories: [] });
  const [bullets, setBullets] = useLocalState<CandidateBullet[]>(STORAGE_KEYS.M2_BULLETS, []);
  const [categories, setCategories] = useLocalState<string[]>(STORAGE_KEYS.M2_CATEGORIES, []);
  const { syncToDb, loadFromDB, isReady: dbReady } = useM2DBSync();

  useEffect(() => {
    if (!dbReady || intake.stories.length > 0 || intake.roles.length > 0) return;
    loadFromDB().then((data) => {
      if (!data) return;
      if (data.intake) setIntake(data.intake as IntakeArtifact);
      if (Array.isArray(data.bullets) && data.bullets.length > 0)
        setBullets(data.bullets as CandidateBullet[]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbReady]);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<Phase>("spread");
  const [suggestWrap, setSuggestWrap] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCats, setPendingCats] = useState<string[]>([]);
  const [expandedBullets, setExpandedBullets] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [depth, setDepth] = useLocalState<Depth>(STORAGE_KEYS.M2_DEPTH, "shallow");
  // 内联填空值:bulletId → 每个【请补充】的填值(plan:像 m3 一样可自行补充)
  const [fills, setFills] = useLocalState<Record<string, string[]>>("m2_bullet_fills", {});
  const setFill = (id: string, i: number, v: string) =>
    setFills((prev) => {
      const arr = [...(prev[id] ?? [])];
      arr[i] = v;
      return { ...prev, [id]: arr };
    });

  // 认领多选 ephemeral state(每个 ask 独立,plan 修 I)
  const [pickedOpts, setPickedOpts] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");

  const ambitious = isAmbitiousPersonaTag(profile.persona_tag);
  const [enumerating, setEnumerating] = useState<boolean>(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const needEnum = !ambitious && categories.length === 0 && intake.stories.length === 0 && intake.roles.length === 0;
    setEnumerating(needEnum);
    setPendingCats(categories);
    setMessages([{ from: "ai", text: openerText(profile.persona_tag) }]);
  }, [profile.persona_tag, ambitious, categories, intake.stories.length, intake.roles.length]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  // 新 ask 出现 → 清空上一题的勾选(ephemeral)
  useEffect(() => {
    setPickedOpts([]);
    setOtherText("");
  }, [messages.length]);

  // 核心:跑一轮(可带显式 userText / intent / picked / 重置)
  const runTurn = useCallback(
    async (opts: { userText?: string; intent?: string; picked?: string[]; reset?: boolean }) => {
      if (loading) return;
      setError(null);
      const base = opts.reset ? [] : messages;
      const newMessages: ChatMsg[] = opts.userText
        ? [...base, { from: "user", text: opts.userText, picked: opts.picked }]
        : base;
      if (opts.userText || opts.reset) setMessages(newMessages);
      setLoading(true);
      try {
        const res = await fetch("/api/m2/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            history: newMessages.map((m) => ({ role: m.from === "ai" ? "assistant" : "user", content: m.text })),
            persona_tag: profile.persona_tag,
            depth,
            intent: opts.intent,
            current_intake: intake,
            current_bullets: bullets,
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? `HTTP ${res.status}`);
        }
        const data = await res.json();

        let nextIntake = intake;
        if (Array.isArray(data.delta_roles) || Array.isArray(data.delta_stories)) {
          nextIntake = mergeIntake(intake, {
            roles: data.delta_roles ?? [],
            stories: data.delta_stories ?? [],
          });
          setIntake(nextIntake);
        }
        let nextBullets = bullets;
        if (Array.isArray(data.delta_bullets) && data.delta_bullets.length > 0) {
          nextBullets = mergeBullets(bullets, data.delta_bullets as CandidateBullet[]);
          setBullets(nextBullets);
        }
        void syncToDb(nextIntake, nextBullets);

        if (data.phase) setPhase(data.phase as Phase);
        setSuggestWrap(Boolean(data.suggest_wrap));
        if (data.done) setDone(true);

        const say = (data.say ?? "").trim();
        if (say || data.ask) {
          setMessages((prev) => [...prev, { from: "ai", text: say || "(继续)", ask: data.ask ?? null }]);
        } else if (data.done) {
          setMessages((prev) => [...prev, { from: "ai", text: data.reason ?? "挖得差不多了 — 可以去整理简历啦。" }]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "网络或服务异常,稍后再试");
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, profile.persona_tag, depth, intake, bullets, setIntake, setBullets, syncToDb]
  );

  const sendInput = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    runTurn({ userText: text });
  };

  const submitPicks = () => {
    const labels = [...pickedOpts];
    if (otherText.trim()) labels.push(otherText.trim());
    if (labels.length === 0) return;
    runTurn({ userText: `我做过:${labels.join("、")}`, picked: pickedOpts });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendInput();
    }
  };

  const onDepthChange = (nd: Depth) => {
    const up = DEPTH_ORDER[nd] > DEPTH_ORDER[depth];
    setDepth(nd);
    if (intake.roles.length > 0 || bullets.length > 0) {
      runTurn({ intent: up ? "depth_change_up" : "depth_change_down" });
    }
  };

  const reset = () => {
    if (!confirm("清空本次挖掘,从头开始?(intake + bullets + 类别勾选 都会清)")) return;
    setIntake({ roles: [], stories: [] });
    setBullets([]);
    setCategories([]);
    setPendingCats([]);
    setEnumerating(!ambitious);
    setMessages([{ from: "ai", text: openerText(profile.persona_tag) }]);
    setPhase("spread");
    setSuggestWrap(false);
    setDone(false);
    setError(null);
    setExpandedBullets(new Set());
  };

  const confirmCategories = () => {
    setCategories(pendingCats);
    setEnumerating(false);
    const labels = pendingCats
      .map((k) => EXPERIENCE_CATEGORIES.find((c) => c.key === k)?.label ?? k)
      .join("、");
    runTurn({
      reset: true,
      userText: labels ? `我大学里沾过:${labels}。先从印象最深的那段开始挖吧。` : "我不太确定有什么经历,你带我挖吧。",
    });
  };

  const startFreeChat = () => {
    setEnumerating(false);
  };

  const toggleCat = (key: string) =>
    setPendingCats((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const togglePick = (label: string) =>
    setPickedOpts((prev) => (prev.includes(label) ? prev.filter((k) => k !== label) : [...prev, label]));

  const toggleBulletExpand = (id: string) =>
    setExpandedBullets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const copyBullet = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setError("复制失败,请手动选中复制");
    }
  };

  const copyAllSummary = async () => {
    try {
      const assembled = bullets.map((b) => ({ ...b, text: assembleBullet(b.text, fills[b.id ?? b.text] ?? []) }));
      await navigator.clipboard.writeText(buildResumeMarkdown(intake, assembled));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch {
      setError("复制失败,请手动选中复制");
    }
  };

  const hasAnySummary = intake.roles.length > 0 || intake.stories.length > 0 || bullets.length > 0;
  // 素材台按来源类型分组(plan:按用户选的类型分)
  const bulletGroups = (() => {
    const order = [...EXPERIENCE_CATEGORIES.map((c) => c.key), "_other"];
    const map: Record<string, CandidateBullet[]> = {};
    bullets.forEach((b) => {
      const k = b.source_category || "_other";
      (map[k] = map[k] || []).push(b);
    });
    return order.filter((k) => map[k]?.length).map((k) => ({
      key: k,
      label: k === "_other" ? "其他" : categoryLabel(k),
      items: map[k],
    }));
  })();
  const lastMsg = messages[messages.length - 1];
  const activeAsk = lastMsg && lastMsg.from === "ai" && !loading && !done ? lastMsg.ask ?? null : null;
  const showMulti = activeAsk?.type === "multi_select";

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />
        <div className="flex">
          <Suspense fallback={<aside className="w-60 flex-shrink-0" />}>
            <ConversationSwitcher module="m2" basePath="/m2" defaultTitle="挖经历" />
          </Suspense>
          <div className="flex-1 min-w-0">
            <section className="border-b border-border">
              <div className="max-w-[1100px] mx-auto px-6 py-8">
                <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5">
                  ← 回首页
                </Link>
                <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">把零散经历讲明白</h1>
                <p className="text-ink-soft text-sm">
                  没简历也行 — 你认一认做过哪些,我帮你翻译成简历能用的 bullet,顺手点亮你没意识到的亮点
                </p>
              </div>
            </section>

            <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-8">
              {/* 左:实时素材台 */}
              <aside className="space-y-5">
                <Card className="p-5 border-2 border-border">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-ink">📄 实时素材台</p>
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
                    {hasAnySummary ? "(随你认领的内容实时长出,可直接复制到简历)" : "(还没素材 — 认几下,这里会即时累积)"}
                  </p>

                  {/* 候选 bullets = 主角(实时长出,按来源类型分组,【请补充】可内联填) */}
                  {bullets.length > 0 && (
                    <div className="space-y-4 mb-4">
                      {bulletGroups.map((g) => (
                        <div key={g.key}>
                          <p className="text-[11px] font-semibold text-ink-soft mb-1.5 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-esther-blue/60" />
                            {g.label}
                            <span className="text-ink-muted font-normal">· {g.items.length}</span>
                          </p>
                          <div className="space-y-2">
                            {g.items.map((b) => {
                              const id = b.id ?? b.text;
                              const vals = fills[id] ?? [];
                              const display = assembleBullet(b.text, vals);
                              const suf = SUFFICIENCY_BADGE[gradeBulletFE(display)];
                              const star = b.star_breakdown;
                              const expanded = expandedBullets.has(id);
                              const fillable = FILL_RE.test(b.text);
                              return (
                                <div key={id} className="bg-card border border-border rounded-lg p-2.5">
                                  <div className="flex items-start gap-2">
                                    <p className="text-xs text-ink leading-snug flex-1 whitespace-pre-wrap">
                                      {b.hidden_value && <span title="AI 帮你点亮的隐藏亮点">💡 </span>}
                                      {fillable ? (
                                        <FillableBulletText canonical={b.text} vals={vals} onChange={(i, v) => setFill(id, i, v)} />
                                      ) : (
                                        b.text
                                      )}
                                    </p>
                                    <span className={`flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${suf.cls}`}>
                                      {suf.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {b.competency && <span className="text-[10px] text-ink-muted">{b.competency}</span>}
                                    {b.anti_fab_note && <span className="text-[10px] text-ink-soft italic">· {b.anti_fab_note}</span>}
                                    <button
                                      onClick={() => copyBullet(id, display)}
                                      className="ml-auto px-1.5 py-0.5 text-[9px] rounded bg-esther-yellow/30 text-ink hover:bg-esther-yellow/50"
                                    >
                                      {copiedId === id ? "✓" : "复制"}
                                    </button>
                                    {star && (
                                      <button
                                        onClick={() => toggleBulletExpand(id)}
                                        className="px-1.5 py-0.5 text-[9px] rounded bg-warm-bg-deep text-ink-soft hover:bg-warm-bg-deep/70"
                                      >
                                        {expanded ? "收起" : "STAR"}
                                      </button>
                                    )}
                                  </div>
                                  {expanded && star && (
                                    <div className="mt-2 pt-2 border-t border-border space-y-1 text-[11px] text-ink">
                                      <div><b className="text-esther-blue">S</b> {star.s || "-"}</div>
                                      <div><b className="text-esther-blue">T</b> {star.t || "-"}</div>
                                      <div><b className="text-esther-blue">A</b> {star.a || "-"}</div>
                                      <div><b className="text-esther-blue">R</b> {star.r || "-"}</div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 底座:roles / stories(只读,供导出 + 老数据) */}
                  {intake.roles.length > 0 && (
                    <div className="space-y-2">
                      {intake.roles.map((r, i) => (
                        <div key={`r-${i}`} className="bg-warm-bg-deep/30 border border-border rounded-lg p-2">
                          <p className="text-xs font-medium text-ink leading-tight">
                            {r.role} <span className="text-ink-soft">· {r.org_type}</span>
                          </p>
                          {r.charter && <p className="text-[11px] text-ink mt-0.5 leading-snug">核心: {r.charter}</p>}
                          {r.scale && <p className="text-[11px] text-ink leading-snug">规模: {r.scale}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  {intake.stories.length > 0 && (
                    <div className="space-y-2 mt-3">
                      {intake.stories.map((s, i) => {
                        const badge = CATEGORY_BADGE[s.category];
                        return (
                          <div key={`s-${i}`} className="bg-warm-bg-deep/30 border border-border rounded-lg p-2">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-medium text-ink leading-tight flex-1">{s.title || `故事 ${i + 1}`}</p>
                              <span className={`inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.cls}`}>
                                {badge.label}
                              </span>
                            </div>
                            {s.earned_secret && (
                              <p className="text-[11px] text-ink-soft italic mt-1 leading-snug">「{s.earned_secret}」</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

                <Card className="p-4 border border-border bg-card">
                  <p className="text-[11px] text-ink-muted leading-relaxed">
                    已挖 <b className="text-ink">{intake.roles.length}</b> 段经历 ·{" "}
                    <b className="text-ink">{bullets.length}</b> 条候选 bullet
                  </p>
                  <button onClick={reset} className="mt-3 text-[11px] text-ink-soft hover:text-esther-red transition-colors underline">
                    清空重来
                  </button>
                </Card>
              </aside>

              {/* 右:对话 */}
              <div>
                <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                  <p className="text-sm text-ink-soft">
                    <span className="font-medium text-ink">挖经历对话</span> ·{" "}
                    <span className="text-esther-blue">{PHASE_LABEL[phase]}</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-ink-soft flex items-center gap-1" title="觉得挖得太浅就调高,太细就调低 — AI 按档位决定追多深">
                      🎚 挖掘深度
                      <select
                        value={depth}
                        onChange={(e) => onDepthChange(e.target.value as Depth)}
                        className="ml-1 px-2 py-1 rounded-md border border-border bg-card text-xs text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40 cursor-pointer"
                      >
                        {DEPTH_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label} — {opt.hint}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <Card className="border-2 border-border overflow-hidden">
                  <div className="bg-warm-bg-deep/40 px-5 py-3 border-b border-border flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-base">🤖</div>
                    <p className="text-xs text-ink"><span className="font-medium">挖经历 AI</span> · 认一认就好,不用凭空想</p>
                  </div>

                  <div ref={scrollRef} className="p-5 space-y-4 max-h-[600px] overflow-y-auto">
                    {/* 入口:记忆唤醒多选 + 直接开聊 */}
                    {enumerating && (
                      <div className="bg-esther-yellow/10 border border-esther-yellow/40 rounded-xl p-4 mb-2">
                        <p className="text-xs font-semibold text-ink mb-1">先认一认:大学里你沾边做过哪些?(多选,沾边都算)</p>
                        <p className="text-[11px] text-ink-soft mb-3 leading-relaxed">
                          帮室友补习、组织聚餐、写过宿舍群通知都算。勾完点开始,AI 按勾的类逐个挖。
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {EXPERIENCE_CATEGORIES.map((cat) => {
                            const selected = pendingCats.includes(cat.key);
                            return (
                              <button
                                key={cat.key}
                                onClick={() => toggleCat(cat.key)}
                                className={`text-left p-2.5 rounded-lg border transition-colors ${
                                  selected ? "bg-esther-blue text-white border-esther-blue" : "bg-card border-border hover:border-esther-blue/50 text-ink"
                                }`}
                              >
                                <p className="text-xs font-medium">{selected ? "✓ " : ""}{cat.label}</p>
                                <p className={`text-[10px] mt-0.5 ${selected ? "text-white/80" : "text-ink-muted"}`}>{cat.hint}</p>
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <button onClick={startFreeChat} className="text-[11px] text-ink-soft hover:text-esther-blue underline underline-offset-2">
                            懒得勾,直接开聊 →
                          </button>
                          <button
                            onClick={confirmCategories}
                            className="px-4 py-1.5 rounded-full text-xs font-medium bg-esther-blue text-white hover:bg-esther-blue/90 transition-colors"
                          >
                            开始挖 →
                          </button>
                        </div>
                      </div>
                    )}

                    {messages.map((d, i) => (
                      <div key={i} className={`flex gap-3 ${d.from === "user" ? "flex-row-reverse" : "flex-row"}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm ${d.from === "user" ? "bg-esther-yellow/30" : "bg-esther-blue/15"}`}>
                          {d.from === "user" ? "👤" : "🤖"}
                        </div>
                        <div className={`max-w-[80%] p-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                          d.from === "user" ? "bg-esther-yellow text-ink rounded-tr-sm"
                          : i === messages.length - 1 ? "bg-esther-blue text-white rounded-tl-sm"
                          : "bg-warm-bg-deep text-ink rounded-tl-sm"
                        }`}>
                          {d.text}
                        </div>
                      </div>
                    ))}

                    {/* 认领多选控件(跟在最新 AI ask 之后) */}
                    {showMulti && activeAsk?.type === "multi_select" && (
                      <div className="ml-11 bg-card border border-esther-blue/30 rounded-xl p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                          {activeAsk.options.map((o) => {
                            const sel = pickedOpts.includes(o.label);
                            return (
                              <button
                                key={o.label}
                                onClick={() => togglePick(o.label)}
                                className={`text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                                  sel ? "bg-esther-blue text-white border-esther-blue" : "bg-card border-border hover:border-esther-blue/50 text-ink"
                                }`}
                              >
                                {sel ? "✓ " : ""}{o.label}
                                {o.high_signal && <span className={sel ? "text-white/70" : "text-esther-yellow"}> ★</span>}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          value={otherText}
                          onChange={(e) => setOtherText(e.target.value)}
                          placeholder={activeAsk.other_label + "(可填)"}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-warm-bg-deep/30 text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-esther-blue/40 mb-2"
                        />
                        <div className="flex justify-end">
                          <button
                            onClick={submitPicks}
                            disabled={pickedOpts.length === 0 && !otherText.trim()}
                            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                              pickedOpts.length === 0 && !otherText.trim() ? "bg-esther-blue/40 text-white cursor-not-allowed" : "bg-esther-blue text-white hover:bg-esther-blue/90"
                            }`}
                          >
                            认领这些 →
                          </button>
                        </div>
                      </div>
                    )}

                    {loading && (
                      <div className="flex gap-3 flex-row">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-esther-blue/15 flex items-center justify-center text-sm">🤖</div>
                        <div className="max-w-[80%] p-3 rounded-2xl text-sm bg-warm-bg-deep text-ink-muted rounded-tl-sm italic">正在帮你整理…</div>
                      </div>
                    )}
                    {error && (
                      <div className="text-xs text-esther-red bg-esther-red/10 border border-esther-red/30 rounded-lg p-2">出错了: {error}</div>
                    )}
                  </div>

                  <div className="border-t border-border px-3 py-3 bg-warm-bg-deep/30 flex items-end gap-3">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder={enumerating ? "勾上方类别开始,或直接在这聊" : "想补充什么直接说 · Enter 发送 · Shift+Enter 换行"}
                      disabled={loading}
                      rows={2}
                      className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-esther-blue/40 resize-none disabled:opacity-60"
                    />
                    <button
                      onClick={sendInput}
                      disabled={loading || !input.trim()}
                      className={`px-4 py-2 rounded-full text-white text-xs font-medium transition-colors flex-shrink-0 ${
                        loading || !input.trim() ? "bg-esther-blue/50 cursor-not-allowed" : "bg-esther-blue hover:bg-esther-blue/90"
                      }`}
                    >
                      {loading ? "..." : "发送"}
                    </button>
                  </div>
                </Card>

                {/* 常驻收口刹车(plan 修 E:不 gate 在 suggest_wrap) */}
                {bullets.length > 0 && !done && (
                  <button
                    onClick={() => runTurn({ userText: "先看看现在能产出什么,帮我收口整理一下吧。" })}
                    disabled={loading}
                    className={`mt-4 w-full py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                      suggestWrap ? "border-esther-blue bg-esther-blue/5 text-esther-blue ring-2 ring-esther-blue/20" : "border-border bg-card text-ink-soft hover:border-esther-blue/50"
                    }`}
                  >
                    {suggestWrap ? "✓ 素材够了 — 看看成果 / 先收口" : "看看现在的成果 / 先收口"}
                  </button>
                )}

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Link
                    href="/m3"
                    className={`block p-4 rounded-xl border-2 bg-card transition-colors ${
                      done || suggestWrap ? "border-esther-blue ring-2 ring-esther-blue/30 hover:bg-esther-blue/5" : "border-border hover:border-esther-blue"
                    }`}
                  >
                    <p className="text-sm font-medium text-esther-blue mb-1 flex items-center gap-2">
                      挖完了 → 整理成简历 →
                    </p>
                    <p className="text-xs text-ink-soft">把候选 bullet + 经历带进简历整理(复制"全部"再粘进去)</p>
                  </Link>
                  <Link href="/m4" className="block p-4 rounded-xl border-2 border-border bg-card hover:border-esther-blue transition-colors">
                    <p className="text-sm font-medium text-esther-blue mb-1">发现 gap → 设计项目补 →</p>
                    <p className="text-xs text-ink-soft">挖完发现缺真用户研究?2-4 周可以做一个</p>
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
