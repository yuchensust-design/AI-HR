"use client";

/**
 * 看岗位「用我的简历推荐」无简历时的就地上传器。
 * 复用 m3 上传同款能力:粘贴文本 或 上传 PDF/Word(浏览器本地提取)→ /api/m3/parse-resume 解析。
 * 解析成功后把 parsed 结果交给 onParsed(由 discover 页负责持久化:游客 localStorage / 登录建会话存 DB)。
 */
import { useRef, useState } from "react";
import { extractTextFromPdf } from "@/lib/pdf-extract";
import { extractTextFromDocx } from "@/lib/docx-extract";

type Status = "idle" | "extracting" | "parsing" | "error";

export function ResumeUploadInline({
  onParsed,
}: {
  onParsed: (parsed: unknown) => void | Promise<void>;
}) {
  const [tab, setTab] = useState<"paste" | "file">("paste");
  const [pasted, setPasted] = useState("");
  const [extracted, setExtracted] = useState("");
  const [filename, setFilename] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const text = tab === "paste" ? pasted : extracted;
  const busy = status === "extracting" || status === "parsing";

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTab("file");
    setFilename(file.name);
    setStatus("extracting");
    setErr("");
    try {
      const lower = file.name.toLowerCase();
      let t = "";
      if (lower.endsWith(".pdf")) {
        t = (await extractTextFromPdf(file)).text;
      } else if (lower.endsWith(".docx") || lower.endsWith(".doc")) {
        t = (await extractTextFromDocx(file)).text;
      } else if (lower.endsWith(".md") || lower.endsWith(".txt")) {
        t = await file.text();
      } else {
        throw new Error("仅支持 PDF / DOCX / MD / TXT,其他格式请粘贴文字");
      }
      setExtracted(t);
      setStatus("idle");
    } catch (e) {
      setErr((e instanceof Error ? e.message : "提取失败") + " — 可以试试直接粘贴文字");
      setStatus("error");
      setTab("paste");
    }
  }

  async function parse() {
    if (!text.trim()) {
      setErr("请粘贴简历文本或上传文件");
      setStatus("error");
      return;
    }
    setStatus("parsing");
    setErr("");
    try {
      const res = await fetch("/api/m3/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: text.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = await res.json();
      await onParsed(parsed);
      // 成功后父组件会切到"已检测到简历"视图,本组件随之卸载;这里不需要 done 态
      setStatus("idle");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "解析失败");
      setStatus("error");
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-esther-blue/30 bg-warm-bg-deep/20 p-4">
      {/* tab */}
      <div className="inline-flex p-0.5 rounded-full bg-card border border-border mb-3">
        {([
          ["paste", "✍️ 粘贴文字"],
          ["file", "📎 上传 PDF / Word"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            disabled={busy}
            className={`px-3.5 py-1.5 text-xs rounded-full transition-colors ${
              tab === id ? "bg-esther-blue text-white" : "text-ink-soft hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "paste" ? (
        <>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder="粘贴你的简历全文 — 任何格式都行(姓名 / 教育 / 实习 / 项目 / 技能 ...)"
            disabled={busy}
            className="w-full px-3 py-2.5 rounded-lg border border-border bg-warm-bg text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y font-mono"
          />
          <p className="text-[11px] text-ink-muted mt-1">字数:{pasted.length} · 推荐 800-3000 字</p>
        </>
      ) : (
        <label className="block">
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-esther-blue transition-colors cursor-pointer bg-card/60">
            {filename ? (
              <p className="text-sm text-ink">
                📎 {filename}
                <span className="block text-xs text-ink-soft mt-0.5">
                  已提取 {extracted.length} 字 · 点击重新选择
                </span>
              </p>
            ) : (
              <p className="text-sm text-ink">
                点击选择文件
                <span className="block text-xs text-ink-soft mt-0.5">
                  PDF / DOCX / MD / TXT · 浏览器本地解析,不上传服务器
                </span>
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,.md,.txt"
              onChange={onFile}
              disabled={busy}
              className="hidden"
            />
          </div>
        </label>
      )}

      {err && status === "error" && (
        <p className="text-xs text-esther-red mt-2">⚠️ {err}</p>
      )}

      <div className="flex items-center justify-between gap-3 mt-3">
        <p className="text-[11px] text-ink-muted">
          {status === "extracting" && "📖 浏览器本地提取中..."}
          {status === "parsing" && "🤖 AI 解析中(~5-10 秒)..."}
          {status === "idle" && (text.trim() ? "准备好了" : "粘贴或上传简历后开始")}
        </p>
        <button
          onClick={parse}
          disabled={busy || !text.trim()}
          className="px-5 py-2 rounded-lg bg-esther-blue text-white text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {busy ? "处理中..." : "解析简历 →"}
        </button>
      </div>
    </div>
  );
}
