"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useM3DBSync } from "@/lib/sync/useM3DBSync";

/**
 * 模块 3 / Phase 2 JD 匹配
 *
 * 用户 2026-06-02 拍板:JD 可选 3 选 1
 *   ① 完整 JD 文本(最准)
 *   ② 岗位名 + 公司(LLM 用知识推断,标 generic)
 *   ③ 快速模式:跳 JD → 直接 Phase 5 通用 polish
 *
 * 顶部固定"✓ 我从你简历读到 X"复核条(Phase 1.5 第 3 方案落地,选项 C)
 */

type Mode = "full" | "role" | "quick";
type ParseStatus = "idle" | "calling-llm" | "done" | "error";

type ParsedResume = {
  basic?: { name?: string | null; major?: string | null; year_level?: string | null };
  experience?: unknown[];
  projects?: unknown[];
  activities?: unknown[];
};

type JdContext = {
  jd_summary?: string;
  must_have?: string[];
  nice_to_have?: string[];
  jd_requirements_parsed?: { type: string; text: string }[];
  match_highlights?: { user_strength: string; jd_requirement: string; evidence: string }[];
  gaps?: { jd_requirement: string; why_gap: string; fixable: string }[];
  priority_score?: number;
  meta?: { mode: string; confidence: string };
  // M5 / M4 跨模块继承用：原始 JD 文本（full 模式下是用户粘贴的 JD，role 模式下是岗位名 fallback）
  raw_jd_text?: string;
  role_name?: string;
  company?: string;
  /**
   * placeholder 模式(plan offer-1-sparkling-hippo P1):
   * M6 用户从岗位卡跳过来但 job-detail 503 拿不到 JD 全文 → 仅有岗位摘要(标题/公司/薪资/城市)
   * suggest-edits 看到 placeholder_mode 时禁止 explicit claim_type;UI 提示"基于岗位摘要推断,置信度 medium"
   */
  placeholder_mode?: boolean;
};

export default function JdPage() {
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
      <JdContent />
    </Suspense>
  );
}

function JdContent() {
  const router = useRouter();
  const { isLoggedInWithConv, dbData, convQs, saveField } = useM3DBSync();

  const [localParsedResume] = useLocalState<ParsedResume | null>(
    STORAGE_KEYS.PARSED_RESUME,
    null,
  );
  const [, setLocalJdContext] = useLocalState<JdContext | null>(
    STORAGE_KEYS.JD_CONTEXT,
    null,
  );

  // 数据来源:登录优先 DB,游客 localStorage
  const parsedResume = isLoggedInWithConv
    ? (dbData?.parsed_resume_json as ParsedResume | null) ?? null
    : localParsedResume;

  async function setJdContext(jd: JdContext | null) {
    setLocalJdContext(jd);
    if (isLoggedInWithConv) await saveField("jd_context_json", jd);
  }

  const [mode, setMode] = useState<Mode>("full");
  const [jdText, setJdText] = useState("");
  const [roleName, setRoleName] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<ParseStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState<JdContext | null>(null);
  const [m6Source, setM6Source] = useState<{
    roleName: string;
    company: string;
    salary: string;
    city: string;
    sourceJobId: string;
  } | null>(null);

  // 从 M6 跳过来 → 读 m6_pending_jd 自动预填,消费后清除
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M6_PENDING_JD);
      if (!raw) return;
      const pending = JSON.parse(raw) as {
        jdText?: string;
        roleName?: string;
        company?: string;
        salary?: string;
        city?: string;
        sourceJobId?: string;
        from_m6?: boolean;
      };
      if (!pending.from_m6 || !pending.roleName) return;
      if (pending.jdText && pending.jdText.length > 50) {
        setMode("full");
        setJdText(pending.jdText);
      } else {
        setMode("role");
        setRoleName(pending.roleName);
        setCompany(pending.company ?? "");
      }
      setM6Source({
        roleName: pending.roleName,
        company: pending.company ?? "",
        salary: pending.salary ?? "",
        city: pending.city ?? "",
        sourceJobId: pending.sourceJobId ?? "",
      });
      window.localStorage.removeItem(STORAGE_KEYS.M6_PENDING_JD);
    } catch {
      /* ignore */
    }
  }, []);

  // 没解析过简历 → 回 upload
  useEffect(() => {
    // useLocalState hydrates async; give it a tick
    const t = setTimeout(() => {
      if (!parsedResume) {
        // 不强跳,显示提示让用户决定
      }
    }, 100);
    return () => clearTimeout(t);
  }, [parsedResume]);

  async function handleSubmit() {
    setErrorMsg("");

    // 快速模式直接走
    if (mode === "quick") {
      setStatus("calling-llm");
      try {
        const res = await fetch("/api/m3/parse-jd", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "quick" }),
        });
        await res.json();
        setJdContext(null); // 快速模式 = null
        setStatus("done");
        setResult(null);
        setTimeout(() => router.push(`/m3/result${convQs}`), 800);
      } catch (err) {
        const message = err instanceof Error ? err.message : "失败";
        setErrorMsg(message);
        setStatus("error");
      }
      return;
    }

    if (!parsedResume) {
      setErrorMsg("没读到你的简历,请先回 Phase 1 上传 →");
      setStatus("error");
      return;
    }

    if (mode === "full" && !jdText.trim()) {
      setErrorMsg("请粘贴 JD 文本");
      setStatus("error");
      return;
    }
    if (mode === "role" && !roleName.trim()) {
      setErrorMsg("请输入岗位名");
      setStatus("error");
      return;
    }

    setStatus("calling-llm");
    try {
      const body =
        mode === "full"
          ? { mode, jdText: jdText.trim(), parsedResume }
          : { mode, roleName: roleName.trim(), company: company.trim() || undefined, parsedResume };

      const res = await fetch("/api/m3/parse-jd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as JdContext;
      // 写入 raw 字段供 M5 / M4 继承上下文用
      const rawForInherit =
        mode === "full"
          ? jdText.trim()
          : `【${roleName.trim()}】@ ${company.trim() || "(公司)"}\n\n（M3 走快速模式，未提供完整 JD 文本，下游模块按岗位名推断）`;
      // placeholder_mode:M6 跳过来但无 JD 全文(role 模式 + from M6)→ 标记 placeholder,后续 suggest-edits 限制置信度
      const isPlaceholderMode = mode === "role" && m6Source !== null;
      const enriched: JdContext = {
        ...parsed,
        raw_jd_text: rawForInherit,
        role_name: mode === "role" ? roleName.trim() : parsed.role_name,
        company: mode === "role" ? company.trim() || undefined : parsed.company,
        placeholder_mode: isPlaceholderMode,
      };
      setJdContext(enriched);
      setResult(enriched);
      setStatus("done");
      setTimeout(() => {
        document.getElementById("result-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "失败";
      setErrorMsg(message);
      setStatus("error");
    }
  }

  function handleNextPhase() {
    if (mode === "quick") {
      router.push(`/m3/result${convQs}`);
    } else {
      router.push(`/m3/excavate${convQs}`);
    }
  }

  const busy = status === "calling-llm";

  // 简历读到内容(Phase 1.5 顶部复核条 — 选项 C 落地)
  const resumeSummary = parsedResume
    ? `${parsedResume.basic?.name ?? "(没姓名)"} · ${parsedResume.basic?.major ?? "(没专业)"} · ${parsedResume.experience?.length ?? 0} 段实习 · ${parsedResume.projects?.length ?? 0} 个项目`
    : null;

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg">
        <div className="h-20" />

        {/* Phase 1.5 顶部复核条(简历不对就回去改) */}
        {resumeSummary && (
          <section className="bg-esther-blue/8 border-b border-esther-blue/20">
            <div className="max-w-[1100px] mx-auto px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs">
              <p className="text-ink-soft">
                <span className="inline-flex items-center gap-1 text-esther-blue font-medium">
                  ✓ 我从你简历读到:
                </span>
                <span className="ml-2">{resumeSummary}</span>
              </p>
              <Link
                href="/m3/upload"
                className="text-ink-muted hover:text-esther-red transition-colors"
              >
                不对?回去重粘 →
              </Link>
            </div>
          </section>
        )}

        {!parsedResume && (
          <section className="bg-esther-yellow/20 border-b border-esther-yellow">
            <div className="max-w-[1100px] mx-auto px-6 py-3 text-sm text-ink">
              ⚠️ 还没读到你的简历 ·{" "}
              <Link
                href="/m3/upload"
                className="text-esther-blue font-medium hover:underline"
              >
                请先上传 →
              </Link>
            </div>
          </section>
        )}

        {/* M6 跳转预填提示 */}
        {m6Source && (
          <section className="bg-esther-blue/8 border-b border-esther-blue/30">
            <div className="max-w-[1100px] mx-auto px-6 py-2.5 text-xs flex items-center justify-between gap-3 flex-wrap">
              <p className="text-ink">
                <span className="inline-flex items-center gap-1 text-esther-blue font-medium">
                  📍 来自岗位发现:
                </span>
                <span className="ml-2 font-medium">{m6Source.roleName}</span>
                <span className="ml-1 text-ink-soft">@ {m6Source.company}</span>
                {m6Source.salary && (
                  <span className="ml-1 text-esther-red">· {m6Source.salary}</span>
                )}
                {m6Source.city && <span className="ml-1 text-ink-soft">· {m6Source.city}</span>}
                <span className="ml-2 text-ink-muted">— 已为你预填,点继续直接做匹配</span>
              </p>
              <Link href="/m6/discover" className="text-ink-muted hover:text-esther-blue transition-colors">
                换一个岗位 →
              </Link>
            </div>
          </section>
        )}

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1100px] mx-auto px-6 py-8">
            <Link
              href="/m3/upload"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回 Phase 1
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              Phase 2 / 5 · 岗位匹配
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              你的目标岗位是?
            </h1>
            <p className="text-ink-soft text-sm">
              JD 越具体,Phase 5 的改动建议越针对性
            </p>
          </div>
        </section>

        <div className="max-w-[1100px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* 左:模式选 + 输入区 */}
          <div className="space-y-6">
            {/* 3 模式卡 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {[
                {
                  k: "full" as Mode,
                  title: "① 完整 JD",
                  tag: "最准",
                  desc: "粘贴 JD 全文,LLM 高保真拆解",
                },
                {
                  k: "role" as Mode,
                  title: "② 岗位名 + 公司",
                  tag: "LLM 推断",
                  desc: "只知道岗位名,LLM 用行业知识推",
                },
                {
                  k: "quick" as Mode,
                  title: "③ 快速模式",
                  tag: "跳过 JD",
                  desc: "不针对 JD,直接通用 polish",
                },
              ].map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setMode(opt.k)}
                  disabled={busy}
                  className={`text-left p-4 rounded-2xl border-2 transition-all ${
                    mode === opt.k
                      ? "border-esther-blue bg-esther-blue/8 shadow-sm"
                      : "border-border bg-card hover:border-esther-blue/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <p
                      className={`text-sm font-semibold ${
                        mode === opt.k ? "text-esther-blue" : "text-ink"
                      }`}
                    >
                      {opt.title}
                    </p>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        mode === opt.k
                          ? "bg-esther-yellow text-ink"
                          : "bg-warm-bg-deep text-ink-muted"
                      }`}
                    >
                      {opt.tag}
                    </span>
                  </div>
                  <p className="text-xs text-ink-soft leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* 模式 1: 完整 JD */}
            {mode === "full" && (
              <Card className="p-5 border-2 border-border">
                <p className="font-display italic text-xs text-esther-blue mb-3">
                  Paste full JD
                </p>
                <textarea
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  rows={12}
                  placeholder="粘贴 JD 全文 — 公司名、岗位职责、任职要求都贴上,LLM 会做拆解。公司名只在输入层 OK,我输出的 jd_summary 会自动脱敏。"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y font-mono"
                  disabled={busy}
                />
                <p className="text-xs text-ink-muted mt-2">字数:{jdText.length}</p>
              </Card>
            )}

            {/* 模式 2: 岗位名 + 公司 */}
            {mode === "role" && (
              <Card className="p-5 border-2 border-border space-y-4">
                <div>
                  <p className="font-display italic text-xs text-esther-blue mb-2">
                    Role name
                  </p>
                  <input
                    value={roleName}
                    onChange={(e) => setRoleName(e.target.value)}
                    placeholder="eg AI 产品经理实习生 / 算法工程师 / 数据分析师"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue"
                    disabled={busy}
                  />
                </div>
                <div>
                  <p className="font-display italic text-xs text-esther-blue mb-2">
                    Company (optional)
                  </p>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="eg 字节跳动 / 腾讯(可空,LLM 会用行业通用知识)"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue"
                    disabled={busy}
                  />
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">
                  💡 LLM 会标注「通用版,不如具体 JD 准」,可信度 = medium
                </p>
              </Card>
            )}

            {/* 模式 3: 快速模式 */}
            {mode === "quick" && (
              <Card className="p-5 border-2 border-esther-yellow/40 bg-esther-yellow/10">
                <p className="font-display italic text-xs text-esther-blue mb-2">
                  Quick mode
                </p>
                <h3 className="text-base font-semibold text-ink mb-3">
                  ⚡ 跳过 JD,直接做通用优化
                </h3>
                <p className="text-sm text-ink-soft leading-relaxed mb-3">
                  Phase 5 只做 3 件事:
                </p>
                <ul className="text-sm text-ink-soft space-y-1.5 ml-4 mb-3">
                  <li>· 把「负责 X / 协助 Y / 参与 Z」改成 STAR 成就型</li>
                  <li>· 在 bullets 里找量化机会(用户没数字的不编)</li>
                  <li>· ATS 自检(章节标题标准化)</li>
                </ul>
                <p className="text-xs text-ink-muted">
                  ❌ 不做的:JD 关键词 tailoring · 隐藏经验挖掘(Phase 3 跳过)· 跨专业翻译
                </p>
              </Card>
            )}

            {/* 错误 */}
            {errorMsg && status === "error" && (
              <Card className="p-4 border-2 border-esther-red/30 bg-esther-red/5">
                <p className="text-sm text-esther-red">⚠️ {errorMsg}</p>
              </Card>
            )}

            {/* 提交 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-ink-muted">
                {status === "calling-llm" &&
                  (mode === "quick" ? "⚡ 跳过中..." : "🤖 AI 拆解 JD(~5-10 秒)...")}
                {status === "done" &&
                  (mode === "quick"
                    ? "✅ 跳过 JD,即将进 Phase 5..."
                    : "✅ 拆解完成,看下面 ↓")}
              </p>
              <button
                onClick={handleSubmit}
                disabled={busy || (mode === "full" && !jdText.trim()) || (mode === "role" && !roleName.trim())}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy
                  ? "处理中..."
                  : mode === "quick"
                  ? "确认跳过 → Phase 5"
                  : "拆解 JD →"}
              </button>
            </div>

            {/* 结果展示(仅 mode != quick) */}
            {result && (
              <Card
                id="result-card"
                className="p-6 border-2 border-esther-blue bg-esther-blue/5"
              >
                <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                  <div>
                    <p className="font-display italic text-xs text-esther-blue mb-1">
                      JD parsed
                    </p>
                    <h3 className="text-base font-semibold text-ink">📋 拆解结果</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${
                        result.meta?.confidence === "high"
                          ? "bg-esther-blue text-white"
                          : "bg-esther-yellow text-ink"
                      }`}
                    >
                      confidence: {result.meta?.confidence}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-card border border-border text-xs text-ink font-medium">
                      💯 priority: <strong className="text-esther-blue">{result.priority_score}/5</strong>
                    </span>
                  </div>
                </div>

                {/* jd_summary */}
                <div className="bg-warm-bg-deep/30 rounded-lg p-3 border border-border mb-4">
                  <p className="text-[10px] text-ink-muted font-display italic mb-1">
                    JD summary(已脱敏)
                  </p>
                  <p className="text-sm text-ink leading-relaxed">
                    {result.jd_summary}
                  </p>
                </div>

                {/* Anti-fabrication 文案 — PM 06 §3.4 #5 */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card mb-4">
                  <span className="text-base">🛡️</span>
                  <p className="text-[11px] text-ink-soft leading-snug">
                    <span className="text-ink font-medium">Offer 捕手</span>
                    只会重组和追问你提供过的信息,不会替你发明经历。下面的 match / gap 都来自 LLM 对 JD + 你简历的对比。
                  </p>
                </div>

                {/* must_have chips */}
                {result.must_have && result.must_have.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-ink-soft mb-2 font-medium">
                      🎯 硬性要求 ({result.must_have.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {result.must_have.map((m, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-1 rounded bg-esther-blue/15 text-esther-blue text-[11px]"
                        >
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* match_highlights */}
                {result.match_highlights && result.match_highlights.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-ink-soft mb-2 font-medium">
                      ✨ 你的命中亮点 ({result.match_highlights.length})
                    </p>
                    <ul className="space-y-2">
                      {result.match_highlights.slice(0, 5).map((h, i) => (
                        <li
                          key={i}
                          className="text-xs text-ink-soft leading-relaxed bg-card border-l-4 border-esther-blue p-2.5 rounded"
                        >
                          <span className="font-medium text-ink">{h.user_strength}</span>
                          <span className="text-ink-muted"> → 命中 </span>
                          <span className="font-medium text-esther-blue">{h.jd_requirement}</span>
                          {h.evidence && (
                            <p className="text-ink-muted mt-1">💬 {h.evidence}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* gaps */}
                {result.gaps && result.gaps.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs text-ink-soft mb-2 font-medium">
                      ⚠️ 缺的能力 ({result.gaps.length})
                    </p>
                    <ul className="space-y-2">
                      {result.gaps.map((g, i) => (
                        <li
                          key={i}
                          className="text-xs text-ink-soft leading-relaxed bg-card border-l-4 border-esther-red p-2.5 rounded"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="flex-1">
                              <span className="font-medium text-ink">{g.jd_requirement}</span>
                              {g.why_gap && (
                                <span className="text-ink-muted"> — {g.why_gap}</span>
                              )}
                            </p>
                            <span
                              className={`flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                g.fixable === "易补<2周"
                                  ? "bg-esther-blue/20 text-esther-blue"
                                  : g.fixable === "中等1-2月"
                                  ? "bg-esther-yellow text-ink"
                                  : "bg-esther-red/20 text-esther-red"
                              }`}
                            >
                              {g.fixable}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 下一步 */}
                <div className="flex items-center justify-end pt-3 border-t border-border">
                  <button
                    onClick={handleNextPhase}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
                  >
                    下一步:Phase 3 隐藏经验挖掘 →
                  </button>
                </div>
              </Card>
            )}
          </div>

          {/* 右:Phase 进度 + Tips */}
          <aside className="space-y-5">
            <Card className="p-5 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Process
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">5 个 Phase 进度</h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-esther-yellow text-ink">
                    ✓
                  </span>
                  <div>
                    <p className="font-medium text-ink">简历解析</p>
                    <p className="text-xs text-ink-soft mt-0.5">已完成</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-esther-blue text-white animate-pulse">
                    2
                  </span>
                  <div>
                    <p className="font-medium text-esther-blue">岗位匹配</p>
                    <p className="text-xs text-ink-soft mt-0.5">你在这里</p>
                  </div>
                </li>
                {[
                  ["3", "隐藏经验挖掘", mode === "quick" ? "⚡ 快速模式跳过" : "选择题挖你没写的素材"],
                  ["4", "学习计划", "按时间预算给突击建议"],
                  ["5", "整理简历", "逐条确认改动 → Word 输出"],
                ].map(([no, title, desc]) => (
                  <li key={no} className="flex items-start gap-3">
                    <span
                      className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        mode === "quick" && no === "3"
                          ? "bg-warm-bg-deep text-ink-muted/40 border border-border line-through"
                          : "bg-warm-bg-deep text-ink-muted border border-border"
                      }`}
                    >
                      {no}
                    </span>
                    <div>
                      <p
                        className={`font-medium ${
                          mode === "quick" && no === "3"
                            ? "text-ink-muted/50 line-through"
                            : "text-ink-muted"
                        }`}
                      >
                        {title}
                      </p>
                      <p className="text-xs text-ink-soft mt-0.5">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5 border-2 border-esther-yellow/40 bg-esther-yellow/10">
              <p className="font-display italic text-xs text-esther-blue mb-2">Tips</p>
              <ul className="text-xs text-ink-soft space-y-1.5 leading-relaxed">
                <li>· 完整 JD 最准,但全文太长可只贴「任职要求」段</li>
                <li>· 公司名我会在输出脱敏到「某互联网大厂」</li>
                <li>· 快速模式适合「我只想 polish 不投特定岗」</li>
                <li>· gaps 标「难补 ≥3 月」的 → 模块 4 项目设计能补</li>
              </ul>
            </Card>
          </aside>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
