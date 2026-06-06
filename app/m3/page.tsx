"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";
import { useM3Data, type ParsedResume, type JdCtx } from "@/lib/sync/useM3Data";
import { useUser } from "@/lib/auth/useUser";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { createClient } from "@/lib/supabase/client";
import { extractTextFromPdf } from "@/lib/pdf-extract";
import { extractTextFromDocx } from "@/lib/docx-extract";
import {
  M3_OPTIMIZATION_GOALS,
  M3_DEFAULT_GOALS,
  type M3OptimizationGoalKey,
} from "@/lib/m3-optimization-goals";

/**
 * 模块 3 · 简历整理 — 多会话版(plan §8.24)
 *
 * Layout: 左 ConversationSwitcher sidebar + 右主内容
 * 数据隔离:
 *   - 游客:localStorage 单轨(沿用)
 *   - 登录 + 有 convId:从 m3_resumes 表读(按 conversation_id + RLS 防越权)
 *   - 登录 + 没 convId:提示"选左侧会话或新建"
 */

export default function Module3Page() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="min-h-screen bg-warm-bg">
            <div className="h-20" />
            <div className="text-center text-ink-muted py-20">加载中…</div>
          </main>
        </>
      }
    >
      <Module3Content />
    </Suspense>
  );
}

function Module3Content() {
  const sp = useSearchParams();
  const convId = sp.get("c");
  const { user, loading: userLoading } = useUser();
  const { data, loading: dataLoading, isGuest, hasConv } = useM3Data(convId);

  const [hydrated, setHydrated] = useState(false);
  const [fromDebrief, setFromDebrief] = useState(false);
  useEffect(() => {
    setHydrated(true);
    setFromDebrief(
      new URLSearchParams(window.location.search).get("from") === "debrief",
    );
  }, []);

  const parsedResume = data.parsed;
  const jdContext = data.jd;
  const hiddenExperiences = data.hidden;
  const finalResume = data.final;

  // 旧的 hasParsed/hasJd 用 useM3Data 静态读;
  // 下方 inline 操作完会 setLocalParsedRaw/setLocalJdRaw → effectiveHasParsed/effectiveHasJd 取代
  const isQuickMode = jdContext?.meta?.mode === "quick";
  const hasFinal = !!finalResume?.markdown;

  const convQs = convId ? `?c=${convId}` : "";

  // §8.28 step 3 — 优化目标多选 chip(localStorage,跨 conv 用户偏好)
  const [optimizationGoals, setOptimizationGoals] = useLocalState<M3OptimizationGoalKey[]>(
    STORAGE_KEYS.M3_OPTIMIZATION_GOALS,
    M3_DEFAULT_GOALS,
  );

  function toggleGoal(key: M3OptimizationGoalKey) {
    setOptimizationGoals((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }

  // ============ §8.28 inline 解析:文件 + JD ============
  // 本地副本 + 双轨保存(localStorage 游客;DB 登录)
  const [localParsed, setLocalParsedRaw] = useState<ParsedResume | null>(null);
  const [localJd, setLocalJdRaw] = useState<JdCtx | null>(null);
  // 用 data 初始化本地副本,后续 inline 操作覆盖
  useEffect(() => {
    if (data.parsed) setLocalParsedRaw(data.parsed);
  }, [data.parsed]);
  useEffect(() => {
    if (data.jd) setLocalJdRaw(data.jd);
  }, [data.jd]);

  const effectiveParsed = localParsed ?? parsedResume;
  const effectiveJd = localJd ?? jdContext;
  const effectiveHasParsed = !!effectiveParsed?.basic;
  const effectiveHasJd = !!effectiveJd?.jd_summary;

  async function persistParsed(parsed: unknown) {
    setLocalParsedRaw(parsed as ParsedResume);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.PARSED_RESUME, JSON.stringify(parsed));
    }
    if (user && convId) {
      await createClient()
        .from("m3_resumes")
        .update({ parsed_resume_json: parsed })
        .eq("conversation_id", convId);
    }
  }
  async function persistJd(jd: unknown) {
    setLocalJdRaw(jd as JdCtx);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEYS.JD_CONTEXT, JSON.stringify(jd));
    }
    if (user && convId) {
      await createClient()
        .from("m3_resumes")
        .update({ jd_context_json: jd })
        .eq("conversation_id", convId);
    }
  }

  // Step 1 file picker state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsingResume, setParsingResume] = useState(false);
  const [resumeErr, setResumeErr] = useState<string | null>(null);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset 让同一文件能再选
    if (!file) return;
    setParsingResume(true);
    setResumeErr(null);
    try {
      const lower = file.name.toLowerCase();
      let text = "";
      if (lower.endsWith(".pdf")) {
        const r = await extractTextFromPdf(file);
        text = r.text;
      } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
        const r = await extractTextFromDocx(file);
        text = r.text;
      } else if (lower.endsWith(".md") || lower.endsWith(".txt")) {
        text = await file.text();
      } else {
        throw new Error("仅支持 PDF / Word / Markdown / TXT");
      }
      if (!text.trim() || text.trim().length < 50) {
        throw new Error("文件内容太短或提取失败,请换一份或粘贴文字");
      }
      const res = await fetch("/api/m3/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: text.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `解析失败 (${res.status})`);
      }
      const parsed = await res.json();
      await persistParsed(parsed);
    } catch (err) {
      setResumeErr(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsingResume(false);
    }
  }

  // Step 2 JD inline state — 默认展开 textarea(已有 JD 时自动收起显示摘要)
  const [jdExpanded, setJdExpanded] = useState(true);
  const [jdText, setJdText] = useState("");
  const [parsingJd, setParsingJd] = useState(false);
  const [jdErr, setJdErr] = useState<string | null>(null);
  // 已有 JD 摘要 → 自动收起;没 JD 时维持展开(用户点"取消"才会折叠)
  useEffect(() => {
    if (effectiveHasJd) setJdExpanded(false);
  }, [effectiveHasJd]);

  // 从 m6 跳过来 → 自动预填 jdText + 展开 Step 2
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M6_PENDING_JD);
      if (!raw) return;
      const pending = JSON.parse(raw) as {
        jdText?: string;
        roleName?: string;
        company?: string;
        from_m6?: boolean;
      };
      if (pending.from_m6 && pending.jdText && pending.jdText.length > 50) {
        setJdText(pending.jdText);
        setJdExpanded(true);
        window.localStorage.removeItem(STORAGE_KEYS.M6_PENDING_JD);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** §8.28 — "用这份 JD" 立即保存 raw,不调 LLM;/m3/result 进去时统一 parse+suggest 一次性跑 */
  async function handleSaveJd() {
    const text = jdText.trim();
    if (!text || text.length < 30) {
      setJdErr("JD 内容太短,请贴完整一点");
      return;
    }
    setParsingJd(true);
    setJdErr(null);
    try {
      await persistJd({
        jd_summary: text.length > 40 ? text.slice(0, 40) + "…" : text,
        rawJdText: text,
        meta: { mode: "raw" },
      });
      setJdExpanded(false);
      setJdText("");
    } catch (err) {
      setJdErr(err instanceof Error ? err.message : "保存失败");
    } finally {
      setParsingJd(false);
    }
  }

  // 登录但没选 conv → 空状态
  const needPickConv = !userLoading && !!user && !hasConv;
  const isLoadingAll = userLoading || (!isGuest && hasConv && dataLoading);

  // Step 4 enable 条件:有简历 + 至少勾 1 个 goal
  const canSubmit = effectiveHasParsed && optimizationGoals.length > 0;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        {fromDebrief && (
          <section className="bg-esther-yellow/40 border-b-2 border-esther-yellow">
            <div className="max-w-[1300px] mx-auto px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-sm text-ink flex items-center gap-2">
                <span className="text-base">↩️</span>
                你刚刚从「模拟面试复盘」跳过来 — 改完简历可以回去继续看
              </p>
              <Link
                href="/m5/debrief"
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm whitespace-nowrap"
              >
                ← 返回复盘
              </Link>
            </div>
          </section>
        )}

        <div className="flex">
          <ConversationSwitcher module="m3" basePath="/m3" defaultTitle="简历" />

          <div className="flex-1 min-w-0">
            {/* Hero — 学竞品极简风 */}
            <section className="border-b border-border">
              <div className="max-w-[900px] mx-auto px-6 py-10">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-4"
                >
                  ← 回首页
                </Link>
                <h1 className="text-2xl md:text-3xl font-bold text-ink mb-1.5 leading-tight">
                  AI 简历优化
                </h1>
                <p className="text-ink-soft text-sm">
                  基于 ATS 与目标岗位进行关键词与结构优化
                </p>
              </div>
            </section>

            {/* 主内容 */}
            {needPickConv ? (
              <div className="max-w-[900px] mx-auto px-6 py-20 text-center">
                <h2 className="text-xl font-semibold text-ink mb-3">
                  选择左侧会话,或新建一份简历
                </h2>
                <p className="text-sm text-ink-soft max-w-md mx-auto">
                  每份简历独立保存,可同时投不同公司、不同岗位
                </p>
              </div>
            ) : isLoadingAll || !hydrated ? (
              <div className="max-w-[900px] mx-auto px-6 py-20 text-center text-ink-muted">
                加载中…
              </div>
            ) : (
              <div className="max-w-[900px] mx-auto px-6 py-10 space-y-8">
                {/* ============ Step 1 · 选简历(inline file picker) ============ */}
                <Step
                  no="1"
                  title="选一份简历"
                  required
                  hint="选择需要优化的简历"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.md,.txt"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  {effectiveHasParsed ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-esther-blue/30 bg-esther-blue/[0.04] px-4 py-3">
                      <div className="text-sm text-ink leading-snug">
                        <span className="text-esther-blue font-semibold">✓ 已读到</span>{" "}
                        <span className="font-medium">
                          {effectiveParsed?.basic?.name ?? "?"}
                          {effectiveParsed?.basic?.major
                            ? ` · ${effectiveParsed.basic.major}`
                            : ""}
                          {effectiveParsed?.basic?.year_level
                            ? ` · ${effectiveParsed.basic.year_level}`
                            : ""}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={parsingResume}
                        className="text-xs text-ink-muted hover:text-esther-blue transition-colors disabled:opacity-40"
                      >
                        {parsingResume ? "解析中…" : "换一份 →"}
                      </button>
                    </div>
                  ) : parsingResume ? (
                    <div className="rounded-xl border border-esther-blue/30 bg-esther-blue/[0.04] px-4 py-6 text-center">
                      <div className="inline-block animate-spin w-6 h-6 border-2 border-esther-blue border-t-transparent rounded-full mb-2" />
                      <p className="text-sm text-ink-soft">解析中,约 5-10 秒…</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-left rounded-xl border-2 border-esther-blue/30 bg-card hover:border-esther-blue hover:bg-esther-blue/[0.04] transition-all p-4"
                        >
                          <p className="text-base mb-1.5">📎</p>
                          <p className="text-sm font-semibold text-ink mb-1">
                            上传现有简历
                          </p>
                          <p className="text-xs text-ink-soft">
                            PDF / Word / Markdown 浏览器本地解析
                          </p>
                        </button>
                        <Link
                          href="/m2"
                          className="text-left rounded-xl border-2 border-esther-yellow/50 bg-esther-yellow/[0.06] hover:border-esther-yellow hover:bg-esther-yellow/[0.12] transition-all p-4 relative"
                        >
                          <span className="absolute top-3 right-3 text-[10px] text-ink-muted font-display italic">
                            ⭐ 差异化
                          </span>
                          <p className="text-base mb-1.5">💬</p>
                          <p className="text-sm font-semibold text-ink mb-1">
                            从我的经历挖一份
                          </p>
                          <p className="text-xs text-ink-soft">
                            还没简历?跟 AI 聊聊就能整理出来
                          </p>
                        </Link>
                      </div>
                      <p className="text-[11px] text-ink-muted mt-2">
                        也可以
                        <Link
                          href={`/m3/upload${convQs}`}
                          className="text-esther-blue hover:underline ml-1"
                        >
                          粘贴简历文字 →
                        </Link>
                      </p>
                    </>
                  )}
                  {resumeErr && (
                    <p className="text-xs text-esther-red mt-2">⚠️ {resumeErr}</p>
                  )}
                </Step>

                {/* ============ Step 2 · 目标岗位(inline textarea,默认展开) ============ */}
                <Step no="2" title="目标岗位 JD" hint="粘贴目标岗位 JD 全文 — AI 会按 JD 关键词 + 任职要求做针对性优化">
                  {effectiveHasJd && !jdExpanded ? (
                    <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-esther-blue/30 bg-esther-blue/[0.04] px-4 py-3">
                      <div className="flex-1 min-w-[200px] text-sm text-ink leading-snug">
                        <span className="text-esther-blue font-semibold">🎯</span>{" "}
                        <span className="font-medium">{effectiveJd?.jd_summary}</span>
                        {effectiveJd?.priority_score ? (
                          <span className="text-ink-soft ml-2">
                            · 匹配 {effectiveJd.priority_score}/5
                          </span>
                        ) : null}
                        {isQuickMode && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-esther-yellow text-ink text-[10px]">
                            快速模式
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setJdExpanded(true);
                          setJdText("");
                        }}
                        className="text-xs text-ink-muted hover:text-esther-blue transition-colors"
                      >
                        改 JD →
                      </button>
                    </div>
                  ) : jdExpanded ? (
                    <div className="rounded-xl border border-esther-blue/30 bg-card p-4 space-y-3">
                      <textarea
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                        rows={6}
                        placeholder="粘贴 JD 全文 — 岗位职责 / 任职要求 / 加分项,越完整越准"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-warm-bg/40 text-sm text-ink leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
                        disabled={parsingJd}
                      />
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-ink-muted">
                          字数 {jdText.length}
                          {jdText.length > 0 && jdText.length < 30 && (
                            <span className="text-esther-red ml-2">太短,贴完整点</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setJdExpanded(false);
                              setJdText("");
                              setJdErr(null);
                            }}
                            disabled={parsingJd}
                            className="text-xs text-ink-muted hover:text-ink"
                          >
                            取消
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveJd}
                            disabled={parsingJd || jdText.trim().length < 30}
                            className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            {parsingJd ? "保存中…" : "用这份 JD →"}
                          </button>
                        </div>
                      </div>
                      {jdErr && (
                        <p className="text-xs text-esther-red">⚠️ {jdErr}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setJdExpanded(true)}
                      disabled={!effectiveHasParsed}
                      className="w-full flex items-center justify-between gap-3 rounded-xl border border-dashed border-border bg-warm-bg-deep/20 hover:bg-warm-bg-deep/40 hover:border-esther-blue transition-colors px-4 py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="text-sm text-ink-soft">
                        + 粘贴 JD 文本
                      </span>
                      <span className="text-xs text-esther-blue">展开输入框 →</span>
                    </button>
                  )}
                </Step>

                {/* ============ Step 3 · 优化目标(6 chip 多选) ============ */}
                <Step
                  no="3"
                  title="优化目标"
                  required
                  hint="请选择希望重点优化的方向(可多选)"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {M3_OPTIMIZATION_GOALS.map((g) => {
                      const selected = optimizationGoals.includes(g.key);
                      return (
                        <button
                          key={g.key}
                          type="button"
                          onClick={() => toggleGoal(g.key)}
                          className={`relative text-left rounded-xl border-2 px-4 py-3 transition-all ${
                            selected
                              ? "border-esther-blue bg-esther-blue/[0.04]"
                              : "border-border bg-card hover:border-esther-blue/40"
                          }`}
                        >
                          <span
                            className={`absolute top-3 right-3 w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold ${
                              selected
                                ? "bg-esther-blue text-white"
                                : "border border-border bg-card"
                            }`}
                          >
                            {selected ? "✓" : ""}
                          </span>
                          <div className="flex items-center gap-2 mb-1 pr-7">
                            <span className="text-base">{g.emoji}</span>
                            <span className="text-sm font-semibold text-ink leading-snug">
                              {g.title}
                            </span>
                          </div>
                          <p className="text-xs text-ink-soft pr-7">
                            {g.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-ink-muted mt-2">
                    选中的方向会作为 AI 生成建议的优先级提示 · 全选 = 默认全做
                  </p>
                </Step>

                {/* ============ Step 4 · 开始优化 ============ */}
                <div className="pt-2">
                  {canSubmit ? (
                    <Link
                      href={`/m3/result${convQs}`}
                      className="w-full inline-flex items-center justify-center rounded-xl bg-esther-blue text-white px-6 py-3.5 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
                    >
                      {hasFinal ? "看你的简历 + 下载 Word →" : "开始优化 →"}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full inline-flex items-center justify-center rounded-xl bg-esther-blue/40 text-white px-6 py-3.5 text-base font-medium cursor-not-allowed"
                    >
                      {!effectiveHasParsed
                        ? "请先在 Step 1 选简历"
                        : "请先在 Step 3 至少勾 1 个优化方向"}
                    </button>
                  )}
                  <p className="text-xs text-ink-muted mt-3 text-center">
                    {hasFinal
                      ? "已生成建议 · 点开看逐条采纳"
                      : "AI 根据你勾选的方向生成针对性建议"}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}

/** §8.28 — 竞品式 step 块:编号圆圈 + 标题(*必填)+ 小副标题 + 内容 */
function Step({
  no,
  title,
  required,
  hint,
  children,
}: {
  no: string;
  title: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-esther-blue text-white text-xs font-bold">
          {no}
        </span>
        <h2 className="text-base md:text-lg font-semibold text-ink">
          {title}
          {required && <span className="text-esther-red ml-1">*</span>}
        </h2>
      </div>
      {hint && (
        <p className="text-xs text-ink-soft mb-4 pl-9 leading-relaxed">
          {hint}
        </p>
      )}
      <div className="pl-9">{children}</div>
    </section>
  );
}
