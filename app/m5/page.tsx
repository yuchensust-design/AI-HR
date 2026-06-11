"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { createConversation } from "@/lib/conversations";
import { useLatestResume } from "@/lib/sync/useLatestResume";
import {
  M5_STORAGE_KEYS,
  type InterviewSessionConfig,
  type InterviewType,
  type PersonaKey,
} from "@/lib/interview-types";
import { PERSONA_SPECS } from "@/lib/interviewer-personas";
import { STORAGE_KEYS } from "@/lib/use-local-state";
import { resumeTextFrom } from "@/lib/resume-text";
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
      <Module5ConfigContent />
    </Suspense>
  );
}

function Module5ConfigContent() {
  const router = useRouter();
  const sp = useSearchParams();
  const convId = sp.get("c");
  const { user, loading: userLoading } = useUser();

  // 登录用户带 conv id 进来:如果该 conv 已有 config(老面试)→ 跳 /m5/live;
  // 没 config(新建会话)→ 显示当前配置表单,提交时 update 此 conv
  useEffect(() => {
    if (userLoading || !user || !convId) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("m5_interviews")
      .select("config_json, debrief_md, turns_json")
      .eq("conversation_id", convId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const cfg = (data?.config_json as Record<string, unknown> | undefined) ?? null;
        const hasDebrief = !!data?.debrief_md;
        const turns = data?.turns_json as { answers?: unknown[] } | undefined;
        const hasAnswers = Array.isArray(turns?.answers) && turns!.answers.length > 0;
        // 点历史会话:已完成(有复盘) → 看复盘结果;答过但没复盘 → 也进复盘(会重建生成);
        // 仅配置过没答 → 进 live 开始/续答;全空(新建) → 留在配置表单。
        if (hasDebrief || hasAnswers) {
          router.replace(`/m5/debrief?c=${convId}`);
        } else if (cfg && Object.keys(cfg).length > 0) {
          router.replace(`/m5/live?c=${convId}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, userLoading, convId, router]);

  const latestResume = useLatestResume();
  const autoPickedResumeRef = useRef(false);
  const m3ResumeAppliedRef = useRef(false); // fromm3 已覆盖简历 → latest 别盖回
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
  // JD 来源标签:"M3" 表示来自简历优化的目标岗位,"M6" 表示来自岗位发现,null 表示未继承(默认示例 / 用户手动改)
  const [jdSource, setJdSource] = useState<"m3" | "m6" | null>(null);
  // 目标岗位名 —— 跟随 JD 一起继承(m6 roleName / m3 jd_context.role_name),写进 config.target_role,
  // 复盘回流改简历时一并带过去,避免目标岗位丢失。
  const [roleName, setRoleName] = useState<string>("");
  const [type, setType] = useState<InterviewType | null>(null);
  const [persona, setPersona] = useState<PersonaKey | null>(null);
  const [numQuestions, setNumQuestions] = useState<5 | 10 | 15>(10);
  const [cameraOn, setCameraOn] = useState(true);
  const [recordSession, setRecordSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // M3→M5:按 ?fromm3=<m3会话id> 读「你在改简历里看的那份」简历+JD,作最高优先
  // (修跨模块串简历:登录多会话时不再默认套账号最新那份)。探针 m3Loaded 让它先于 latest 决定。
  const fromM3 = sp.get("fromm3");
  const [m3Loaded, setM3Loaded] = useState<"pending" | "done">(
    fromM3 ? "pending" : "done",
  );
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!fromM3) return;
    if (userLoading) return;
    if (!user) {
      setM3Loaded("done"); // 游客:m3 会话不在 DB,退回本地最新简历(本就单份,正确)
      return;
    }
    let cancelled = false;
    createClient()
      .from("m3_resumes")
      .select("parsed_resume_json, final_resume_md, jd_context_json")
      .eq("conversation_id", fromM3)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const txt = resumeTextFrom(
            (data.final_resume_md ?? null) as string | null,
            (data.parsed_resume_json ?? null) as never,
          );
          const name = (
            data.parsed_resume_json as { basic?: { name?: string } } | null
          )?.basic?.name?.trim();
          const jc = (data.jd_context_json ?? {}) as {
            raw_jd_text?: string;
            role_name?: string;
          };
          if (jc.role_name?.trim()) setRoleName(jc.role_name.trim());
          // 用户明确从这条改简历会话跳来 → 无论简历长短都【不许】回退到账号最新那份
          // (否则 JD 来自该会话、简历却被悄悄串成账号最新 —— 类① 静默串简历)。
          m3ResumeAppliedRef.current = true;
          if (txt.trim().length > 20) {
            setSavedResumeText(txt);
            setSavedResumeSummary(
              name ? `已有简历(${name} · 来自简历优化)` : "已有简历(来自简历优化)",
            );
            setResumeSource("saved");
            autoPickedResumeRef.current = true;
          } else {
            // 该会话还没简历内容:提示上传,而不是悄悄套账号最新
            setSavedResumeSummary(
              "这份简历优化会话还没简历内容 — 请在下方上传 / 粘贴一份",
            );
          }
          if (jc.raw_jd_text && jc.raw_jd_text.trim().length > 20) {
            setJdText(jc.raw_jd_text);
            setJdSource("m3");
          }
        }
        setM3Loaded("done");
      },
      () => {
        // 真·传输层 reject(断网/abort)→ 别卡在 pending 门控,优雅退回
        if (!cancelled) setM3Loaded("done");
      });
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [fromM3, user, userLoading]);

  // 跨模块 JD 继承,优先级:fromm3(上面单独处理)> M6_PENDING_JD > JD_CONTEXT > SAMPLE_JD
  // M6_PENDING_JD:用户从 M6 岗位发现跳过来,带最新岗位信息(消费后清除)
  // JD_CONTEXT:用户在 M3 简历优化中刚刚拆解过的目标岗位(不消费,保留供后续模块复用)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (fromM3) return; // fromm3 跳转 → JD 由上面的 effect 决定,别被全局 JD 盖掉
    // 1. 先尝试 M6_PENDING_JD
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M6_PENDING_JD);
      if (raw) {
        const pending = JSON.parse(raw) as {
          jdText?: string;
          roleName?: string;
          company?: string;
          salary?: string;
          city?: string;
          from_m6?: boolean;
        };
        if (pending.from_m6 && pending.roleName) {
          const fallback = `【${pending.roleName}】@ ${pending.company ?? "(公司)"}\n${
            pending.salary ?? ""
          } · ${pending.city ?? ""}\n\n(完整 JD 暂未抓到,可手动补充)`;
          setJdText(
            pending.jdText && pending.jdText.length > 50 ? pending.jdText : fallback
          );
          if (pending.roleName?.trim()) setRoleName(pending.roleName.trim());
          setJdSource("m6");
          window.localStorage.removeItem(STORAGE_KEYS.M6_PENDING_JD);
          return;
        }
      }
    } catch {
      /* fall through to JD_CONTEXT */
    }

    // 2. M6 没命中 → 尝试 JD_CONTEXT (M3 刚拆解的目标岗位)
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.JD_CONTEXT);
      if (!raw) return;
      const ctx = JSON.parse(raw) as {
        raw_jd_text?: string;
        role_name?: string;
        company?: string;
      } | null;
      if (ctx?.raw_jd_text && ctx.raw_jd_text.trim().length > 20) {
        setJdText(ctx.raw_jd_text);
        if (ctx.role_name?.trim()) setRoleName(ctx.role_name.trim());
        setJdSource("m3");
      }
    } catch {
      /* keep SAMPLE_JD */
    }
  }, []);

  // 统一读简历:登录读账号最近一份简历(DB),游客读 localStorage(见 useLatestResume)。
  // 修"换设备/清缓存后账号有简历却读不到" + 不再直接喂原始 JSON 给出题模型。
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (latestResume.loading) return; // 等 auth/DB 确定,避免误判"没简历"
    if (m3Loaded === "pending") return; // 等 fromm3 先决定,别先用账号最新那份
    if (m3ResumeAppliedRef.current) return; // 已被 fromm3 覆盖,别盖回
    setSavedResumeText(latestResume.resumeText);
    if (latestResume.hasResume) {
      const name = latestResume.parsedResume?.basic?.name?.trim();
      const who = latestResume.source === "db" ? "账号最新" : "本地";
      setSavedResumeSummary(name ? `已有简历(${name} · ${who})` : `已有简历(${who})`);
      // 首次且用户还没手动选别的源 → 自动选中(functional update 防 stale)
      if (!autoPickedResumeRef.current) {
        autoPickedResumeRef.current = true;
        setResumeSource((cur) => cur ?? "saved");
      }
    } else {
      setSavedResumeSummary("还没有简历 — 请上传或粘贴");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [latestResume, m3Loaded]);

  const resumeText =
    resumeSource === "saved"
      ? savedResumeText
      : resumeSource === "paste" || resumeSource === "upload"
        ? pastedResume.trim()
        : "";

  // 已有简历是否可用(够长才算)—— 驱动「用我已有简历」卡片可不可选,避免选中态和校验态打架
  const savedResumeUsable = savedResumeText.trim().length > 20;

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

  async function handleSubmit() {
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
      // 继承到的目标岗位名 —— 复盘回流改简历时随 JD 一起带过去
      ...(roleName.trim() ? { target_role: roleName.trim() } : {}),
    };
    try {
      // 1. 始终写 localStorage(游客 + 登录 fallback)
      window.localStorage.setItem(
        M5_STORAGE_KEYS.SESSION_CONFIG,
        JSON.stringify(config),
      );

      // 2. 登录用户:写 DB(create conv if 无 / update if 已有)
      if (user) {
        const supabase = createClient();
        const title = `${(type ?? "面试").slice(0, 8)} · ${jdText.trim().slice(0, 12) || "新会话"}`;
        const targetConvId = convId ?? (await createConversation("m5", title));
        if (targetConvId) {
          await supabase
            .from("m5_interviews")
            .update({ config_json: config })
            .eq("conversation_id", targetConvId);
          router.push(`/m5/live?c=${targetConvId}`);
          return;
        }
      }

      router.push("/m5/live");
    } catch (err) {
      console.error("[m5/config] save failed", err);
      alert("浏览器存储不可用,无法开始面试");
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <div className="flex">
          <Suspense fallback={<aside className="w-60 flex-shrink-0" />}>
            <ConversationSwitcher module="m5" basePath="/m5" defaultTitle="面试" />
          </Suspense>
          <div className="flex-1 min-w-0">

        <section className="border-b border-border">
          <div className="max-w-[1000px] mx-auto px-6 py-8">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
            >
              ← 回首页
            </Link>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
              先告诉我点信息,然后开始
            </h1>
            <p className="text-ink-soft text-sm">
              填齐下面,我按岗位用你的简历 + JD 出题。面试中会就你的回答追问深挖,结束后给你双层评分复盘
            </p>
          </div>
        </section>

        {/* 练完会得到什么 — 期望管理,降低用户焦虑 */}
        <section className="bg-esther-yellow/15 border-y border-esther-yellow/40">
          <div className="max-w-[1000px] mx-auto px-6 py-5">
            <p className="font-display italic text-xs text-esther-blue mb-2">练完会得到什么</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-ink-soft">
              <div className="flex items-start gap-2">
                <span className="text-esther-blue text-sm">①</span>
                <span><strong className="text-ink">面试官会追问</strong> · 答得含糊 / 缺数字会被当场追问深挖,像真面试一样接话</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-esther-blue text-sm">②</span>
                <span><strong className="text-ink">双层评分</strong> · 表达 4 维(逻辑 / 具体 / 清晰 / 口水话) + 岗位能力维度,引用你的原话</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-esther-blue text-sm">③</span>
                <span><strong className="text-ink">反哺简历</strong> · 答得好的亮点一键加进简历 bullet</span>
              </div>
            </div>
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
                  disabled={!savedResumeSummary || !savedResumeUsable}
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
                    {savedResumeSummary ?? "(还没有简历 — 请上传或粘贴)"}
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
            <div className="flex items-baseline gap-3 mb-2 flex-wrap">
              <span className="font-display italic text-2xl font-bold text-esther-blue">
                02
              </span>
              <h3 className="text-lg font-semibold text-ink">
                目标岗位 JD <span className="text-esther-red">*</span>
              </h3>
              {jdSource === "m3" && (
                <Badge className="bg-esther-blue/15 text-esther-blue hover:bg-esther-blue/15 text-[11px] font-normal px-2 py-0.5">
                  来自 M3 的目标岗位
                </Badge>
              )}
              {jdSource === "m6" && (
                <Badge className="bg-esther-yellow/30 text-ink hover:bg-esther-yellow/30 text-[11px] font-normal px-2 py-0.5">
                  来自 M6 的岗位发现
                </Badge>
              )}
            </div>
            <p className="text-xs text-ink-soft mb-4 pl-10">
              {jdSource === "m3"
                ? "已自动继承你在 M3 拆解过的目标岗位 JD,可继续修改"
                : jdSource === "m6"
                  ? "已自动继承你在 M6 选择的岗位,可继续修改"
                  : "粘贴 JD 文本 · 越完整出题越准"}
            </p>
            <textarea
              value={jdText}
              onChange={(e) => {
                setJdText(e.target.value);
                // 用户手动改动后,来源标签失效(避免误导)
                if (jdSource !== null) setJdSource(null);
              }}
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
            <p className="text-[11px] text-ink-muted mt-3 pl-10">
              ⚠️ 追问不会贬低你 — 复盘只看 STAR / 数字 / 卡顿
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

          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}
