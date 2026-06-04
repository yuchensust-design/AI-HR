"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  addEntry,
  clearAllEntries,
  countByPeriod,
  deleteEntry,
  exportDiaryJson,
  getDiaryEntries,
  hasDiaryConsent,
  setDiaryConsent,
  type DiaryEntry,
} from "@/lib/diary";

/**
 * /diary — 日记 timeline 主入口
 *
 * 设计要点(plan §8.19 §B.3):
 *   - 顶部 隐私 banner 长期可见(localStorage 本地 / 清缓存即清空 / 后端零持久化)
 *   - 顶部 + 新增日记(inline form)
 *   - timeline 按日分组,新 → 旧
 *   - 空状态:大字温柔 + 引导
 *   - 底部:导出 JSON / 清空全部
 *
 * 跟 PRD §3.8.6 兼容:日记 ≠ 「不二」 chat,这里只存用户主动写入的事实记录
 */

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fmtWeekday(iso: string): string {
  const wd = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return wd[new Date(iso).getDay()];
}

function groupByDate(entries: DiaryEntry[]): Array<{ date: string; items: DiaryEntry[] }> {
  const map = new Map<string, DiaryEntry[]>();
  for (const e of entries) {
    const d = fmtDate(e.createdAt);
    if (!map.has(d)) map.set(d, []);
    map.get(d)!.push(e);
  }
  return Array.from(map.entries()).map(([date, items]) => ({ date, items }));
}

export default function DiaryPage() {
  const [entries, setEntries] = useState<DiaryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showConsent, setShowConsent] = useState(false);

  // 新建日记 form
  const [newContent, setNewContent] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [composing, setComposing] = useState(false);

  // 隐藏式确认(清空 / 删除)
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setEntries(getDiaryEntries());
    setLoaded(true);
    if (!hasDiaryConsent()) {
      setShowConsent(true);
    }
  }, []);

  const refresh = () => setEntries(getDiaryEntries());

  const handleAdd = () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    addEntry({
      content: trimmed,
      title: newTitle.trim() || undefined,
      source: "diary-page",
    });
    setNewContent("");
    setNewTitle("");
    setComposing(false);
    refresh();
  };

  const handleDelete = (id: string) => {
    deleteEntry(id);
    refresh();
  };

  const handleClearAll = () => {
    clearAllEntries();
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
              <h2 className="text-lg font-bold text-ink mb-3">先说一下日记怎么存</h2>
              <ul className="text-sm text-ink-soft space-y-2 mb-5 leading-relaxed">
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  日记**只存在你的浏览器本地**(localStorage),后端零持久化
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  清浏览器缓存 = 日记全部丢失,我们也救不回来
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  m3 简历整理可以**明示同意**后读日记,挖可写进简历的素材
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-esther-blue mt-0.5">●</span>
                  你可以随时导出 JSON 备份,或一键清空全部
                </li>
              </ul>
              <button
                onClick={handleConsentOk}
                className="w-full rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                我知道了,开始写日记 →
              </button>
            </Card>
          </div>
        )}

        {/* ====== Header ====== */}
        <section className="border-b border-border">
          <div className="max-w-[900px] mx-auto px-6 py-10">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
              <Link
                href="/"
                className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors"
              >
                ← 回首页
              </Link>
            </div>

            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              📔 日记 · 你的素材小本本
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-3 leading-tight">
              今天发生了什么?随手写一笔
            </h1>
            <p className="text-sm text-ink-soft leading-relaxed max-w-2xl">
              主持了文艺晚会、做完一个 side project、被老师 cue 答辩 — 这些零碎的事其实都是
              <span
                className="bg-esther-yellow/40 mx-1"
                style={{ padding: "0 0.2em" }}
              >
                简历里能用到的素材
              </span>
              。先记下来,整理简历时让 AI 帮你挖出来。
            </p>

            {/* 隐私小字 + 统计 */}
            <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
              <p className="text-xs text-ink-muted font-display italic">
                🔒 仅存你浏览器本地 · 清缓存即清空 · 后端零持久化
              </p>
              {loaded && stats.total > 0 && (
                <div className="flex gap-3 text-xs text-ink-soft font-display italic">
                  <span>
                    本周{" "}
                    <strong className="text-esther-blue">{stats.week}</strong> 条
                  </span>
                  <span>·</span>
                  <span>
                    本月{" "}
                    <strong className="text-esther-blue">{stats.month}</strong> 条
                  </span>
                  <span>·</span>
                  <span>
                    总{" "}
                    <strong className="text-esther-blue">{stats.total}</strong> 条
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ====== 新建日记 form ====== */}
        <section className="border-b border-border bg-warm-bg-deep/40">
          <div className="max-w-[900px] mx-auto px-6 py-8">
            {!composing ? (
              <button
                onClick={() => setComposing(true)}
                className="w-full p-5 rounded-2xl border-2 border-dashed border-esther-blue/40 hover:border-esther-blue hover:bg-card transition-all text-left group"
              >
                <p className="text-base text-ink-soft group-hover:text-ink font-medium">
                  + 写一条新日记
                </p>
                <p className="text-xs text-ink-muted mt-1 font-display italic">
                  3 句话也够 · 半年后回头看就是素材库
                </p>
              </button>
            ) : (
              <Card className="p-5 border-2 border-esther-blue">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="一句话总结(选填)"
                  className="w-full text-base font-semibold bg-transparent text-ink placeholder:text-ink-muted/70 focus:outline-none border-b border-border pb-2 mb-3"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="今天发生了什么?做了什么?学到了什么?有什么感受?都可以..."
                  rows={5}
                  autoFocus
                  className="w-full text-sm text-ink leading-relaxed bg-transparent placeholder:text-ink-muted/70 focus:outline-none resize-none"
                />
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
                  <p className="text-xs text-ink-muted font-display italic">
                    {newContent.length} 字
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setComposing(false);
                        setNewContent("");
                        setNewTitle("");
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
                      保存 →
                    </button>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </section>

        {/* ====== Timeline ====== */}
        <section>
          <div className="max-w-[900px] mx-auto px-6 py-10">
            {!loaded ? (
              <p className="text-center text-sm text-ink-muted py-12">加载中…</p>
            ) : entries.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-6xl mb-5">📭</p>
                <h2 className="text-xl font-bold text-ink mb-3">还没写过日记</h2>
                <p className="text-sm text-ink-soft mb-2 leading-relaxed max-w-md mx-auto">
                  点上面的 <strong className="text-esther-blue">"+ 写一条新日记"</strong>
                  ,或者
                </p>
                <p className="text-sm text-ink-soft leading-relaxed">
                  点右下角的<strong className="text-esther-blue">「不二」</strong>
                  聊天,聊着聊着想记下来的就点"📔 记成日记"
                </p>
              </div>
            ) : (
              <div className="space-y-10">
                {grouped.map((g) => (
                  <div key={g.date}>
                    {/* 日期 header */}
                    <div className="flex items-baseline gap-3 mb-5 pb-2 border-b-2 border-esther-blue/20">
                      <span className="font-display italic text-2xl text-esther-blue/60">
                        ◆
                      </span>
                      <h3 className="text-lg font-bold text-ink">{g.date}</h3>
                      <span className="text-xs text-ink-muted font-display italic">
                        · {fmtWeekday(g.items[0].createdAt)} · {g.items.length} 条
                      </span>
                    </div>

                    {/* 当天 entries */}
                    <div className="space-y-3 pl-6 border-l-2 border-esther-blue/10">
                      {g.items.map((e) => (
                        <Card
                          key={e.id}
                          className="p-5 border-2 border-border hover:border-esther-blue/60 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-display italic text-xs text-esther-blue">
                                {fmtTime(e.createdAt)}
                              </span>
                              {e.source === "buer-chat" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-esther-yellow/30 text-ink border border-esther-yellow/60">
                                  来自不二聊天
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => handleDelete(e.id)}
                              className="text-xs text-ink-muted hover:text-esther-red transition-colors font-display italic"
                              aria-label="删除此条"
                            >
                              删除
                            </button>
                          </div>
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
                        </Card>
                      ))}
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
            <div className="max-w-[900px] mx-auto px-6 py-8 flex items-center justify-between gap-4 flex-wrap">
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
