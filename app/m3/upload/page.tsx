"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { extractTextFromPdf } from "@/lib/pdf-extract";
import { extractTextFromDocx } from "@/lib/docx-extract";

/**
 * 模块 3 / Phase 1 简历上传 + 解析
 *
 * 用户选其一:
 *   A. 粘贴简历文本(主路径,最稳)
 *   B. 上传 PDF / Word(client-side 提取 text)
 *   失败 → 引导上传截图(v2 多模态)或回退 A
 *
 * 提交 → POST /api/m3/parse-resume → 落 localStorage.PARSED_RESUME → 显示解析复核卡(Phase 1.5)→ 用户点"下一步"才跳 /m3/jd
 */

type ParseStatus = "idle" | "extracting" | "calling-llm" | "done" | "error";

type TagDist = {
  total: number;
  responsibility_driven: number;
  lacks_metric: number;
  vague_action: number;
  strong: number;
};

type ParsedSummary = {
  basic?: { name?: string | null; major?: string | null; year_level?: string | null; school?: string | null };
  experience?: unknown[];
  projects?: unknown[];
  activities?: unknown[];
  meta?: { parse_quality?: string; narrative_tag_distribution?: TagDist; missing_critical?: string[] };
};

export default function UploadPage() {
  const router = useRouter();
  const [, setParsedResume] = useLocalState(STORAGE_KEYS.PARSED_RESUME, null);

  const [pastedText, setPastedText] = useState("");
  const [extractedText, setExtractedText] = useState("");
  const [activeSource, setActiveSource] = useState<"paste" | "file">("paste");
  const [filename, setFilename] = useState("");
  const [status, setStatus] = useState<ParseStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [parsedSummary, setParsedSummary] = useState<ParsedSummary | null>(null);

  const resumeText = activeSource === "paste" ? pastedText : extractedText;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveSource("file");
    setFilename(file.name);
    setStatus("extracting");
    setErrorMsg("");

    try {
      const lower = file.name.toLowerCase();
      let text = "";
      if (lower.endsWith(".pdf")) {
        const { text: t } = await extractTextFromPdf(file);
        text = t;
      } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
        const { text: t } = await extractTextFromDocx(file);
        text = t;
      } else if (lower.endsWith(".md") || lower.endsWith(".txt")) {
        text = await file.text();
      } else {
        throw new Error("仅支持 PDF / DOCX / MD / TXT,其他格式请粘贴文字");
      }
      setExtractedText(text);
      setStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "提取失败";
      setErrorMsg(message + " — 可以试试直接粘贴文字");
      setStatus("error");
      setActiveSource("paste");
    }
  }

  async function handleParse() {
    if (!resumeText.trim()) {
      setErrorMsg("请粘贴简历文本或上传文件");
      setStatus("error");
      return;
    }
    setStatus("calling-llm");
    setErrorMsg("");
    try {
      const res = await fetch("/api/m3/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resumeText.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = await res.json();
      setParsedResume(parsed);
      setParsedSummary(parsed as ParsedSummary);
      setStatus("done");
      // 滚到复核卡(下方)— Phase 1.5 用户拍板:不自动跳,展示解析结果让用户确认
      setTimeout(() => {
        document.getElementById("confirm-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "解析失败";
      setErrorMsg(message);
      setStatus("error");
    }
  }

  function handleRetry() {
    setStatus("idle");
    setParsedSummary(null);
    setParsedResume(null);
    setErrorMsg("");
  }

  function handleNextPhase() {
    router.push("/m3/jd");
  }

  // 算 tag 分布的可读 count(从 ratio × total)
  function tagCount(ratio: number | undefined, total: number | undefined): number {
    if (!ratio || !total) return 0;
    return Math.round(ratio * total);
  }

  const busy = status === "extracting" || status === "calling-llm";

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg">
        <div className="h-20" />

        {/* 顶部 */}
        <section className="border-b border-border">
          <div className="max-w-[1000px] mx-auto px-6 py-8">
            <Link
              href="/m3"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回模块入口
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              Phase 1 / 5 · 简历解析
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              先把你的简历给我看看
            </h1>
            <p className="text-ink-soft text-sm">
              粘贴文字最稳;PDF / Word 也行,我在浏览器本地提取(不上传服务器)
            </p>
          </div>
        </section>

        <div className="max-w-[1000px] mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
          {/* 左:输入区 */}
          <div className="space-y-6">
            {/* Tab 切换 */}
            <div className="inline-flex p-1 rounded-full bg-warm-bg-deep border border-border">
              <button
                onClick={() => setActiveSource("paste")}
                className={`px-5 py-2 text-sm rounded-full transition-colors ${
                  activeSource === "paste"
                    ? "bg-esther-blue text-white shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                ✍️ 粘贴文字
              </button>
              <button
                onClick={() => setActiveSource("file")}
                className={`px-5 py-2 text-sm rounded-full transition-colors ${
                  activeSource === "file"
                    ? "bg-esther-blue text-white shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                📎 上传 PDF / Word
              </button>
            </div>

            {/* 粘贴 textarea */}
            {activeSource === "paste" && (
              <Card className="p-5 border-2 border-border">
                <p className="font-display italic text-xs text-esther-blue mb-3">
                  Paste your resume
                </p>
                <textarea
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  rows={18}
                  placeholder="粘贴你的简历全文 — 任何格式都行(姓名 / 教育 / 实习 / 项目 / 技能 ...)"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y font-mono"
                  disabled={busy}
                />
                <p className="text-xs text-ink-muted mt-2">
                  字数:{pastedText.length} · 推荐 800-3000 字
                </p>
              </Card>
            )}

            {/* 文件上传 */}
            {activeSource === "file" && (
              <Card className="p-5 border-2 border-border">
                <p className="font-display italic text-xs text-esther-blue mb-3">
                  Upload file
                </p>
                <label className="block">
                  <div className="border-2 border-dashed border-border rounded-xl p-10 text-center hover:border-esther-blue transition-colors cursor-pointer bg-warm-bg-deep/30">
                    {filename ? (
                      <>
                        <p className="text-sm font-medium text-ink mb-1">
                          📎 {filename}
                        </p>
                        <p className="text-xs text-ink-soft">
                          已提取 {extractedText.length} 字 · 点击重新选择
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-ink mb-1">
                          点击选择文件
                        </p>
                        <p className="text-xs text-ink-soft">
                          PDF / DOCX / MD / TXT · 浏览器本地解析,不上传服务器
                        </p>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.md,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                      disabled={busy}
                    />
                  </div>
                </label>

                {extractedText && (
                  <div className="mt-4 p-3 rounded-lg bg-warm-bg-deep border border-border max-h-48 overflow-y-auto">
                    <p className="text-[11px] text-ink-muted mb-1.5 font-display italic">
                      已提取(前 800 字预览):
                    </p>
                    <pre className="text-xs text-ink-soft whitespace-pre-wrap font-mono leading-relaxed">
                      {extractedText.slice(0, 800)}
                      {extractedText.length > 800 ? "..." : ""}
                    </pre>
                  </div>
                )}
              </Card>
            )}

            {/* 错误提示 */}
            {errorMsg && status === "error" && (
              <Card className="p-4 border-2 border-esther-red/30 bg-esther-red/5">
                <p className="text-sm text-esther-red">⚠️ {errorMsg}</p>
              </Card>
            )}

            {/* Phase 1.5 解析复核卡(2026-06-02 用户拍板) — 解析完成后展示,用户确认正确再下一步 */}
            {status === "done" && parsedSummary && (
              <Card
                id="confirm-card"
                className="p-6 border-2 border-esther-blue bg-esther-blue/5"
              >
                <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                  <div>
                    <p className="font-display italic text-xs text-esther-blue mb-1">
                      Parsed · 解析复核
                    </p>
                    <h3 className="text-base font-semibold text-ink">
                      ✓ 我读到的:
                    </h3>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded text-[10px] font-bold ${
                      parsedSummary.meta?.parse_quality === "good"
                        ? "bg-esther-blue text-white"
                        : parsedSummary.meta?.parse_quality === "partial"
                        ? "bg-esther-yellow text-ink"
                        : "bg-esther-red/20 text-esther-red"
                    }`}
                  >
                    parse_quality: {parsedSummary.meta?.parse_quality ?? "—"}
                  </span>
                </div>

                {/* 基础识别 */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-[10px] text-ink-muted font-display italic mb-0.5">
                      姓名 / 专业
                    </p>
                    <p className="text-sm font-medium text-ink leading-snug">
                      {parsedSummary.basic?.name ?? "(没读到)"}
                      <br />
                      <span className="text-xs text-ink-soft">
                        {parsedSummary.basic?.major ?? "—"}
                        {parsedSummary.basic?.year_level
                          ? ` · ${parsedSummary.basic.year_level}`
                          : ""}
                      </span>
                    </p>
                  </div>
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-[10px] text-ink-muted font-display italic mb-0.5">
                      实习/工作
                    </p>
                    <p className="text-2xl font-bold text-esther-blue leading-tight">
                      {parsedSummary.experience?.length ?? 0}
                      <span className="text-xs text-ink-soft ml-1">段</span>
                    </p>
                  </div>
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-[10px] text-ink-muted font-display italic mb-0.5">
                      项目
                    </p>
                    <p className="text-2xl font-bold text-esther-blue leading-tight">
                      {parsedSummary.projects?.length ?? 0}
                      <span className="text-xs text-ink-soft ml-1">个</span>
                    </p>
                  </div>
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-[10px] text-ink-muted font-display italic mb-0.5">
                      社团/活动
                    </p>
                    <p className="text-2xl font-bold text-esther-blue leading-tight">
                      {parsedSummary.activities?.length ?? 0}
                      <span className="text-xs text-ink-soft ml-1">个</span>
                    </p>
                  </div>
                </div>

                {/* tag 分布 */}
                {parsedSummary.meta?.narrative_tag_distribution && (
                  <div className="bg-warm-bg-deep/40 rounded-lg p-3 border border-border mb-4">
                    <p className="text-xs text-ink-soft mb-2">
                      <span className="font-medium text-ink">
                        📊 简历 bullet 分析
                      </span>
                      {" — 共 "}
                      <span className="font-medium">
                        {parsedSummary.meta.narrative_tag_distribution.total}
                      </span>
                      {" 条"}
                    </p>
                    <div className="flex flex-wrap gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-esther-red/15 text-esther-red">
                        职责陈述句{" "}
                        <strong>
                          {tagCount(
                            parsedSummary.meta.narrative_tag_distribution
                              .responsibility_driven,
                            parsedSummary.meta.narrative_tag_distribution.total
                          )}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-esther-yellow/40 text-ink">
                        缺数字{" "}
                        <strong>
                          {tagCount(
                            parsedSummary.meta.narrative_tag_distribution
                              .lacks_metric,
                            parsedSummary.meta.narrative_tag_distribution.total
                          )}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-warm-bg-deep text-ink-soft border border-border">
                        弱动词{" "}
                        <strong>
                          {tagCount(
                            parsedSummary.meta.narrative_tag_distribution
                              .vague_action,
                            parsedSummary.meta.narrative_tag_distribution.total
                          )}
                        </strong>
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-esther-blue/15 text-esther-blue">
                        已是强 bullet{" "}
                        <strong>
                          {tagCount(
                            parsedSummary.meta.narrative_tag_distribution
                              .strong,
                            parsedSummary.meta.narrative_tag_distribution.total
                          )}
                        </strong>
                      </span>
                    </div>
                    <p className="text-[10px] text-ink-muted mt-2 leading-relaxed">
                      💡 红 + 黄的会在 Phase 5 被 AI 重点重写;蓝色的保留
                    </p>
                  </div>
                )}

                {/* missing critical */}
                {parsedSummary.meta?.missing_critical &&
                  parsedSummary.meta.missing_critical.length > 0 && (
                    <div className="bg-esther-yellow/15 rounded-lg p-3 border border-esther-yellow/40 mb-4">
                      <p className="text-xs text-ink leading-relaxed">
                        ⚠️ 我没读到这些(可能简历里就没写):
                        <span className="font-medium ml-1">
                          {parsedSummary.meta.missing_critical.join(" / ")}
                        </span>
                      </p>
                    </div>
                  )}

                {/* 按钮:重新粘贴 / 下一步 */}
                <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
                  <button
                    onClick={handleRetry}
                    className="inline-flex items-center justify-center rounded-full border-2 border-border bg-card text-ink-soft px-5 py-2 text-sm hover:border-esther-red hover:text-esther-red transition-colors"
                  >
                    ✗ 不对,我重新粘贴
                  </button>
                  <button
                    onClick={handleNextPhase}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm"
                  >
                    ✓ 对,下一步:JD 匹配 →
                  </button>
                </div>
              </Card>
            )}

            {/* 状态 + 提交 — 解析完成后隐藏(让位给复核卡) */}
            {status !== "done" && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-xs text-ink-muted">
                {status === "extracting" && "📖 浏览器本地提取中..."}
                {status === "calling-llm" && "🤖 AI 解析中(~5-10 秒)..."}
                {status === "idle" &&
                  `字数:${resumeText.length} ${
                    resumeText.length > 300 ? "· 看起来够了" : "· 再多点更好"
                  }`}
              </p>
              <button
                onClick={handleParse}
                disabled={busy || !resumeText.trim()}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy ? "处理中..." : "解析并继续 →"}
              </button>
            </div>
            )}
          </div>

          {/* 右:Phase 进度 + 提示 */}
          <aside className="space-y-5">
            <Card className="p-5 border-2 border-border">
              <p className="font-display italic text-xs text-esther-blue mb-3">
                Process
              </p>
              <h3 className="text-base font-semibold text-ink mb-4">
                5 个 Phase 进度
              </h3>
              <ul className="space-y-3 text-sm">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-esther-blue text-white animate-pulse">
                    1
                  </span>
                  <div>
                    <p className="font-medium text-esther-blue">简历解析</p>
                    <p className="text-xs text-ink-soft mt-0.5">你在这里</p>
                  </div>
                </li>
                {[
                  ["2", "岗位匹配", "拆 JD + 找命中亮点"],
                  ["3", "隐藏经验挖掘", "选择题挖你没写的素材"],
                  ["4", "学习计划", "按时间预算给突击建议"],
                  ["5", "整理简历", "整合所有 → Word 输出"],
                ].map(([no, title, desc]) => (
                  <li key={no} className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold bg-warm-bg-deep text-ink-muted border border-border">
                      {no}
                    </span>
                    <div>
                      <p className="font-medium text-ink-muted">{title}</p>
                      <p className="text-xs text-ink-soft mt-0.5">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="p-5 border-2 border-esther-yellow/40 bg-esther-yellow/10">
              <p className="font-display italic text-xs text-esther-blue mb-2">
                Tips
              </p>
              <ul className="text-xs text-ink-soft space-y-1.5 leading-relaxed">
                <li>· 粘贴文字最稳,PDF 复杂版式可能丢格式</li>
                <li>· 内容缺失我不会编(eg GPA 没写 = null)</li>
                <li>· 文件在浏览器本地解析,不上传服务器</li>
                <li>· PDF 是扫描版 → 建议截图或粘贴文字</li>
              </ul>
            </Card>
          </aside>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
