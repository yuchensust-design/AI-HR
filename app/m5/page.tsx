"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import {
  M5_STORAGE_KEYS,
  type InterviewSessionConfig,
  type InterviewType,
  type PersonaKey,
} from "@/lib/interview-types";
import { PERSONA_SPECS } from "@/lib/interviewer-personas";
import { STORAGE_KEYS } from "@/lib/use-local-state";
import {
  parseResumeFile,
  ResumeParseError,
} from "@/lib/parse-resume-file";

/**
 * 模块 5 · 模拟面试 配置页
 * 路由 /m5
 * 6 项填齐才能"开始模拟面试" → 写 localStorage interview_session_config → 跳 /m5/live
 *
 * Q2 新需求:摄像头 vs 录制独立 — 摄像头是本地预览,"录制本场"独立征求同意,
 * 录制 → MediaRecorder → 浏览器本地 .webm,绝不上传。
 */

const TYPES: Array<{ key: InterviewType; label: string; desc: string }> = [
  { key: "semi", label: "半结构化", desc: "国内校招主流 · 简历过 + 行为题" },
  { key: "bq", label: "行为面 BQ", desc: "STAR 题为主 · 适合外企 / 实习" },
  { key: "tech", label: "技术面", desc: "按 target role 出技术题" },
];

const PERSONAS: Array<{
  key: PersonaKey;
  emoji: string;
  label: string;
  tagline: string;
  sampleOpener: string;
  sampleFollowUp: string;
  useCase: string;
}> = [
  {
    key: "gentle",
    emoji: "🌸",
    label: PERSONA_SPECS.gentle.display_name,
    tagline: PERSONA_SPECS.gentle.short_tagline,
    sampleOpener: PERSONA_SPECS.gentle.sample_opener,
    sampleFollowUp: PERSONA_SPECS.gentle.sample_follow_up,
    useCase: PERSONA_SPECS.gentle.use_case,
  },
  {
    key: "strict",
    emoji: "⚡",
    label: PERSONA_SPECS.strict.display_name,
    tagline: PERSONA_SPECS.strict.short_tagline,
    sampleOpener: PERSONA_SPECS.strict.sample_opener,
    sampleFollowUp: PERSONA_SPECS.strict.sample_follow_up,
    useCase: PERSONA_SPECS.strict.use_case,
  },
  {
    key: "rigor",
    emoji: "🔍",
    label: PERSONA_SPECS.rigor.display_name,
    tagline: PERSONA_SPECS.rigor.short_tagline,
    sampleOpener: PERSONA_SPECS.rigor.sample_opener,
    sampleFollowUp: PERSONA_SPECS.rigor.sample_follow_up,
    useCase: PERSONA_SPECS.rigor.use_case,
  },
];

const COUNTS: Array<{ value: 5 | 10 | 15; label: string; time: string }> = [
  { value: 5, label: "5 题", time: "10-15 分钟" },
  { value: 10, label: "10 题", time: "20-30 分钟" },
  { value: 15, label: "15 题", time: "35-45 分钟" },
];

type ResumeSource = "saved" | "paste" | "upload";

const SAMPLE_JD = `【某互联网大厂 · AI 产品经理实习生】

岗位职责:
1. 参与 AI PM 团队的产品需求挖掘、设计与上线
2. 分析用户数据,辅助产品决策
3. 协调技术 / 设计资源推动项目落地

任职要求:
1. 计算机 / 数据 / 数学 等相关专业本科及以上
2. 对 AI 产品有热情,使用过 Claude / ChatGPT / Cursor 等工具
3. 数据分析能力,熟悉 Python / SQL
4. 有 0 → 1 项目经历优先`;

export default function Module5ConfigPage() {
  const router = useRouter();

  const [resumeSource, setResumeSource] = useState<ResumeSource | null>(null);
  const [savedResumeText, setSavedResumeText] = useState<string>("");
  const [savedResumeSummary, setSavedResumeSummary] = useState<string | null>(
    null
  );
  const [pastedResume, setPastedResume] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadParsing, setUploadParsing] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [jdText, setJdText] = useState(SAMPLE_JD);
  const [type, setType] = useState<InterviewType | null>(null);
  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [numQuestions, setNumQuestions] = useState<5 | 10 | 15>(10);
  const [cameraOn, setCameraOn] = useState(true);
  const [recordSession, setRecordSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 从 M6 跳过来 → 读 m6_pending_jd 自动预填 JD,消费后清除
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M6_PENDING_JD);
      if (!raw) return;
      const pending = JSON.parse(raw) as {
        jdText?: string;
        roleName?: string;
        company?: string;
        salary?: string;
        city?: string;
        from_m6?: boolean;
      };
      if (!pending.from_m6 || !pending.roleName) return;
      const fallback = `【${pending.roleName}】@ ${pending.company ?? "(公司)"}\n${
        pending.salary ?? ""
      } · ${pending.city ?? ""}\n\n(完整 JD 暂未抓到,可手动补充)`;
      setJdText(
        pending.jdText && pending.jdText.length > 50 ? pending.jdText : fallback
      );
      window.localStorage.removeItem(STORAGE_KEYS.M6_PENDING_JD);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    // 初始化:hydration 后从 localStorage 读简历快照,setState 是必要的副作用
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const finalRaw = window.localStorage.getItem("final_resume");
      if (finalRaw) {
        const parsed = JSON.parse(finalRaw) as {
          markdown?: string;
          lastUpdated?: string;
        };
        if (parsed?.markdown) {
          const firstLine = parsed.markdown.split("\n")[0]?.slice(0, 40) ?? "";
          setSavedResumeText(parsed.markdown);
          setSavedResumeSummary(
            firstLine
              ? `已有简历(${firstLine.replace(/^#+\s*/, "")}…)`
              : "已有简历"
          );
          setResumeSource("saved");
          return;
        }
      }
      const parsedRaw = window.localStorage.getItem("parsed_resume");
      if (parsedRaw) {
        setSavedResumeText(parsedRaw);
        setSavedResumeSummary("已有简历(parsed_resume)");
        setResumeSource("saved");
      }
    } catch {
      // localStorage 异常 → 走粘贴流程
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const resumeText =
    resumeSource === "saved"
      ? savedResumeText
      : resumeSource === "paste" || resumeSource === "upload"
        ? pastedResume.trim()
        : "";

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadParsing(true);
    setUploadError(null);
    setUploadWarnings([]);
    try {
      const result = await parseResumeFile(file);
      setPastedResume(result.text);
      setUploadedFileName(result.fileName);
      setUploadWarnings(result.warnings);
      setResumeSource("upload");
    } catch (err) {
      const msg =
        err instanceof ResumeParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : "解析失败";
      setUploadError(msg);
      setUploadedFileName(null);
    } finally {
      setUploadParsing(false);
      // 清掉 input value,同名文件再次选可重新触发 onChange
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const canSubmit =
    resumeText.length > 20 &&
    jdText.trim().length > 20 &&
    type !== null &&
    persona !== null &&
    !submitting;

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    const config: InterviewSessionConfig = {
      resume_text: resumeText,
      jd_text: jdText.trim(),
      type: type!,
      persona: persona!,
      num_questions: numQuestions,
      mode: cameraOn ? "camera" : "audio_only",
      record: cameraOn && recordSession,
      started_at: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(
        M5_STORAGE_KEYS.SESSION_CONFIG,
        JSON.stringify(config)
      );
      router.push("/m5/live");
    } catch (err) {
      console.error("[m5/config] localStorage write failed", err);
      alert("浏览器存储不可用,无法开始面试");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <section className="border-b border-border">
          <div className="max-w-[1000px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <Badge className="bg-esther-yellow text-ink hover:bg-esther-yellow/90 mb-3 px-3 py-1 text-xs font-medium">
              模块 05 · 模拟面试
            </Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              先告诉我点信息,然后开始
            </h1>
            <p className="text-ink-soft text-sm">
              填齐下面,我用你的简历 + JD 出题,面试结束后给你 4 维评分复盘
            </p>
          </div>
        </section>

        <div className="max-w-[1000px] mx-auto px-6 py-10 space-y-6">
          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                01
              </span>
              <h3 className="text-lg font-semibold text-ink">
                简历 <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              用已有简历,或上传 PDF / Word / Markdown(浏览器本地 parse,绝不上传)
            </p>
            <div className="pl-10 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button
                  type="button"
                  disabled={!savedResumeSummary}
                  onClick={() => setResumeSource("saved")}
                  className={`p-4 rounded-xl border-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    resumeSource === "saved"
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <p className="text-sm font-medium text-ink mb-1">
                    {resumeSource === "saved" ? "✓ " : ""}用我已有简历
                  </p>
                  <p className="text-[11px] text-ink-soft truncate">
                    {savedResumeSummary ?? "(localStorage 里还没有简历)"}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUploadError(null);
                    fileInputRef.current?.click();
                  }}
                  disabled={uploadParsing}
                  className={`p-4 rounded-xl border-2 text-left transition-colors disabled:opacity-50 disabled:cursor-wait ${
                    resumeSource === "upload"
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <p className="text-sm font-medium text-ink mb-1">
                    {resumeSource === "upload" ? "✓ " : ""}📎 选择文件
                  </p>
                  <p className="text-[11px] text-ink-muted truncate">
                    {uploadParsing
                      ? "解析中…"
                      : uploadedFileName
                        ? uploadedFileName
                        : ".pdf / .docx / .md / .txt · ≤ 5 MB"}
                  </p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.md,.txt"
                  className="hidden"
                  onChange={handleFilePick}
                />
                <button
                  type="button"
                  onClick={() => setResumeSource("paste")}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    resumeSource === "paste"
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <p className="text-sm font-medium text-ink mb-1">
                    {resumeSource === "paste" ? "✓ " : ""}📋 粘贴文本
                  </p>
                  <p className="text-[11px] text-ink-muted">直接贴简历内容</p>
                </button>
              </div>
              {uploadError && (
                <div className="rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
                  ⚠️ {uploadError}
                </div>
              )}
              {uploadWarnings.length > 0 && resumeSource === "upload" && (
                <div className="rounded-lg border border-esther-yellow/50 bg-esther-yellow/15 px-3 py-2 text-[11px] text-ink-soft space-y-1">
                  {uploadWarnings.map((w, i) => (
                    <p key={i}>💡 {w}</p>
                  ))}
                </div>
              )}
              {(resumeSource === "paste" || resumeSource === "upload") && (
                <div className="space-y-1.5">
                  {resumeSource === "upload" && (
                    <p className="text-[11px] text-ink-muted">
                      已 parse 出 {pastedResume.length} 字,你可以校对一下再开始(PDF 可能有错行)
                    </p>
                  )}
                  <textarea
                    value={pastedResume}
                    onChange={(e) => setPastedResume(e.target.value)}
                    placeholder="贴你的简历(姓名 + 教育 + 经历 + 技能…),≥ 20 字才能开始"
                    className="w-full min-h-[200px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
                  />
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                02
              </span>
              <h3 className="text-lg font-semibold text-ink">
                目标岗位 JD <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              粘贴 JD 文本 · 越完整出题越准
            </p>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              className="w-full ml-0 md:ml-10 md:w-[calc(100%-2.5rem)] min-h-[140px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
            />
          </Card>

          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                03
              </span>
              <h3 className="text-lg font-semibold text-ink">
                面试类型 <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              不同类型出题逻辑不同
            </p>
            <div className="pl-10 grid grid-cols-1 md:grid-cols-3 gap-3">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setType(t.key)}
                  className={`p-4 rounded-xl border-2 text-left transition-colors ${
                    type === t.key
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <p className="text-sm font-medium text-ink mb-1">
                    {type === t.key ? "✓ " : ""}{t.label}
                  </p>
                  <p className="text-[11px] text-ink-soft leading-relaxed">
                    {t.desc}
                  </p>
                </button>
              ))}
            </div>
            <div className="pl-10 mt-3 flex items-center gap-3 flex-wrap">
              <span className="text-[11px] text-ink-muted">v2 即将上线 ·</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-warm-bg-deep text-ink-muted text-[11px] border border-border">
                案例面
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-warm-bg-deep text-ink-muted text-[11px] border border-border">
                群面
              </span>
            </div>
          </Card>

          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-2">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                04
              </span>
              <h3 className="text-lg font-semibold text-ink">
                面试官性格 <span className="text-esther-red">*</span>
              </h3>
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              性格会影响出题语气、追问深度和 TTS 音色 — 下面 3 张卡片各给一句 sample 开场和一句追问感,挑你想练的
            </p>
            <div className="pl-10 grid grid-cols-1 md:grid-cols-3 gap-3">
              {PERSONAS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPersona(p.key)}
                  className={`p-4 rounded-xl border-2 text-left transition-all flex flex-col ${
                    persona === p.key
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-3xl">{p.emoji}</span>
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted font-display italic">
                      {p.useCase}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-ink mb-1">
                    {persona === p.key ? "✓ " : ""}{p.label}
                  </p>
                  <p className="text-[11px] text-ink-soft leading-relaxed mb-3">
                    {p.tagline}
                  </p>
                  <div className="mt-auto space-y-2">
                    <div className="rounded-lg bg-warm-bg-deep/60 border border-border p-2">
                      <p className="text-[10px] text-ink-muted font-display italic mb-0.5">
                        sample 开场
                      </p>
                      <p className="text-[11px] text-ink leading-snug">
                        “{p.sampleOpener}”
                      </p>
                    </div>
                    <div className="rounded-lg bg-esther-yellow/10 border border-esther-yellow/40 p-2">
                      <p className="text-[10px] text-ink-muted font-display italic mb-0.5">
                        sample 追问
                      </p>
                      <p className="text-[11px] text-ink leading-snug">
                        “{p.sampleFollowUp}”
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-ink-muted mt-3 pl-10 leading-relaxed">
              ⚠️ 严厉 / 严谨追问目的是让你讲清价值,不会贬低你。复盘里 AI 不会因为题目难就给低分,只看 STAR、数字、卡顿。
            </p>
          </Card>

          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                05
              </span>
              <h3 className="text-lg font-semibold text-ink">题数</h3>
            </div>
            <div className="pl-10 flex flex-wrap gap-3">
              {COUNTS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setNumQuestions(c.value)}
                  className={`flex items-center gap-3 px-5 py-3 rounded-xl border-2 transition-colors ${
                    numQuestions === c.value
                      ? "border-esther-blue bg-esther-blue/5"
                      : "border-border bg-card hover:border-esther-blue/50"
                  }`}
                >
                  <span className="text-sm font-medium text-ink">
                    {c.label}
                  </span>
                  <span className="text-[11px] text-ink-soft">{c.time}</span>
                  {c.value === 10 && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-esther-yellow text-ink">
                      推荐
                    </span>
                  )}
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-6 border-2 border-border">
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                06
              </span>
              <h3 className="text-lg font-semibold text-ink">摄像头 + 录制</h3>
            </div>
            <div className="pl-10 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cameraOn}
                  onChange={(e) => {
                    setCameraOn(e.target.checked);
                    if (!e.target.checked) setRecordSession(false);
                  }}
                  className="mt-1 w-5 h-5 accent-esther-blue"
                />
                <div>
                  <p className="text-sm text-ink font-medium mb-1">
                    开启摄像头(推荐)
                  </p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    可以练表情管理 · 视频流 100% 浏览器本地预览,绝不上传服务器
                  </p>
                </div>
              </label>
              {cameraOn && (
                <label className="flex items-start gap-3 cursor-pointer pl-8 border-l-2 border-esther-yellow/40">
                  <input
                    type="checkbox"
                    checked={recordSession}
                    onChange={(e) => setRecordSession(e.target.checked)}
                    className="mt-1 w-5 h-5 accent-esther-blue"
                  />
                  <div>
                    <p className="text-sm text-ink font-medium mb-1">
                      录制本场(默认关)
                    </p>
                    <p className="text-xs text-ink-soft leading-relaxed">
                      勾选后:浏览器本地录成 .webm,面试结束给你下载按钮 ·
                      <span className="text-esther-red"> 绝不上传服务器</span>
                    </p>
                  </div>
                </label>
              )}
            </div>
          </Card>

          <div className="flex flex-col items-center gap-3 pt-6">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-10 py-4 text-base font-medium hover:bg-esther-blue-dark transition-colors shadow-md disabled:bg-ink-muted disabled:cursor-not-allowed"
            >
              {submitting ? "正在准备题库…" : "开始模拟面试 →"}
            </button>
            {!canSubmit && !submitting && (
              <p className="text-xs text-ink-muted">
                {resumeText.length <= 20
                  ? "请先准备简历(≥ 20 字)"
                  : jdText.trim().length <= 20
                    ? "请贴 JD 文本(≥ 20 字)"
                    : !type
                      ? "请选面试类型"
                      : !persona
                        ? "请选面试官性格"
                        : "填齐才能开始"}
              </p>
            )}
            {canSubmit && (
              <p className="text-xs text-ink-muted">
                开始后中途可以暂停 / 跳过 / 结束 · 刷新会丢失答案
              </p>
            )}
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
