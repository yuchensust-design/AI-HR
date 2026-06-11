"use client";

import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  BadgeCheck,
  Blocks,
  ChartColumnIncreasing,
  FileText,
  KeyRound,
  MessageSquareMore,
  Rocket,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  SquareDashedKanban,
  Target,
  type LucideIcon,
} from "lucide-react";
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
  M3_DIFFERENTIATORS,
  type M3OptimizationGoalKey,
} from "@/lib/m3-optimization-goals";

const M3_ICON_MAP: Record<string, LucideIcon> = {
  KeyRound,
  SquareDashedKanban,
  ChartColumnIncreasing,
  Rocket,
  Sparkles,
  Blocks,
  FileText,
  BadgeCheck,
  SearchCheck,
  ShieldCheck,
  Target,
  MessageSquareMore,
};

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
  const router = useRouter();
  const convId = sp.get("c");
  const { user, loading: userLoading } = useUser();
  const { data, loading: dataLoading, isGuest, hasConv } = useM3Data(convId);

  // 已分析过的会话(有结果)→ 点进来直达结果页四大功能,而不是停在上传页。
  // ?setup=1 可强制留在设置页(改简历/JD 用)。
  const redirectedRef = useRef(false);
  useEffect(() => {
    if (redirectedRef.current) return;
    if (sp.get("setup") === "1") return;
    if (userLoading || dataLoading) return;
    if (user && convId && data.analyzed && data.parsed) {
      redirectedRef.current = true;
      router.replace(`/m3/result?c=${convId}`);
    }
  }, [user, userLoading, convId, dataLoading, data.analyzed, data.parsed, sp, router]);

  const [hydrated, setHydrated] = useState(false);
  const [fromDebrief, setFromDebrief] = useState(false);
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  const [lastParsedAt, setLastParsedAt] = useState<string | null>(null);
  const [showPasteResume, setShowPasteResume] = useState(false);
  const [pastedResumeText, setPastedResumeText] = useState("");
  const [resumeInputMode, setResumeInputMode] = useState<"file" | "paste" | null>(null);
  const [lastAutoParsedPasteText, setLastAutoParsedPasteText] = useState("");
  useEffect(() => {
    setHydrated(true);
    setFromDebrief(
      new URLSearchParams(window.location.search).get("from") === "debrief",
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!user || !convId) {
      setConversationTitle(null);
      return;
    }
    createClient()
      .from("conversations")
      .select("title")
      .eq("id", convId)
      .maybeSingle()
      .then(({ data: row }) => {
        if (!cancelled) setConversationTitle(row?.title ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, convId]);

  const parsedResume = data.parsed;
  const jdContext = data.jd;
  const finalResume = data.final;

  // 旧的 hasParsed/hasJd 用 useM3Data 静态读;
  // 下方 inline 操作完会 setLocalParsedRaw/setLocalJdRaw → effectiveHasParsed/effectiveHasJd 取代
  const hasFinal = !!finalResume?.markdown;

  const convQs = convId ? `?c=${convId}` : "";

  // 八大规则默认全部生效,只展示不给用户选择
  const coreOptimizationGoals = useMemo(
    () => M3_OPTIMIZATION_GOALS.map((g) => g.key) as M3OptimizationGoalKey[],
    [],
  );
  const [, setOptimizationGoals] = useLocalState<M3OptimizationGoalKey[]>(
    STORAGE_KEYS.M3_OPTIMIZATION_GOALS,
    coreOptimizationGoals,
  );
  useEffect(() => {
    setOptimizationGoals(coreOptimizationGoals);
  }, [coreOptimizationGoals, setOptimizationGoals]);

  // ============ §8.28 inline 解析:文件 + JD ============
  // 本地副本 + 双轨保存(localStorage 游客;DB 登录)
  const [localParsed, setLocalParsedRaw] = useState<ParsedResume | null>(null);
  const [localJd, setLocalJdRaw] = useState<JdCtx | null>(null);
  // 用 data 初始化本地副本,后续 inline 操作覆盖
  useEffect(() => {
    // 切换会话时必须同步覆盖本地副本:
    // 新会话如果 DB 还是空,这里也要显式清空,避免上一份简历残留到当前会话里。
    setLocalParsedRaw(data.parsed ?? null);
  }, [data.parsed, convId]);
  useEffect(() => {
    setLocalJdRaw(data.jd ?? null);
  }, [data.jd, convId]);

  const effectiveParsed = localParsed ?? parsedResume;
  const effectiveJd = localJd ?? jdContext;
  const effectiveHasParsed = !!effectiveParsed?.basic;
  const effectiveHasJd = !!effectiveJd?.jd_summary;
  const effectiveParsedSavedAt = lastParsedAt ?? data.updatedAt ?? null;
  const canRepasteCurrentResume = resumeInputMode === "paste";

  function formatSavedAt(iso: string | null) {
    if (!iso) return "刚刚";
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "刚刚";
    if (mins < 60) return `${mins} 分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} 小时前`;
    return new Date(iso).toLocaleString("zh-CN", {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  // 解析结果是否"像一份真简历":有任一非空 section,或有像样姓名(≥2 个中英文字符)。
  function hasResumeSubstance(p: unknown): boolean {
    if (!p || typeof p !== "object") return false;
    const o = p as Record<string, unknown>;
    const nonEmpty = (x: unknown) => Array.isArray(x) && x.length > 0;
    const sk = (o.skills ?? {}) as Record<string, unknown>;
    const skillCount = ["languages", "frameworks", "tools", "domain"].reduce(
      (n, k) => n + (Array.isArray(sk[k]) ? (sk[k] as unknown[]).length : 0),
      0,
    );
    const name = String((o.basic as Record<string, unknown> | undefined)?.name ?? "");
    const plausibleName = /[一-龥a-zA-Z]{2,}/.test(name);
    return (
      nonEmpty(o.experience) ||
      nonEmpty(o.projects) ||
      nonEmpty(o.education) ||
      nonEmpty(o.activities) ||
      skillCount > 0 ||
      plausibleName
    );
  }

  async function parseResumeText(text: string, source: "file" | "paste") {
    const normalized = text.trim();
    if (!normalized || normalized.length < 50) {
      throw new Error("内容太短了,至少粘贴一版较完整的简历文字");
    }
    const res = await fetch("/api/m3/parse-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: normalized }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `解析失败 (${res.status})`);
    }
    const parsed = await res.json();
    // 兜底:纯乱码/无效文本会被解析成 name="?"、各 section 全空的"空简历",
    // 之前直接显示"✓ 已读到 ?"并放行(评委乱敲会看到、且白白浪费后续优化 LLM)。
    // 至少要有一个有内容的 section,或一个像样的姓名,才算识别成功。
    if (!hasResumeSubstance(parsed)) {
      throw new Error("没识别出有效的简历内容 — 请确认粘贴的是完整简历文字(姓名 / 教育 / 经历 / 技能)");
    }
    await persistParsed(parsed);
    setLastParsedAt(new Date().toISOString());
    setResumeInputMode(source);
    return parsed;
  }

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
      await parseResumeText(text, "file");
      setShowPasteResume(false);
      setPastedResumeText("");
    } catch (err) {
      setResumeErr(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsingResume(false);
    }
  }

  async function handlePasteResume() {
    setParsingResume(true);
    setResumeErr(null);
    try {
      await parseResumeText(pastedResumeText, "paste");
      setShowPasteResume(false);
      setLastAutoParsedPasteText(pastedResumeText.trim());
    } catch (err) {
      setResumeErr(err instanceof Error ? err.message : "解析失败");
    } finally {
      setParsingResume(false);
    }
  }

  useEffect(() => {
    if (!showPasteResume) return;
    const normalized = pastedResumeText.trim();
    if (normalized.length < 50) return;
    if (parsingResume) return;
    if (normalized === lastAutoParsedPasteText) return;

    const timer = setTimeout(() => {
      handlePasteResume();
    }, 900);
    return () => clearTimeout(timer);
  }, [showPasteResume, pastedResumeText, parsingResume, lastAutoParsedPasteText]);

  // Step 2 JD inline state — 永远展开,不切换摘要/编辑态
  const [jdRoleName, setJdRoleName] = useState("");
  const [jdText, setJdText] = useState("");
  const [jdAutoSaved, setJdAutoSaved] = useState(false);
  const [jdSavingError, setJdSavingError] = useState<string | null>(null);
  // 页面加载时,从 effectiveJd 灌一次初始值(只跑一次,后续用户编辑)
  const [jdHydrated, setJdHydrated] = useState(false);
  useEffect(() => {
    if (jdHydrated) return;
    if (effectiveJd) {
      const ej = effectiveJd as { role_name?: string; rawJdText?: string; raw_jd_text?: string };
      setJdRoleName(ej.role_name ?? "");
      setJdText(ej.rawJdText ?? ej.raw_jd_text ?? "");
      setJdAutoSaved(true);
      setJdHydrated(true);
    } else if (!dataLoading) {
      // data 加载完仍是 null → 标记 hydrated,允许用户开始填
      setJdHydrated(true);
    }
  }, [effectiveJd, jdHydrated, dataLoading]);

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
    const hasJdText = !!pending.jdText && pending.jdText.length > 50;
      // 从看岗位跳来 → 表单精确反映当前点的这个岗位:岗位名/JD 全文都权威覆盖,
      // 抓不到 JD 全文时只带岗位名(清掉残留 JD,避免"新岗位名 + 旧 JD"混搭)。
      if (pending.from_m6 && (hasJdText || pending.roleName)) {
        setJdText(hasJdText ? pending.jdText! : "");
        setJdRoleName(pending.roleName ?? "");
        // 不在此清除 —— 等 parseAndSaveJd 成功落库 JD_CONTEXT 后再清,
        // 否则解析失败/中途刷新会丢 JD(state 没了,localStorage 也清了)。
      }
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * 解析并保存 JD —— 抽成函数,供「下一步」点击时 await(关键:用户不用等边打字边解析,
   * 点下一步时统一解析)。也被 debounce 调用做 best-effort 预解析。
   * 返回 true = JD 已就绪(或本就没填 JD);false = 解析失败。幂等:已是最新解析则直接返回。
   */
  async function parseAndSaveJd(): Promise<boolean> {
    const role = jdRoleName.trim();
    const text = jdText.trim();
    if (!role && text.length < 30) return true; // 没填有效 JD,不阻塞
    if (!effectiveParsed) return true; // 简历还没解析好(下一步前简历必已就绪,理论不会到这)
    const ej = (effectiveJd ?? {}) as {
      role_name?: string;
      rawJdText?: string;
      raw_jd_text?: string;
      jd_keywords?: string[];
      must_have?: string[];
    };
    const sameRole = role === (ej.role_name ?? "");
    const sameText = text === (ej.rawJdText ?? ej.raw_jd_text ?? "");
    const hasStructuredJd =
      (Array.isArray(ej.jd_keywords) && ej.jd_keywords.length > 0) ||
      (Array.isArray(ej.must_have) && ej.must_have.length > 0);
    if (sameRole && sameText && hasStructuredJd) return true; // 已是最新解析
    setJdAutoSaved(false);
    setJdSavingError(null);
    try {
      const mode = text.length >= 30 ? "full" : "role";
      const body =
        mode === "full"
          ? { mode, jdText: text, parsedResume: effectiveParsed }
          : { mode, roleName: role, parsedResume: effectiveParsed };
      const res = await fetch("/api/m3/parse-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `JD 解析失败 (${res.status})`);
      }
      const parsed = (await res.json()) as Record<string, unknown>;
      await persistJd({
        ...parsed,
        role_name: role || (parsed.role_name as string | undefined),
        rawJdText: text || undefined,
        raw_jd_text: text || undefined,
        meta: {
          ...((parsed.meta as Record<string, unknown> | undefined) ?? {}),
          mode,
        },
      });
      setJdAutoSaved(true);
      // JD 已安全落库 JD_CONTEXT → 此时才清 m6 待消费 JD(避免落库前丢失)
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(STORAGE_KEYS.M6_PENDING_JD);
        } catch {
          /* ignore */
        }
      }
      return true;
    } catch (err) {
      setJdSavingError(err instanceof Error ? err.message : "JD 解析失败");
      return false;
    }
  }

  /** best-effort 预解析:边填边后台跑,点下一步时若已好就秒进(不再依赖它,只是加速) */
  useEffect(() => {
    if (!jdHydrated) return;
    if (!effectiveParsed) return;
    const role = jdRoleName.trim();
    const text = jdText.trim();
    if (!role && text.length < 30) return;
    const t = setTimeout(() => {
      void parseAndSaveJd();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdRoleName, jdText, jdHydrated, effectiveParsed]);

  // 「下一步/开始优化」:点击时统一解析 JD(await),解析完再进结果页
  const [proceeding, setProceeding] = useState(false);
  async function handleProceed() {
    if (proceeding) return;
    setProceeding(true);
    try {
      await parseAndSaveJd();
    } finally {
      setProceeding(false);
    }
    router.push(`/m3/result${convQs}`);
  }

  // 登录但没选 conv → 空状态
  const needPickConv = !userLoading && !!user && !hasConv;
  // 新建的会话本就是空的 → 直接出表单,不显示加载态(消除"新建后闪一下")
  const isNewConv = sp.get("new") === "1";
  const isLoadingAll = !isNewConv && (userLoading || (!isGuest && hasConv && dataLoading));

  // Step 4 enable 条件:有简历即可;八大规则默认全部执行
  const canSubmit = effectiveHasParsed;

  // 已分析会话直接落 /m3?c= 时跳结果页(罕见,会话项现在直指 /m3/result)。
  // 不再用 dataLoading 当条件 → 新建/普通打开不会先闪"正在打开"。
  const openingConv =
    !!user &&
    !!convId &&
    sp.get("setup") !== "1" &&
    !isNewConv &&
    data.analyzed &&
    !!data.parsed;
  if (openingConv) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg">
          <div className="h-20" />
          <div className="flex">
            <ConversationSwitcher module="m3" basePath="/m3" itemBasePath="/m3/result" defaultTitle="简历" />
            <div className="flex-1 min-w-0">
              <p className="text-center text-ink-muted py-24">正在打开…</p>
            </div>
          </div>
        </main>
      </>
    );
  }

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
          <ConversationSwitcher module="m3" basePath="/m3" itemBasePath="/m3/result" defaultTitle="简历" />

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
                {!needPickConv && (
                  <>
                    <h1 className="text-2xl md:text-3xl font-bold text-ink mb-1.5 leading-tight">
                      AI 简历优化
                    </h1>
                    <p className="text-ink-soft text-sm">
                      基于 ATS 与目标岗位进行关键词与结构优化
                    </p>
                  </>
                )}
              </div>
            </section>

            {/* 从其他模块回流:带着该模块用的简历 + 目标岗位 + 素材落地,确认后开始优化 */}
            {(sp.get("from") === "m4" || sp.get("from") === "debrief") &&
              !needPickConv && (
                <section className="border-b border-border bg-esther-blue/5">
                  <div className="max-w-[900px] mx-auto px-6 py-4">
                    <p className="text-sm text-ink leading-relaxed">
                      <span className="font-semibold text-esther-blue">
                        {sp.get("from") === "debrief"
                          ? "✓ 已从模拟面试带过来"
                          : "✓ 已从补项目带过来"}
                      </span>
                      {sp.get("from") === "debrief"
                        ? " 你这场面试用的简历 + 目标岗位,以及刚采纳的面试亮点都已带上。"
                        : " 你在补项目里用的简历 + 目标岗位,以及刚标记完成的那条补强素材都已带上。"}
                      {" 下面确认无误后点「开始优化」,AI 会把它揉进简历。"}
                    </p>
                  </div>
                </section>
              )}

            {/* 主内容 */}
            {needPickConv ? (
              <div className="max-w-[900px] mx-auto px-6 py-10 md:py-14">
                <section className="rounded-[28px] border border-black/8 bg-white/75 backdrop-blur-sm shadow-[0_16px_50px_rgba(32,36,66,0.06)] overflow-hidden">
                  <div className="px-6 py-7 md:px-8 md:py-8 border-b border-border/80 bg-gradient-to-r from-esther-blue/[0.06] via-white to-esther-yellow/[0.08]">
                    <h2 className="text-2xl md:text-[30px] font-bold text-ink leading-tight mb-2">
                      AI 简历优化
                    </h2>
                    <p className="text-sm md:text-[15px] leading-7 text-ink-soft max-w-2xl">
                      基于 ATS 与目标岗位进行关键词与结构优化
                    </p>
                  </div>

                  <div className="px-6 py-6 md:px-8 md:py-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => {
                          const btn = document.querySelector<HTMLButtonElement>(
                            "[data-m3-create-conversation]",
                          );
                          btn?.click();
                        }}
                        className="group text-left rounded-3xl border-2 border-esther-blue/20 bg-card px-5 py-5 hover:border-esther-blue hover:bg-esther-blue/[0.04] transition-all"
                      >
                        <p className="text-2xl mb-4">📎</p>
                        <p className="text-lg font-semibold text-ink mb-2">
                          我有简历,直接开始
                        </p>
                        <p className="text-sm text-ink-soft leading-6 mb-5">
                          新建一份简历会话,上传或粘贴现有内容,继续走 JD 对齐和 AI 优化。
                        </p>
                        <span className="inline-flex items-center text-sm font-medium text-esther-blue group-hover:translate-x-0.5 transition-transform">
                          新建简历会话 →
                        </span>
                      </button>

                      <Link
                        href="/m2"
                        className="group text-left rounded-3xl border-2 border-esther-yellow/45 bg-esther-yellow/[0.08] px-5 py-5 hover:border-esther-yellow hover:bg-esther-yellow/[0.14] transition-all relative"
                      >
                        <span className="absolute top-4 right-4 text-[10px] text-ink-muted font-display italic">
                          ⭐ 更适合没简历时
                        </span>
                        <p className="text-2xl mb-4">💬</p>
                        <p className="text-lg font-semibold text-ink mb-2">
                          我还没有简历,先去挖经历
                        </p>
                        <p className="text-sm text-ink-soft leading-6 mb-5">
                          跟 AI 聊你做过的事,把实习、项目、校园经历挖成可写进简历的素材。
                        </p>
                        <span className="inline-flex items-center text-sm font-medium text-ink group-hover:translate-x-0.5 transition-transform">
                          去经历挖掘 →
                        </span>
                      </Link>
                    </div>

                    <div className="mt-5 rounded-2xl border border-border bg-warm-bg/70 px-4 py-4">
                      <p className="text-sm font-medium text-ink mb-2">
                        左侧会话栏是做什么的?
                      </p>
                      <p className="text-sm text-ink-soft leading-6">
                        每份简历会单独保存,你可以为不同公司、不同岗位各开一份版本,互不覆盖。
                      </p>
                    </div>
                  </div>
                </section>
              </div>
            ) : !isNewConv && (isLoadingAll || !hydrated) ? (
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
                        <div>
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
                        <p className="mt-1 text-xs text-ink-muted">
                          当前会话:{user ? ` ${conversationTitle ?? "这份简历"}` : " 浏览器本地草稿"}
                          {" · "}
                          最近保存:{formatSavedAt(effectiveParsedSavedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {canRepasteCurrentResume && (
                          <button
                            type="button"
                            onClick={() => setShowPasteResume((v) => !v)}
                            className="text-xs text-ink-muted hover:text-esther-blue transition-colors"
                          >
                            重新粘贴 →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={parsingResume}
                          className="text-xs text-ink-muted hover:text-esther-blue transition-colors disabled:opacity-40"
                        >
                          {parsingResume ? "解析中…" : "换一份 →"}
                        </button>
                      </div>
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
                      <button
                        type="button"
                        onClick={() => setShowPasteResume((v) => !v)}
                        className="mt-2 text-[13px] text-esther-blue hover:underline"
                      >
                        {showPasteResume ? "收起粘贴框 ↑" : "也可以直接粘贴简历文字 →"}
                      </button>
                    </>
                  )}
                  {showPasteResume && (!effectiveHasParsed || canRepasteCurrentResume) && (
                    <div className="mt-3 rounded-xl border border-esther-blue/25 bg-card p-4">
                      <label className="block text-xs text-ink-soft mb-2">
                        粘贴简历全文 <span className="text-ink-muted">(姓名 / 教育 / 实习 / 项目 / 技能都可以直接贴进来)</span>
                      </label>
                      <textarea
                        value={pastedResumeText}
                        onChange={(e) => setPastedResumeText(e.target.value)}
                        rows={10}
                        placeholder="直接粘贴你的简历全文"
                        className="w-full px-3 py-3 rounded-xl border border-border bg-warm-bg/40 text-sm text-ink leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
                      />
                      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-xs text-ink-muted">
                          字数 {pastedResumeText.length} · 推荐至少 300 字,越完整解析越稳
                        </p>
                        <p className="text-xs text-ink-soft">
                          {pastedResumeText.trim().length < 50
                            ? "至少粘贴 50 字后会自动解析"
                            : parsingResume
                              ? "正在自动解析…"
                              : "停止输入后会自动解析"}
                        </p>
                      </div>
                    </div>
                  )}
                  {resumeErr && (
                    <p className="text-xs text-esther-red mt-2">⚠️ {resumeErr}</p>
                  )}
                </Step>

                {/* ============ Step 2 · 目标岗位(input + textarea 永远展开,自动保存) ============ */}
                <Step no="2" title="目标岗位 JD" hint="填岗位名 + 可选粘 JD 全文,自动保存 — AI 会按 JD 关键词做针对性优化">
                  <div className="rounded-xl border border-esther-blue/30 bg-card p-4 space-y-3">
                    {/* 岗位名称 */}
                    <div>
                      <label className="block text-xs text-ink-soft mb-1.5">
                        岗位名称 <span className="text-ink-muted">(必填一个 — 跟下方 JD 全文至少有一个)</span>
                      </label>
                      <input
                        type="text"
                        value={jdRoleName}
                        onChange={(e) => setJdRoleName(e.target.value)}
                        placeholder="例如:产品经理 / 前端开发 / 数据分析师 / 用户研究员"
                        maxLength={40}
                        className="w-full px-3 py-2 rounded-lg border border-border bg-warm-bg/40 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
                      />
                    </div>
                    {/* JD 全文 textarea */}
                    <div>
                      <label className="block text-xs text-ink-soft mb-1.5">
                        JD 全文 <span className="text-ink-muted">(可选,越完整 AI 越准 — 字数 {jdText.length})</span>
                      </label>
                      <textarea
                        value={jdText}
                        onChange={(e) => setJdText(e.target.value)}
                        rows={6}
                        placeholder="粘贴 JD 全文 — 岗位职责 / 任职要求 / 加分项,越完整越准"
                        className="w-full px-3 py-2 rounded-lg border border-border bg-warm-bg/40 text-sm text-ink leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
                      />
                      {jdText.length > 0 && jdText.length < 30 && (
                        <p className="text-xs text-ink-muted mt-1">还差一点 — JD 补到 ≥30 字会更准,或留空只靠岗位名也行</p>
                      )}
                    </div>
                    {/* 状态:不用等,点「开始优化」时会统一解析 */}
                    <p className="text-xs">
                      {(jdRoleName.trim() || jdText.trim().length >= 30)
                        ? jdAutoSaved
                          ? <span className="text-esther-blue">✓ 已解析</span>
                          : <span className="text-ink-soft">填好直接点「开始优化」即可,不用等</span>
                        : <span className="text-ink-muted">填岗位名或粘贴 JD 全文</span>}
                    </p>
                    {jdSavingError && (
                      <p className="text-xs text-esther-red">⚠️ {jdSavingError}</p>
                    )}
                  </div>
                </Step>

                {/* ============ Step 3 · 八大核心优化规则(默认全执行 + 4 差异化常驻) ============ */}
                <Step
                  no="3"
                  title="八大核心优化规则"
                  required
                  hint="每次简历优化都会默认遵守这 8 条规则"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {M3_OPTIMIZATION_GOALS.map((g) => {
                      const GoalIcon = M3_ICON_MAP[g.icon] ?? FileText;
                      return (
                        <div
                          key={g.key}
                          className="text-left rounded-xl border-2 border-esther-blue bg-esther-blue/[0.04] px-4 py-3"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-esther-blue/20 bg-esther-blue/10 text-esther-blue">
                              <GoalIcon className="h-4 w-4" strokeWidth={2} />
                            </span>
                            <span className="text-sm font-semibold text-ink leading-snug">
                              {g.title}
                            </span>
                          </div>
                          <p className="text-xs text-ink-soft">
                            {g.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 rounded-xl border border-esther-blue/20 bg-esther-blue/[0.03] p-4">
                    <p className="text-sm font-semibold text-ink mb-3">
                      我们还会多做这些
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-3">
                      {M3_DIFFERENTIATORS.map((d) => (
                        <div key={d.title} className="flex gap-2.5">
                          <span className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-esther-blue/15 bg-white text-esther-blue">
                            {(() => {
                              const DiffIcon = M3_ICON_MAP[d.icon] ?? FileText;
                              return <DiffIcon className="h-[18px] w-[18px]" strokeWidth={2} />;
                            })()}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-ink leading-snug">{d.title}</p>
                            <p className="text-xs text-ink-soft leading-relaxed mt-0.5">{d.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Step>

                {/* ============ Step 4 · 开始优化 ============ */}
                <div className="pt-2">
                  {canSubmit ? (
                    <button
                      type="button"
                      onClick={handleProceed}
                      disabled={proceeding}
                      className="w-full inline-flex items-center justify-center rounded-xl bg-esther-blue text-white px-6 py-3.5 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-70"
                    >
                      {proceeding
                        ? "正在解析 JD…"
                        : hasFinal
                          ? "看你的简历 + 下载 Word →"
                          : "开始优化 →"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="w-full inline-flex items-center justify-center rounded-xl bg-esther-blue/40 text-white px-6 py-3.5 text-base font-medium cursor-not-allowed"
                    >
                      {!effectiveHasParsed
                        ? "请先在 Step 1 选简历"
                        : "请先完善上面的必要信息"}
                    </button>
                  )}
                  {hasFinal && (
                    <p className="text-xs text-ink-muted mt-3 text-center">
                      已生成建议 · 点开看逐条采纳
                    </p>
                  )}
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
