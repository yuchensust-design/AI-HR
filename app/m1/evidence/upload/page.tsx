"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import {
  parseResumeFile,
  ResumeParseError,
  type ParseResult,
} from "@/lib/parse-resume-file";
import {
  submitM1Recommendation,
  type M1Evidence,
} from "@/lib/m1-recommend-submit";

/**
 * 模块 1 - 补充信息 Path A:上传简历
 *
 * 流程:
 *   1. 客户端拖拽/选文件 → lib/parse-resume-file.ts 解析(PDF/Word/MD/TXT,本地)
 *      或粘贴文本 fallback
 *   2. 显示 NN 字 + 前 500 字预览,让用户校对
 *   3. 用户确认 → POST /api/m1/evidence-parse 拿 summary + tags + rawSnippet
 *   4. 组装 M1Evidence 写 localStorage,调 /api/m1/recommend → /m1/result
 */

const PREVIEW_CHARS = 500;

type Step = "input" | "preview" | "submitting";

type EvidenceParseResponse = {
  summary: string;
  tags: string[];
  rawSnippet: string;
  quality: "high" | "mid" | "low";
};

export default function M1EvidenceUploadPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("input");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [parseErr, setParseErr] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  const [hasAnswers, setHasAnswers] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      setHasAnswers(Boolean(window.localStorage.getItem("m1_quiz_answers")));
    } catch {
      setHasAnswers(false);
    }
  }, []);

  const handleFile = async (file: File) => {
    setParseErr(null);
    try {
      const result = await parseResumeFile(file);
      setParsed(result);
      setStep("preview");
    } catch (e) {
      const msg =
        e instanceof ResumeParseError
          ? e.message
          : e instanceof Error
          ? e.message
          : String(e);
      setParseErr(msg);
    }
  };

  const handlePasteSubmit = () => {
    setParseErr(null);
    const t = pasteText.trim();
    if (t.length < 20) {
      setParseErr("贴的内容只有不到 20 字 — 至少贴下学校 / 专业 / 一段经历");
      return;
    }
    setParsed({
      text: t.length > 10_000 ? t.slice(0, 10_000) : t,
      fileName: "粘贴文本.txt",
      warnings: [],
    });
    setStep("preview");
  };

  const handleConfirm = async () => {
    if (!parsed) return;
    setStep("submitting");
    setSubmitErr(null);
    try {
      // 1. 调 evidence-parse 拿 summary + tags
      const resParse = await fetch("/api/m1/evidence-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: parsed.text }),
      });
      if (!resParse.ok) {
        const errBody = await resParse.json().catch(() => ({}));
        throw new Error(
          errBody.error || `evidence-parse 失败: ${resParse.status}`
        );
      }
      const ep = (await resParse.json()) as EvidenceParseResponse;

      const evidence: M1Evidence = {
        source: "resume",
        summary: ep.summary,
        tags: ep.tags ?? [],
        rawSnippet: ep.rawSnippet ?? parsed.text.slice(0, 1500),
        quality: ep.quality,
        createdAt: new Date().toISOString(),
      };

      // 2. 调 recommend 三段融合
      const sub = await submitM1Recommendation({ evidence });
      if (sub.ok) {
        router.push("/m1/result");
        return;
      }
      if (sub.fellBackToSample) {
        router.push("/m1/result");
        return;
      }
      throw new Error(sub.error);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitErr(msg);
      setStep("preview");
    }
  };

  if (hasAnswers === null) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg flex items-center justify-center">
          <p className="text-sm text-ink-muted font-display italic">加载中…</p>
        </main>
      </>
    );
  }
  if (!hasAnswers) {
    return (
      <>
        <Nav />
        <main className="min-h-screen bg-warm-bg pt-32 px-6">
          <div className="max-w-md mx-auto text-center">
            <p className="text-5xl mb-5">🧭</p>
            <h2 className="text-xl font-bold text-ink mb-3">先做测评</h2>
            <p className="text-sm text-ink-soft mb-6 leading-relaxed">
              测评结果是推荐的主信号,先答完 19 题再回来上传简历。
            </p>
            <Link
              href="/m1/quiz"
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              去做测评 →
            </Link>
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

        {/* 顶部进度 */}
        <section className="border-b border-border bg-card">
          <div className="max-w-[800px] mx-auto px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
            <Link
              href="/m1/evidence"
              className="text-xs text-ink-soft hover:text-esther-blue transition-colors"
            >
              ← 换个方式
            </Link>
            <div className="flex items-center gap-2 text-xs font-display italic">
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-blue/10 text-esther-blue font-medium">
                ✓ 测评
              </span>
              <span className="text-ink-muted">›</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-esther-yellow text-ink font-bold">
                📄 上传简历
              </span>
              <span className="text-ink-muted">›</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-warm-bg-deep text-ink-muted">
                推荐
              </span>
            </div>
          </div>
        </section>

        <div className="max-w-[800px] mx-auto px-6 py-10">
          {step === "input" && (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-ink mb-3">
                上传简历(本地解析,不上传服务器)
              </h1>
              <p className="text-sm text-ink-soft mb-8 leading-relaxed">
                支持 PDF / Word(.docx)/ Markdown / 纯文本。
                <br />
                解析在浏览器本地完成,提取后的文本会发给推荐 LLM 做摘要(不做账号级持久化)。
              </p>

              {/* 拖拽 + 选文件 */}
              <Card
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className={`p-10 border-2 border-dashed transition-colors ${
                  dragging
                    ? "border-esther-blue bg-esther-blue/5"
                    : "border-border bg-card"
                } text-center mb-6`}
              >
                <p className="text-5xl mb-4">📎</p>
                <p className="text-base text-ink mb-2">
                  拖文件到这里,或者
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
                >
                  选个文件
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.md,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                  }}
                />
                <p className="text-xs text-ink-muted mt-4">
                  PDF / Word / Markdown / TXT · 上限 5 MB · 20 页内
                </p>
              </Card>

              {/* fallback 粘贴 */}
              <div>
                <p className="text-xs text-ink-muted mb-2 font-display italic">
                  ↓ 或者直接贴文本(没文件也能用)
                </p>
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="把简历内容贴这里 — 学校 / 专业 / 实习 / 项目 / 技能,贴多少算多少..."
                  className="w-full min-h-[160px] p-4 rounded-xl border-2 border-border bg-card text-sm text-ink leading-relaxed focus:border-esther-blue focus:outline-none resize-y"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="text-xs text-ink-muted font-display italic">
                    {pasteText.trim().length} 字
                  </p>
                  <button
                    onClick={handlePasteSubmit}
                    disabled={pasteText.trim().length < 20}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    用这段文本 →
                  </button>
                </div>
              </div>

              {parseErr && (
                <div className="mt-6 p-4 rounded-xl bg-esther-red/5 border border-esther-red/30 text-sm text-esther-red leading-relaxed">
                  ⚠️ {parseErr}
                  <p className="text-xs text-ink-soft mt-2">
                    试试直接贴文本到下面的输入框,通常都能成功。
                  </p>
                </div>
              )}
            </>
          )}

          {step === "preview" && parsed && (
            <>
              <h1 className="text-2xl md:text-3xl font-bold text-ink mb-3">
                解析好了 — 校对一下
              </h1>
              <p className="text-sm text-ink-soft mb-8 leading-relaxed">
                我们从「<span className="font-medium">{parsed.fileName}</span>」读到{" "}
                <span className="font-bold text-esther-blue">
                  {parsed.text.length}
                </span>{" "}
                字。下面是前 {PREVIEW_CHARS} 字预览。看着乱码 / 缺字 → 回去贴文本。
              </p>

              {parsed.warnings.length > 0 && (
                <div className="mb-6 p-3 rounded-xl bg-esther-yellow/15 border border-esther-yellow/60 text-xs text-ink leading-relaxed">
                  {parsed.warnings.map((w, i) => (
                    <p key={i}>⚠️ {w}</p>
                  ))}
                </div>
              )}

              <Card className="p-5 border-2 border-border bg-warm-bg-deep/30 mb-6">
                <p className="text-xs text-ink-muted mb-2 font-display italic">
                  Preview(前 {PREVIEW_CHARS} 字)
                </p>
                <pre className="text-xs text-ink leading-relaxed whitespace-pre-wrap font-sans">
                  {parsed.text.slice(0, PREVIEW_CHARS)}
                  {parsed.text.length > PREVIEW_CHARS && (
                    <span className="text-ink-muted">
                      {"\n"}…(还有 {parsed.text.length - PREVIEW_CHARS} 字)
                    </span>
                  )}
                </pre>
              </Card>

              {submitErr && (
                <div className="mb-6 p-4 rounded-xl bg-esther-red/5 border border-esther-red/30 text-sm text-esther-red">
                  ⚠️ {submitErr}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <button
                  onClick={() => {
                    setParsed(null);
                    setStep("input");
                  }}
                  className="px-5 py-2.5 rounded-full border border-border bg-card text-sm text-ink-soft hover:border-esther-blue transition-colors"
                >
                  ← 换一份 / 重贴
                </button>
                <button
                  onClick={handleConfirm}
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
                >
                  就用这份 → 看推荐
                </button>
              </div>
            </>
          )}

          {step === "submitting" && (
            <div className="text-center py-20">
              <div className="inline-block animate-spin w-12 h-12 border-4 border-esther-blue border-t-transparent rounded-full mb-6" />
              <h2 className="text-xl font-bold text-ink mb-3">
                不二在结合简历 + 测评帮你挑方向…
              </h2>
              <p className="text-sm text-ink-soft leading-relaxed">
                先让 LLM 摘出简历核心,再做三段融合,通常 5-12 秒。
              </p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
