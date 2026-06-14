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
  const [mode, setMode] = useState<Mode>("idle");

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
                    🔒 游客存浏览器本地 · 登录后加密存云
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
