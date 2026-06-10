"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { DiaryChatPanel } from "@/components/DiaryChatPanel";
import { Card } from "@/components/ui/card";
import {
  countByPeriod,
  exportDiaryJson,
  getDiaryEntries,
  hasDiaryConsent,
  setDiaryConsent,
  WEATHER_OPTIONS,
  WEATHER_LABELS,
  MOOD_OPTIONS,
  MOOD_LABELS,
  type DiaryEntry,
  type DiaryEntryMetadata,
  type WeatherEmoji,
  type MoodEmoji,
} from "@/lib/diary";
import { useDiarySync } from "@/lib/useDiarySync";
import { compressImage } from "@/lib/image-compress";
import { STORAGE_KEYS } from "@/lib/use-local-state";

/**
 * 把单条日记 entry 写入 M3 素材池(plan offer-1-sparkling-hippo P1)
 * 用与 M5 复盘"一键回写"相同的 HIDDEN_EXPERIENCES schema,统一通道。
 * 不调 LLM(避免延迟),直接用 entry.content 作为 raw_user_material;
 * 用户后续在 M3 里会看到"来自日记"的素材,LLM suggest-edits 会基于此产 source="experience" 的 edit。
 */
function sendDiaryEntryToM3Pool(entry: DiaryEntry): { ok: boolean; reason?: string } {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS.HIDDEN_EXPERIENCES);
    const existing = (() => {
      try {
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })();
    const existingIds = new Set(
      existing.map((x: { question_id?: string }) => x.question_id).filter(Boolean),
    );
    const qid = `diary-${entry.id}`;
    if (existingIds.has(qid)) {
      return { ok: false, reason: "这条日记已经送过了" };
    }
    const date = entry.createdAt.slice(0, 10);
    const tag =
      entry.source === "ai-summary"
        ? "不二整理"
        : entry.source === "buer-chat"
          ? "不二记录"
          : "自己写";
    const topic = entry.title?.trim() || entry.content.slice(0, 20).replace(/\s+/g, " ");
    const newHidden = {
      question_id: qid,
      topic_name: `日记 · ${tag} · ${topic}… · ${date}`,
      raw_user_material: entry.content,
      star_breakdown: null,
      candidate_bullets: [] as Array<{ text: string; anti_fab_note: string | null }>,
      skeptical_flags: [`来自日记原文(${tag}),未拆 STAR,M3 会基于 raw_user_material 推断 bullet`],
    };
    // ai-summary 的 highlights 数组直接转为 candidate_bullets,让 LLM 有更明确起点
    if (Array.isArray(entry.highlights)) {
      entry.highlights.forEach((h: string) => {
        newHidden.candidate_bullets.push({
          text: h,
          anti_fab_note: "来自不二整理日记的亮点摘要,未经核对的数字请你确认",
        });
      });
    }
    const next = [...existing, newHidden];
    window.localStorage.setItem(STORAGE_KEYS.HIDDEN_EXPERIENCES, JSON.stringify(next));
    return { ok: true };
  } catch (e) {
    console.error("[diary] send to M3 failed", e);
    return { ok: false, reason: "存储失败" };
  }
}

/**
 * /diary — 「温馨小窝」(plan §8.21 v3)
 *
 * 设计要点:
 *   - Hero 温馨视觉(暖色 / 装饰 SVG / 不二头像)
 *   - 顶部 2 选 1 大卡:🖋️ 自己写 / 💬 跟不二聊聊
 *   - 自己写 form 加 metadata:日期/天气/心情/地点(chip 选,不强制打字)
 *   - 聊聊 mode 内嵌 DiaryChatPanel(独立对话,不二 = 日记引导师)
 *   - timeline 卡片二元 chip:🖋️ 自己写 / 💬 不二记录
 *   - anti-fab 4 层完整继承 §8.20
 */

type Mode = "idle" | "writing" | "chatting";

function fmtDateOnly(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtWeekday(iso: string): string {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(iso).getDay()];
}

function todayDateInput(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupByDate(entries: DiaryEntry[]): Array<{ date: string; items: DiaryEntry[] }> {
  const map = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    const d = e.metadata?.date || fmtDateOnly(e.createdAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(e);
  }
  return Array.from(map.entries())
    .map(([date, items]) => ({ date, items }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default function DiaryPage() {
  const { addEntry, deleteEntry, clearAllEntries, loadFromDB, userLoading } =
    useDiarySync();
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  // 已送 M3 素材池 / M2 经历池 的 entry id 集合(plan offer-1-sparkling-hippo P1/P2)
  const [sentToM3, setSentToM3] = useState<Set<string>>(new Set());
  const [sentToM2, setSentToM2] = useState<Set<string>>(new Set());
  // hydrate sentToM3 / sentToM2 from storage
  useEffect(() => {
    try {
      const rawHidden = window.localStorage.getItem(STORAGE_KEYS.HIDDEN_EXPERIENCES);
      const arr = rawHidden ? JSON.parse(rawHidden) : [];
      if (Array.isArray(arr)) {
        const ids = new Set<string>();
        arr.forEach((h: { question_id?: string }) => {
          if (h.question_id?.startsWith("diary-")) {
            ids.add(h.question_id.slice("diary-".length));
          }
        });
        setSentToM3(ids);
      }
    } catch {
      /* ignore */
    }
    try {
      const rawIntake = window.localStorage.getItem("intake_artifact");
      const obj = rawIntake ? JSON.parse(rawIntake) : null;
      const stories = obj && Array.isArray(obj.stories) ? obj.stories : [];
      const ids = new Set<string>();
      stories.forEach((s: { id?: string }) => {
        if (s.id?.startsWith("diary-")) ids.add(s.id.slice("diary-".length));
      });
      setSentToM2(ids);
    } catch {
      /* ignore */
    }
  }, [loaded]);

  function handleSendEntryToM3(entry: DiaryEntry) {
    const r = sendDiaryEntryToM3Pool(entry);
    if (r.ok) {
      setSentToM3((s) => new Set(s).add(entry.id));
    } else if (r.reason) {
      alert(r.reason);
    }
  }

  // 日记 → M2 经历回流(plan offer-1-sparkling-hippo P2)
  // 把单条日记 entry 转成 IntakeStory 写入 intake_artifact,M2 后续会用它生成 bullet 草稿
  function handleSendEntryToM2(entry: DiaryEntry) {
    try {
      const raw = window.localStorage.getItem("intake_artifact");
      const existing = (() => {
        try {
          const o = raw ? JSON.parse(raw) : null;
          return o && typeof o === "object" ? o : { roles: [], stories: [] };
        } catch {
          return { roles: [], stories: [] };
        }
      })();
      const stories: Array<{ id: string }> = Array.isArray(existing.stories) ? existing.stories : [];
      const newId = `diary-${entry.id}`;
      if (stories.some((s) => s.id === newId)) {
        alert("这条日记已经送过 M2 了");
        return;
      }
      const title = entry.title?.trim() || entry.content.slice(0, 24).replace(/\s+/g, " ");
      const story = {
        id: newId,
        title: `日记 · ${title}`,
        category: "LearningSprint" as const,
        strength: 2 as const,
        star: {
          situation: "(来自日记记录的真实经历,未拆 STAR;由 M2 在挖掘对话中补全)",
          task: "",
          action: entry.content.slice(0, 400),
          result: entry.highlights?.join("; ") ?? "",
        },
      };
      const next = {
        ...existing,
        stories: [...stories, story],
        roles: Array.isArray(existing.roles) ? existing.roles : [],
      };
      window.localStorage.setItem("intake_artifact", JSON.stringify(next));
      setSentToM2((s) => new Set(s).add(entry.id));
    } catch (e) {
      console.error("[diary] send to M2 failed", e);
      alert("送 M2 失败");
    }
  }

  // 🖋️ 自己写 form
  const [newContent, setNewContent] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [metaDate, setMetaDate] = useState<string>(todayDateInput());
  const [metaWeather, setMetaWeather] = useState<WeatherEmoji | null>(null);
  const [metaMood, setMetaMood] = useState<MoodEmoji | null>(null);
  const [metaPlace, setMetaPlace] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageSizeKB, setImageSizeKB] = useState<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);

  // 隐藏式确认 / 折叠态
  const [confirmClear, setConfirmClear] = useState(false);
  const [rawOpenIds, setRawOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEntries(getDiaryEntries());
    setLoaded(true);
    if (!hasDiaryConsent()) setShowConsent(true);
  }, []);

  // 登录用户:从 DB 回灌日记并进本地(跨设备 / 清缓存恢复)。等 auth 落定再拉,
  // 随 loadFromDB(随 user 变)重跑。没有这步,新设备只会看到空的本地日记。
  useEffect(() => {
    if (userLoading) return;
    loadFromDB().then((merged) => {
      if (merged && merged.length > 0) setEntries(merged);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoading, loadFromDB]);

  const refresh = () => setEntries(getDiaryEntries());

  const resetWriteForm = () => {
    setNewContent("");
    setNewTitle("");
    setMetaDate(todayDateInput());
    setMetaWeather(null);
    setMetaMood(null);
    setMetaPlace("");
    setImagePreview(null);
    setImageSizeKB(null);
    setImageError(null);
  };

  const handleAdd = async () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    const metadata: DiaryEntryMetadata = {};
    if (metaDate && metaDate !== todayDateInput()) metadata.date = metaDate;
    else if (metaDate) metadata.date = metaDate;
    if (metaWeather) metadata.weather = metaWeather;
    if (metaMood) metadata.mood = metaMood;
    if (metaPlace.trim()) metadata.place = metaPlace.trim();
    await addEntry({
      content: trimmed,
      title: newTitle.trim() || undefined,
      imageBase64: imagePreview ?? null,
      source: "diary-page",
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
    resetWriteForm();
    setMode("idle");
    refresh();
  };

  const handleImagePick = async (file: File | undefined | null) => {
    if (!file) return;
    setImageError(null);
    setImageBusy(true);
    try {
      const r = await compressImage(file);
      setImagePreview(r.dataUrl);
      setImageSizeKB(r.sizeKB);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "图片处理失败");
      setImagePreview(null);
      setImageSizeKB(null);
    } finally {
      setImageBusy(false);
    }
  };

  const removeImage = () => {
    setImagePreview(null);
    setImageSizeKB(null);
    setImageError(null);
  };

  const handleDelete = async (id: string) => {
    await deleteEntry(id);
    refresh();
  };

  const handleClearAll = async () => {
    await clearAllEntries();
    setConfirmClear(false);
    refresh();
  };

  const handleExport = () => {
    const blob = new Blob([exportDiaryJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `diary-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConsentOk = () => {
    setDiaryConsent();
    setShowConsent(false);
  };

  const toggleRawDialog = (id: string) => {
    setRawOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const grouped = groupByDate(entries);
  const stats = loaded ? countByPeriod() : { week: 0, month: 0, total: 0 };

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {/* ====== 首次进 → 隐私同意 modal ====== */}
        {showConsent && (
          <div className="fixed inset-0 z-50 bg-ink/30 backdrop-blur-sm flex items-center justify-center px-6">
            <Card className="max-w-md p-6 border-2 border-esther-blue">
              <p className="text-2xl mb-3">📔</p>
              <h2 className="text-lg font-bold text-ink mb-3">先说一下小窝怎么存</h2>
              <ul className="text-sm text-ink-soft space-y-2 mb-5 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  你写的 / 不二帮你整理的日记 都只存在<strong className="text-ink">你浏览器本地</strong>,后端零持久化
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  清浏览器缓存 = 日记全部丢失(我们也救不回来)
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  m3 简历整理可<strong className="text-ink">明示同意</strong>后读日记,挖可写进简历的素材
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  随时可<strong className="text-ink">导出 JSON 备份</strong>或一键清空
                </li>
              </ul>
              <button
                onClick={handleConsentOk}
                className="w-full rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                我知道了,进小窝 →
              </button>
            </Card>
          </div>
        )}

        {/* ====== Hero 温馨小窝 ====== */}
        <section className="relative border-b border-border bg-gradient-to-b from-warm-bg-deep/30 to-warm-bg overflow-hidden">
          {/* 装饰大字 */}
          <div className="pointer-events-none absolute -right-8 top-8 select-none leading-none font-display italic text-[clamp(5rem,12vw,11rem)] text-esther-blue/10">
            diary
          </div>
          {/* 手绘风装饰 */}
          <svg
            className="absolute top-16 left-12 w-7 h-7 text-esther-yellow opacity-80 pointer-events-none hidden md:block"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
          </svg>
          <svg
            className="absolute bottom-12 left-1/3 w-5 h-5 text-esther-red opacity-60 pointer-events-none hidden md:block"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M12 21s-7-4.5-9.5-9.5C0 7 4 3 8 5.5 10 7 11 9 12 10c1-1 2-3 4-4.5C20 3 24 7 21.5 11.5 19 16.5 12 21 12 21z" />
          </svg>

          <div className="max-w-[1100px] mx-auto px-6 py-14 relative">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-6"
            >
              ← 回首页
            </Link>

            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <p className="font-display italic text-sm text-esther-blue mb-2">
                  Your cozy diary corner
                </p>
                <h1 className="text-3xl md:text-5xl font-bold text-ink mb-4 leading-tight">
                  你的小窝
                </h1>
                <p className="text-base text-ink-soft leading-relaxed max-w-xl">
                  在这里,
                  <span className="bg-esther-yellow/40 mx-1" style={{ padding: "0 0.15em" }}>
                    生活值得被记录
                  </span>
                  ,
                  <span className="bg-esther-yellow/40 mx-1" style={{ padding: "0 0.15em" }}>
                    情绪值得被接住
                  </span>
                  。可以自己慢慢写,也可以跟不二聊聊,她帮你整理。
                </p>

                {/* 隐私 + 统计 */}
                <div className="mt-6 flex items-center gap-4 flex-wrap">
                  <p className="text-xs text-ink-muted font-display italic">
                    🔒 仅存浏览器本地 · 后端零持久化
                  </p>
                  {loaded && stats.total > 0 && (
                    <div className="flex gap-3 text-xs text-ink-soft font-display italic">
                      <span>
                        本周 <strong className="text-esther-blue">{stats.week}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        本月 <strong className="text-esther-blue">{stats.month}</strong>
                      </span>
                      <span>·</span>
                      <span>
                        总 <strong className="text-esther-blue">{stats.total}</strong>
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 不二头像装饰 */}
              <div className="hidden md:block relative">
                <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-esther-yellow animate-pulse" />
                <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-esther-yellow shadow-lg">
                  <Image
                    src="/esther-assets/avatar.jpg"
                    alt="不二"
                    width={96}
                    height={96}
                    className="object-cover"
                  />
                </div>
                <p className="text-[11px] text-ink-muted text-center mt-2 font-display italic">
                  不二 · 陪你记录
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ====== 2 选 1 入口大卡 ====== */}
        {mode === "idle" && (
          <section className="border-b border-border">
            <div className="max-w-[1100px] mx-auto px-6 py-10">
              <p className="font-display italic text-sm text-esther-blue mb-2">
                Two ways to record
              </p>
              <h2 className="text-xl font-bold text-ink mb-6">
                今天想怎么记?
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 🖋️ 自己写 */}
                <button
                  onClick={() => setMode("writing")}
                  className="group p-7 rounded-3xl border-2 border-esther-blue/40 bg-card hover:border-esther-blue hover:shadow-md transition-all text-left"
                >
                  <div className="text-3xl mb-3">🖋️</div>
                  <h3 className="text-lg font-bold text-ink mb-2">
                    自己写
                  </h3>
                  <p className="text-sm text-ink-soft mb-4 leading-relaxed">
                    慢慢写,把今天梳理一遍。可以加日期 / 天气 / 心情 / 地点 / 一张图。
                  </p>
                  <span className="inline-flex items-center text-sm font-medium text-esther-blue group-hover:translate-x-0.5 transition-transform">
                    开始写 →
                  </span>
                </button>

                {/* 💬 跟不二聊聊 */}
                <button
                  onClick={() => setMode("chatting")}
                  className="group p-7 rounded-3xl border-2 border-esther-yellow/60 bg-esther-yellow/10 hover:border-esther-yellow hover:shadow-md transition-all text-left"
                >
                  <div className="text-3xl mb-3">💬</div>
                  <h3 className="text-lg font-bold text-ink mb-2">
                    跟不二聊聊
                  </h3>
                  <p className="text-sm text-ink-soft mb-4 leading-relaxed">
                    随便说几句今天的事,像跟朋友聊。她帮你整理成日记(第一人称,你说什么她记什么)。
                  </p>
                  <span className="inline-flex items-center text-sm font-medium text-esther-blue group-hover:translate-x-0.5 transition-transform">
                    开始聊 →
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* ====== 🖋️ 自己写 form ====== */}
        {mode === "writing" && (
          <section className="border-b border-border bg-warm-bg-deep/30">
            <div className="max-w-[900px] mx-auto px-6 py-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-ink flex items-center gap-2">
                  🖋️ 自己写一笔
                </h2>
                <button
                  onClick={() => {
                    resetWriteForm();
                    setMode("idle");
                  }}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  ✕ 返回
                </button>
              </div>

              <Card className="p-5 border-2 border-esther-blue bg-card">
                {/* metadata 行 */}
                <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-3 mb-4 pb-4 border-b border-border">
                  {/* 日期 */}
                  <div>
                    <label className="text-[11px] text-ink-muted mb-1.5 block font-display italic">
                      日期
                    </label>
                    <input
                      type="date"
                      value={metaDate}
                      onChange={(e) => setMetaDate(e.target.value)}
                      className="text-sm bg-warm-bg border border-border rounded-md px-2 py-1.5 text-ink focus:outline-none focus:border-esther-blue"
                    />
                  </div>
                  {/* 地点 */}
                  <div>
                    <label className="text-[11px] text-ink-muted mb-1.5 block font-display italic">
                      在哪呀(可选)
                    </label>
                    <input
                      type="text"
                      value={metaPlace}
                      onChange={(e) => setMetaPlace(e.target.value)}
                      placeholder="学校 / 咖啡馆 / 家里 ..."
                      className="w-full text-sm bg-warm-bg border border-border rounded-md px-2 py-1.5 text-ink placeholder:text-ink-muted/70 focus:outline-none focus:border-esther-blue"
                    />
                  </div>
                </div>

                {/* 天气 chip */}
                <div className="mb-3">
                  <label className="text-[11px] text-ink-muted mb-1.5 block font-display italic">
                    天气
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEATHER_OPTIONS.map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setMetaWeather(metaWeather === w ? null : w)}
                        className={`px-3 py-1.5 rounded-full text-base border-2 transition-all ${
                          metaWeather === w
                            ? "border-esther-blue bg-esther-blue/10"
                            : "border-border bg-card hover:border-esther-blue/50"
                        }`}
                        title={WEATHER_LABELS[w]}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 心情 chip */}
                <div className="mb-4 pb-4 border-b border-border">
                  <label className="text-[11px] text-ink-muted mb-1.5 block font-display italic">
                    心情
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOOD_OPTIONS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMetaMood(metaMood === m ? null : m)}
                        className={`px-3 py-1.5 rounded-full text-base border-2 transition-all flex items-center gap-1.5 ${
                          metaMood === m
                            ? "border-esther-blue bg-esther-blue/10"
                            : "border-border bg-card hover:border-esther-blue/50"
                        }`}
                      >
                        <span>{m}</span>
                        <span className="text-[10px] text-ink-soft">
                          {MOOD_LABELS[m]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 标题 */}
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="一句话总结(选填)"
                  className="w-full text-base font-semibold bg-transparent text-ink placeholder:text-ink-muted/70 focus:outline-none border-b border-border pb-2 mb-3"
                />
                {/* 正文 */}
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="今天发生了什么?做了什么?学到了什么?有什么感受?都可以..."
                  rows={6}
                  autoFocus
                  className="w-full text-sm text-ink leading-relaxed bg-transparent placeholder:text-ink-muted/70 focus:outline-none resize-none"
                />

                {/* 图片 */}
                <div className="mt-3 pt-3 border-t border-border">
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="预览"
                        className="max-h-48 rounded-lg border border-border"
                      />
                      <button
                        onClick={removeImage}
                        className="absolute top-1 right-1 w-7 h-7 rounded-full bg-ink/70 hover:bg-ink text-white text-sm leading-none flex items-center justify-center"
                        aria-label="删除图片"
                      >
                        ×
                      </button>
                      {imageSizeKB !== null && (
                        <p className="text-[11px] text-ink-muted mt-1.5 font-display italic">
                          已压缩到 {imageSizeKB} KB
                        </p>
                      )}
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card text-xs text-ink-soft hover:border-esther-blue hover:text-esther-blue transition-colors cursor-pointer">
                      <span>🖼️</span>
                      <span>{imageBusy ? "压缩中..." : "加张图(单张,可选)"}</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={imageBusy}
                        onChange={(e) => {
                          handleImagePick(e.target.files?.[0]);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                  {imageError && (
                    <p className="text-xs text-esther-red mt-2">⚠️ {imageError}</p>
                  )}
                </div>

                {/* 控件 */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <p className="text-xs text-ink-muted font-display italic">
                    {newContent.length} 字
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        resetWriteForm();
                        setMode("idle");
                      }}
                      className="px-4 py-2 text-sm text-ink-soft hover:text-ink transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAdd}
                      disabled={!newContent.trim()}
                      className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      保存到小窝 →
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          </section>
        )}

        {/* ====== 💬 跟不二聊聊 panel ====== */}
        {mode === "chatting" && (
          <section className="border-b border-border bg-warm-bg-deep/30">
            <div className="max-w-[900px] mx-auto px-6 py-8">
              <DiaryChatPanel
                onClose={() => setMode("idle")}
                onSaved={refresh}
              />
            </div>
          </section>
        )}

        {/* ====== Timeline ====== */}
        <section>
          <div className="max-w-[1100px] mx-auto px-6 py-12">
            <div className="flex items-baseline justify-between mb-6 flex-wrap gap-2">
              <h2 className="text-xl font-bold text-ink">📔 时间线</h2>
              {mode === "idle" && entries.length > 0 && (
                <div className="text-xs text-ink-muted font-display italic">
                  按日期分组,新 → 旧
                </div>
              )}
            </div>

            {!loaded ? (
              <p className="text-center text-sm text-ink-muted py-12">加载中…</p>
            ) : entries.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-6xl mb-5">🌱</p>
                <h2 className="text-xl font-bold text-ink mb-3">小窝还空着</h2>
                <p className="text-sm text-ink-soft mb-2 leading-relaxed max-w-md mx-auto">
                  上面 2 个入口都可以 — 自己写一笔,或者跟不二聊几句
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {grouped.map((g) => (
                  <div key={g.date}>
                    {/* 日期 header */}
                    <div className="flex items-baseline gap-3 mb-5 pb-2 border-b-2 border-esther-blue/20">
                      <svg className="w-4 h-4 text-esther-yellow flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z" />
                      </svg>
                      <h3 className="text-lg font-bold text-ink">{g.date}</h3>
                      <span className="text-xs text-ink-muted font-display italic">
                        · {fmtWeekday(g.items[0].createdAt)} · {g.items.length} 条
                      </span>
                    </div>

                    <div className="space-y-3 pl-6 border-l-2 border-esther-blue/10">
                      {g.items.map((e) => {
                        const meta = e.metadata;
                        const sMeta = e.summary_meta;
                        const isAi = e.source === "ai-summary" || e.source === "buer-chat";
                        const isFormalDiary = e.source === "ai-summary" && (
                          (e.highlights && e.highlights.length > 0) || sMeta
                        );
                        return (
                          <Card
                            key={e.id}
                            className={`border-2 hover:shadow-md transition-all ${
                              isFormalDiary
                                ? "p-0 border-esther-yellow/40 bg-gradient-to-b from-warm-bg-deep/30 to-warm-bg hover:border-esther-yellow/80"
                                : "p-5 border-border hover:border-esther-blue/60"
                            }`}
                          >
                            {/* === v5 §8.23 仪式感日记本 (ai-summary + highlights) === */}
                            {isFormalDiary ? (
                              <div className="p-5">
                                {/* 顶部 metadata 栏 */}
                                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-esther-blue/20">
                                  <p className="text-xs font-display italic text-esther-blue">
                                    {g.date} · {fmtWeekday(e.createdAt)} · {fmtTime(e.createdAt)}
                                  </p>
                                  <div className="flex items-center gap-2 text-base">
                                    {sMeta?.weather && <span title="天气">{sMeta.weather}</span>}
                                    {sMeta?.mood && <span title="心情">{sMeta.mood}</span>}
                                    {sMeta?.place && (
                                      <span className="text-xs text-ink-muted">📍 {sMeta.place}</span>
                                    )}
                                  </div>
                                </div>

                                {/* 诗意 title */}
                                {e.title && (
                                  <>
                                    <h4 className="font-display italic text-xl font-bold text-ink text-center leading-snug">
                                      {e.title}
                                    </h4>
                                    <p className="text-center text-xs text-esther-blue/60 my-2 font-display italic tracking-widest">
                                      · · ·
                                    </p>
                                  </>
                                )}

                                {/* highlights 亮点 list */}
                                {e.highlights && e.highlights.length > 0 && (
                                  <ul className="space-y-1.5 mb-4 pl-2">
                                    {e.highlights.map((h, idx) => (
                                      <li
                                        key={idx}
                                        className="text-sm text-ink leading-relaxed flex items-start gap-2"
                                      >
                                        <span className="text-esther-yellow mt-1 text-xs flex-shrink-0">●</span>
                                        <span>{h}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {/* content 自语 */}
                                {e.content && (
                                  <p
                                    className="text-sm text-ink-soft leading-loose whitespace-pre-wrap break-words italic"
                                    style={{ fontFamily: "var(--font-display, serif)" }}
                                  >
                                    {e.content}
                                  </p>
                                )}

                                {/* 图片 */}
                                {e.imageBase64 && (
                                  <div className="mt-3">
                                    <img
                                      src={e.imageBase64}
                                      alt="日记附图"
                                      className="max-h-64 rounded-lg border border-border"
                                    />
                                  </div>
                                )}

                                {/* 底部 chip + 送 M3 素材 + 删除(plan offer-1-sparkling-hippo P1) */}
                                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-esther-blue/20 flex-wrap">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-esther-yellow/40 text-ink border border-esther-yellow/70">
                                    💬 不二记录
                                    {e.rawDialog && (
                                      <span className="ml-1 font-display italic font-normal opacity-80">
                                        · {e.rawDialog.length} 条对话
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-3 ml-auto flex-wrap">
                                    <button
                                      type="button"
                                      onClick={() => handleSendEntryToM3(e)}
                                      disabled={sentToM3.has(e.id)}
                                      className="text-xs text-esther-blue hover:text-esther-blue-dark transition-colors disabled:text-ink-muted disabled:cursor-not-allowed"
                                    >
                                      {sentToM3.has(e.id) ? "✓ 已送 M3" : "📌 送 M3 素材池"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendEntryToM2(e)}
                                      disabled={sentToM2.has(e.id)}
                                      className="text-xs text-esther-yellow hover:text-amber-700 transition-colors disabled:text-ink-muted disabled:cursor-not-allowed"
                                    >
                                      {sentToM2.has(e.id) ? "✓ 已送 M2" : "🧰 送 M2 经历"}
                                    </button>
                                    <button
                                      onClick={() => handleDelete(e.id)}
                                      className="text-xs text-ink-muted hover:text-esther-red transition-colors font-display italic"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <>
                                {/* === 简单卡(diary-page 自己写 + buer-chat 单条桥接)=== */}
                                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-display italic text-xs text-esther-blue">
                                      {fmtTime(e.createdAt)}
                                    </span>
                                    {isAi ? (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-esther-yellow/40 text-ink border border-esther-yellow/70">
                                        💬 不二记录
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-esther-blue/15 text-esther-blue border border-esther-blue/30">
                                        🖋️ 自己写
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 flex-wrap">
                                    {/* 送 M3 素材池 + 送 M2 经历(plan offer-1-sparkling-hippo P1/P2) */}
                                    <button
                                      type="button"
                                      onClick={() => handleSendEntryToM3(e)}
                                      disabled={sentToM3.has(e.id)}
                                      className="text-xs text-esther-blue hover:text-esther-blue-dark transition-colors disabled:text-ink-muted disabled:cursor-not-allowed"
                                    >
                                      {sentToM3.has(e.id) ? "✓ 已送 M3" : "📌 送 M3 素材池"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendEntryToM2(e)}
                                      disabled={sentToM2.has(e.id)}
                                      className="text-xs text-esther-yellow hover:text-amber-700 transition-colors disabled:text-ink-muted disabled:cursor-not-allowed"
                                    >
                                      {sentToM2.has(e.id) ? "✓ 已送 M2" : "🧰 送 M2 经历"}
                                    </button>
                                    <button
                                      onClick={() => handleDelete(e.id)}
                                      className="text-xs text-ink-muted hover:text-esther-red transition-colors font-display italic"
                                      aria-label="删除此条"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>

                                {meta && (meta.weather || meta.mood || meta.place) && (
                                  <p className="text-xs text-ink-soft mb-2 flex flex-wrap gap-2 items-center font-display italic">
                                    {meta.weather && (
                                      <span title={WEATHER_LABELS[meta.weather]}>{meta.weather}</span>
                                    )}
                                    {meta.mood && (
                                      <span title={MOOD_LABELS[meta.mood]}>{meta.mood}</span>
                                    )}
                                    {meta.place && (
                                      <span className="text-ink-muted">📍 {meta.place}</span>
                                    )}
                                  </p>
                                )}

                                {e.title && (
                                  <p className="text-base font-semibold text-ink mb-2 leading-snug">
                                    {e.title}
                                  </p>
                                )}
                                <p className="text-sm text-ink-soft leading-relaxed whitespace-pre-wrap break-words">
                                  {e.content}
                                </p>
                                {e.imageBase64 && (
                                  <div className="mt-3">
                                    <img
                                      src={e.imageBase64}
                                      alt="日记附图"
                                      className="max-h-64 rounded-lg border border-border"
                                    />
                                  </div>
                                )}
                              </>
                            )}

                            {/* anti-fab 第 3 层 — 看原始对话(仅 ai-summary)*/}
                            {e.source === "ai-summary" &&
                              e.rawDialog &&
                              e.rawDialog.length > 0 && (
                                <div className={`mt-3 pt-3 border-t border-border ${isFormalDiary ? "px-5 pb-4" : ""}`}>
                                  <button
                                    onClick={() => toggleRawDialog(e.id)}
                                    className="text-xs text-ink-muted hover:text-esther-blue transition-colors font-display italic"
                                  >
                                    {rawOpenIds.has(e.id)
                                      ? "▾ 收起原始对话"
                                      : "📜 看原始对话(对照,验证 AI 没编)"}
                                  </button>
                                  {rawOpenIds.has(e.id) && (
                                    <div className="mt-3 p-3 rounded-lg bg-warm-bg-deep/50 border border-border space-y-2">
                                      <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-2 font-display italic">
                                        你的原话(精简版)
                                      </p>
                                      {e.rawDialog.map((line, i) => (
                                        <p
                                          key={i}
                                          className="text-xs text-ink-soft leading-relaxed whitespace-pre-wrap break-words"
                                        >
                                          <span className="text-esther-blue/60 mr-1.5 font-display italic">
                                            ({i + 1})
                                          </span>
                                          {line}
                                        </p>
                                      ))}
                                      <p className="text-[10px] text-ink-muted italic pt-2 border-t border-border/60">
                                        AI 仅重组上面这些话,不应加新信息 / 数字 / 名字
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )}
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ====== 底部 actions ====== */}
        {loaded && entries.length > 0 && (
          <section className="border-t border-border bg-warm-bg-deep/30">
            <div className="max-w-[1100px] mx-auto px-6 py-8 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-xs text-ink-muted font-display italic max-w-md">
                导出做本地备份 · 或一键清空(不可恢复)
              </p>
              <div className="flex gap-3 items-center flex-wrap">
                <button
                  onClick={handleExport}
                  className="px-4 py-2 rounded-full border border-border bg-card text-sm text-ink-soft hover:border-esther-blue hover:text-ink transition-colors"
                >
                  ↓ 导出 JSON
                </button>
                {!confirmClear ? (
                  <button
                    onClick={() => setConfirmClear(true)}
                    className="px-4 py-2 rounded-full border border-esther-red/30 bg-card text-sm text-esther-red hover:bg-esther-red/5 transition-colors"
                  >
                    清空全部
                  </button>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-esther-red/40 bg-esther-red/5">
                    <span className="text-xs text-esther-red font-medium">
                      确定?不可恢复
                    </span>
                    <button
                      onClick={handleClearAll}
                      className="text-xs text-esther-red font-bold hover:underline"
                    >
                      是,删除
                    </button>
                    <span className="text-ink-muted">/</span>
                    <button
                      onClick={() => setConfirmClear(false)}
                      className="text-xs text-ink-soft hover:text-ink"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <BuerFloatingButton />
      </main>
    </>
  );
}
