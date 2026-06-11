"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { parseResumeFile, ResumeParseError } from "@/lib/parse-resume-file";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";
import { STORAGE_KEYS, useLocalState } from "@/lib/use-local-state";
import { useLatestResume } from "@/lib/sync/useLatestResume";
import type { LatestResume } from "@/lib/sync/useLatestResume";
import { useUser } from "@/lib/auth/useUser";
import { createClient } from "@/lib/supabase/client";
import { appendHiddenToLocal } from "@/lib/sync/hidden-experience";
import { createConversation } from "@/lib/conversations";
import { useM4Projects } from "@/lib/useM4Projects";
import { projectToHiddenExperience, TIME_TIERS } from "@/lib/m4-types";
import type {
  GapReport,
  M4LearningItem,
  M4Project,
  M4ProjectDraft,
  M4ProjectItem,
  M4ProjectStatus,
  M4Resource,
  M4SourceGap,
  ScoredGap,
  TimeTier,
} from "@/lib/m4-types";

type M1TargetRole = {
  role_type: string;
  industry: string;
  employability_level: "now" | "needs_project" | "long_term";
  saved_at: string;
};

/**
 * 模块 4 · 项目陪练 v3 —— 时间感知推荐(2026-06-10)
 *
 * 两步管道:
 *   IntakeForm(简历 + 目标岗位/JD + 时间档[必选])
 *     ① POST /api/m4/analyze-gaps   → GapReport(可见、可勾选的差距报告)
 *     ② POST /api/m4/recommend      → 冲刺: 学习卡 / 标准·深耕: 项目卡
 *   落地卡进状态机 PROPOSED → IN_PROGRESS → DONE → committable(进 M3 简历回流)
 *
 * 反编造守则:
 *   - committable === true 仅在 DONE + 用户填了实际 notes 时为真
 *   - 学习卡只能写成"了解/入门级 + 轻量产出",不冒充做过项目
 */

type JdContext = {
  jd_summary?: string;
  must_have?: string[];
  nice_to_have?: string[];
  gaps?: M4SourceGap[];
  raw_jd_text?: string;
  role_name?: string;
  company?: string;
};

type ParsedResume = {
  basic?: { name?: string; major?: string; year_level?: string };
  experience?: Array<{
    org?: string;
    role?: string;
    period?: string;
    bullets?: Array<string | { text?: string }>;
  }>;
  projects?: Array<{
    name?: string;
    period?: string;
    bullets?: Array<string | { text?: string }>;
  }>;
  activities?: Array<{ org?: string; role?: string; bullets?: unknown[] }>;
  skills?: Record<string, string[]>;
} | null;

const STATUS_LABEL: Record<M4ProjectStatus, string> = {
  PROPOSED: "📋 PROPOSED · 未开工",
  IN_PROGRESS: "🟡 IN_PROGRESS · 进行中",
  DONE: "✅ DONE · 已完成",
};

const STATUS_NEXT: Record<M4ProjectStatus, M4ProjectStatus | null> = {
  PROPOSED: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: null,
};

const PROJECT_NEXT_LABEL: Record<M4ProjectStatus, string | null> = {
  PROPOSED: "开始做这个项目 →",
  IN_PROGRESS: "标记为已完成 →",
  DONE: null,
};
const LEARNING_NEXT_LABEL: Record<M4ProjectStatus, string | null> = {
  PROPOSED: "开始补这一块 →",
  IN_PROGRESS: "标记为学完 →",
  DONE: null,
};

const COVERAGE_LABEL: Record<ScoredGap["current_coverage"], string> = {
  none: "完全没有",
  partial: "沾边不够",
  have: "已具备",
};

/** 把 ParsedResume 摘成 ≤ 500 字的纯文本,给 LLM 当 brief */
function summarizeResume(pr: ParsedResume): string {
  if (!pr) return "";
  const lines: string[] = [];
  if (pr.basic) {
    const b = pr.basic;
    lines.push(`专业:${b.major ?? "未知"} · 年级:${b.year_level ?? "未知"}`);
  }
  if (pr.experience?.length) {
    lines.push("经历:");
    pr.experience.slice(0, 3).forEach((e) => {
      lines.push(`- ${e.org ?? ""} / ${e.role ?? ""} · ${e.period ?? ""}`);
    });
  }
  if (pr.projects?.length) {
    lines.push("项目:");
    pr.projects.slice(0, 3).forEach((p) => {
      lines.push(`- ${p.name ?? ""} · ${p.period ?? ""}`);
    });
  }
  if (pr.skills) {
    const allSkills = Object.values(pr.skills).flat().slice(0, 8);
    if (allSkills.length) lines.push(`技能:${allSkills.join(", ")}`);
  }
  return lines.join("\n").slice(0, 500);
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 草稿(LLM 产出)→ 落地卡(补齐生命周期 + 时间档) */
function draftToProject(
  draft: M4ProjectDraft,
  timeTier: TimeTier,
  sourceResume: ParsedResume | null,
  sourceJd: { raw_jd_text?: string; role_name?: string } | null,
): M4Project {
  return {
    ...draft,
    id: makeId("m4p"),
    generated_at: new Date().toISOString(),
    time_budget: timeTier,
    status: "PROPOSED",
    started_at: null,
    done_at: null,
    notes: "",
    task_progress: {},
    committable: false,
    // 防串简历:快照本次实际所用简历 + JD,采纳时用它而非全局 localStorage
    source_resume: sourceResume,
    source_jd: sourceJd,
  };
}

export default function Module4Page() {
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
      <Module4Content />
    </Suspense>
  );
}

function Module4Content() {
  const sp = useSearchParams();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const fromM1 = sp.get("from") === "m1";

  const [jdContext, setJdContext] = useLocalState<JdContext | null>(
    STORAGE_KEYS.JD_CONTEXT,
    null,
  );

  /**
   * 飞轮:补项目/补能力 → 改简历。
   * 关键:必须带上「M4 这次用的简历 + 目标 JD」,而不是套用账号里最新那份简历
   * (否则会把 SQL 素材挂到一份本来就会 SQL、目标也不同的简历上 —— 之前的 bug)。
   *   - 登录:新开一个 M3 会话,种入 M4 的简历 + JD + 这条素材 → 落 setup 页让用户确认
   *   - 游客:M4 早已把简历/JD 写进 localStorage 总线,素材入本地池 → 落 setup 页
   */
  const handleAdoptToResume = useCallback(
    async (project: M4Project) => {
      if (!project.committable) return;
      const he = projectToHiddenExperience(project);

      // 这张卡【实际基于哪份简历/JD 生成】—— 用卡上的快照,不回头读全局 localStorage
      // (PARSED_RESUME 是 last-writer-wins 单 key,多简历会串成别份 —— 这正是之前的 bug)。
      // 旧持久化卡可能没快照 → 才回退到总线;两边都空就中止,绝不种入 null。
      let m4Parsed: unknown = project.source_resume ?? null;
      if (!m4Parsed) {
        try {
          m4Parsed = JSON.parse(
            window.localStorage.getItem(STORAGE_KEYS.PARSED_RESUME) || "null",
          );
        } catch {
          /* ignore */
        }
      }
      const m4Jd = project.source_jd ?? jdContext ?? null;

      if (!m4Parsed) {
        setAdoptErr(
          "没找到这张卡对应的简历,无法送进简历优化 —— 请回补项目重新生成一次(会带上简历),再采纳。",
        );
        return;
      }
      setAdoptErr(null);

      appendHiddenToLocal([he]); // 本地池兜底(游客必需,登录也留一份)

      if (user) {
        try {
          const supabase = createClient();
          const convId = await createConversation(
            "m3",
            `补项目回流 · ${(project.title ?? "").slice(0, 16)}`,
            supabase,
          );
          if (convId) {
            // 种入这张卡基于的简历 + JD + 这条素材;M3 setup 按这条会话 load,绝不串简历
            await supabase
              .from("m3_resumes")
              .update({
                parsed_resume_json: m4Parsed,
                jd_context_json: m4Jd,
                hidden_experience_json: [he],
              })
              .eq("conversation_id", convId);
            router.push(`/m3?c=${convId}&from=m4&setup=1`);
            return;
          }
        } catch (err) {
          console.error("[m4 adopt] seed m3 conversation failed", err);
          /* 落到游客兜底 */
        }
      }
      // 游客 / 登录种会话失败:把这张卡基于的简历 + JD 写进本地总线,M3 setup 读它
      try {
        window.localStorage.setItem(
          STORAGE_KEYS.PARSED_RESUME,
          JSON.stringify(m4Parsed),
        );
        if (m4Jd) {
          window.localStorage.setItem(
            STORAGE_KEYS.JD_CONTEXT,
            JSON.stringify(m4Jd),
          );
        }
      } catch {
        /* ignore */
      }
      router.push("/m3?from=m4&setup=1");
    },
    [user, router, jdContext],
  );
  const latestResume = useLatestResume();
  const [projects, setProjects] = useM4Projects();

  // M1→M4 直通:读 m1_target_role(预填表单目标岗位/行业)
  const [m1TargetRole, setM1TargetRole] = useState<M1TargetRole | null>(null);
  useEffect(() => {
    if (!fromM1) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M1_TARGET_ROLE);
      if (raw) setM1TargetRole(JSON.parse(raw) as M1TargetRole);
    } catch {
      /* ignore */
    }
  }, [fromM1]);

  // M3→M4:按 ?fromm3=<m3会话id> 读「你在改简历里看的那份」简历+JD,作最高优先预填
  // (修跨模块串简历:登录多会话时不再默认套账号最新那份)
  const fromM3 = sp.get("fromm3");
  const [handoff, setHandoff] = useState<{
    parsed: ParsedResume;
    role: string;
    jd: string;
  } | null>(null);
  // 探针:fromm3 跳转时,IntakeForm 的 role/jd 用 useState(initialJd) 在挂载时冻结。
  // handoff 是异步晚到的,若先挂载表单 → role/JD 永远填不进(简历走 prop 响应式没事)。
  // 所以 fromm3 + 登录时,等 handoff 拉完再渲染表单,保证初始值正确。
  const [handoffPending, setHandoffPending] = useState<boolean>(!!fromM3);
  useEffect(() => {
    if (!fromM3) {
      setHandoffPending(false);
      return;
    }
    if (userLoading) return; // 等 auth 落定再决定走 DB 还是放行
    if (!user) {
      setHandoffPending(false); // 游客无 DB handoff,正常渲染
      return;
    }
    let cancelled = false;
    setHandoffPending(true);
    createClient()
      .from("m3_resumes")
      .select("parsed_resume_json, jd_context_json")
      .eq("conversation_id", fromM3)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data) {
          const jc = (data.jd_context_json ?? {}) as {
            role_name?: string;
            raw_jd_text?: string;
          };
          setHandoff({
            parsed: (data.parsed_resume_json ?? null) as ParsedResume,
            role: jc.role_name ?? "",
            jd: jc.raw_jd_text ?? "",
          });
        }
        setHandoffPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [fromM3, user, userLoading]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [adoptErr, setAdoptErr] = useState<string | null>(null);

  useEffect(() => {
    if (!activeId && projects.length > 0) setActiveId(projects[0].id);
  }, [activeId, projects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  // 表单预填来源:M3 带过来的(fromm3)> M3 拆解过的目标岗位 > M1 推荐岗位
  const prefillRole =
    handoff?.role || jdContext?.role_name || m1TargetRole?.role_type || "";
  const prefillJd = handoff?.jd || jdContext?.raw_jd_text || "";
  const prefillSource: "m3" | "m1" | null =
    handoff || jdContext?.raw_jd_text ? "m3" : m1TargetRole ? "m1" : null;

  const handleGenerated = useCallback(
    (
      drafts: M4ProjectDraft[],
      timeTier: TimeTier,
      sourceResume: ParsedResume | null,
      sourceJd: { raw_jd_text?: string; role_name?: string } | null,
    ) => {
      const newProjects = drafts.map((d) =>
        draftToProject(d, timeTier, sourceResume, sourceJd),
      );
      setProjects((prev) => [...newProjects, ...prev]);
      setActiveId(newProjects[0]?.id ?? null);
      setShowForm(false);
    },
    [setProjects],
  );

  const updateProject = useCallback(
    (id: string, updater: (p: M4Project) => M4Project) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
    },
    [setProjects],
  );

  const handleAdvanceStatus = useCallback(
    (id: string) => {
      updateProject(id, (p) => {
        const next = STATUS_NEXT[p.status];
        if (!next) return p;
        const nowIso = new Date().toISOString();
        return {
          ...p,
          status: next,
          started_at:
            next === "IN_PROGRESS" && !p.started_at ? nowIso : p.started_at,
          done_at: next === "DONE" ? nowIso : p.done_at,
          committable: next === "DONE" && p.notes.trim().length > 10,
        };
      });
    },
    [updateProject],
  );

  const handleToggleTask = useCallback(
    (id: string, taskId: string) => {
      updateProject(id, (p) => ({
        ...p,
        task_progress: { ...p.task_progress, [taskId]: !p.task_progress[taskId] },
      }));
    },
    [updateProject],
  );

  const handleNotesChange = useCallback(
    (id: string, notes: string) => {
      updateProject(id, (p) => ({
        ...p,
        notes,
        committable: p.status === "DONE" && notes.trim().length > 10,
      }));
    },
    [updateProject],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm("删除这张卡?(已记的笔记会一并删除)")) return;
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [setProjects, activeId],
  );

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg" id="top">
        <div className="h-20" />

        <div className="flex">
          <Suspense fallback={<aside className="w-60 flex-shrink-0" />}>
            <ConversationSwitcher module="m4" basePath="/m4" defaultTitle="项目" />
          </Suspense>
          <div className="flex-1 min-w-0">
            <section className="border-b border-border">
              <div className="max-w-[1100px] mx-auto px-6 py-8">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-esther-blue transition-colors mb-5"
                >
                  ← 回首页
                </Link>
                <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2 leading-tight">
                  补一段能写进简历的经历
                </h1>
                <p className="text-ink-soft text-sm">
                  先把你和目标岗位的真实差距分析清楚,再按你的可准备时间出方案 ·
                  时间够就做项目,时间紧就先快速补概念 · 做完再加进简历,绝不把"提案"包装成"已完成"
                </p>
              </div>
            </section>

            {(projects.length === 0 || showForm) && (
              <section className="border-b border-border bg-warm-bg-deep/30">
                <div className="max-w-[1100px] mx-auto px-6 py-8">
                  {handoffPending ? (
                    <p className="text-sm text-ink-soft py-8 text-center">
                      正在带入你在简历优化里的简历和目标岗位…
                    </p>
                  ) : (
                    <IntakeForm
                      latestResume={latestResume}
                      handoffParsed={handoff?.parsed ?? null}
                      initialRole={prefillRole}
                      initialJd={prefillJd}
                      source={prefillSource}
                      hasProjects={projects.length > 0}
                      onCancel={() => setShowForm(false)}
                      onGenerated={handleGenerated}
                      onJdParsed={(ctx) => setJdContext(ctx)}
                    />
                  )}
                </div>
              </section>
            )}

            {projects.length > 0 && (
              <div className="max-w-[1100px] mx-auto px-6 py-10 space-y-6">
                {adoptErr && (
                  <div className="rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
                    ⚠️ {adoptErr}
                  </div>
                )}
                {!showForm && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowForm(true)}
                      className="inline-flex items-center gap-1 rounded-full border-2 border-esther-blue/40 bg-card text-esther-blue px-4 py-2 text-sm font-medium hover:bg-esther-blue/5 transition-colors"
                    >
                      ➕ 再补一个(换简历 / 换目标 / 换时间档)
                    </button>
                  </div>
                )}
                <ProjectTabs
                  projects={projects}
                  activeId={activeId}
                  onSelect={setActiveId}
                />
                {activeProject ? (
                  activeProject.kind === "learning" ? (
                    <LearningDetail
                      project={activeProject}
                      onAdvance={() => handleAdvanceStatus(activeProject.id)}
                      onNotesChange={(n) => handleNotesChange(activeProject.id, n)}
                      onDelete={() => handleDelete(activeProject.id)}
                      onAdopt={() => handleAdoptToResume(activeProject)}
                    />
                  ) : (
                    <ProjectDetail
                      project={activeProject}
                      onAdvance={() => handleAdvanceStatus(activeProject.id)}
                      onToggleTask={(taskId) =>
                        handleToggleTask(activeProject.id, taskId)
                      }
                      onNotesChange={(n) => handleNotesChange(activeProject.id, n)}
                      onDelete={() => handleDelete(activeProject.id)}
                      onAdopt={() => handleAdoptToResume(activeProject)}
                    />
                  )
                ) : (
                  <p className="text-sm text-ink-soft text-center py-10">
                    请从上方选一张卡展开
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <BuerFloatingButton />
      </main>
    </>
  );
}

/** ============================================================
 * IntakeForm — 两步向导:① 填信息 + 选时间档 → 分析差距;② 看差距报告 + 勾选 → 生成方案
 * ============================================================ */
function IntakeForm({
  latestResume,
  handoffParsed,
  initialRole,
  initialJd,
  source,
  hasProjects,
  onCancel,
  onGenerated,
  onJdParsed,
}: {
  latestResume: LatestResume;
  /** 从 M3「改简历」带过来的那份简历(fromm3),优先于账号最新那份 */
  handoffParsed: ParsedResume;
  initialRole: string;
  initialJd: string;
  source: "m3" | "m1" | null;
  hasProjects: boolean;
  onCancel: () => void;
  onGenerated: (
    drafts: M4ProjectDraft[],
    timeTier: TimeTier,
    sourceResume: ParsedResume | null,
    sourceJd: { raw_jd_text?: string; role_name?: string } | null,
  ) => void;
  onJdParsed: (ctx: JdContext) => void;
}) {
  const [step, setStep] = useState<"form" | "report">("form");

  // —— 简历:粘贴/上传只拿原始文本,解析延到「分析差距」一起做(不再单独点解析)——
  const [resumeMode, setResumeMode] = useState<"saved" | "new">("new");
  const [resumeTab, setResumeTab] = useState<"paste" | "file">("paste");
  const [resumeText, setResumeText] = useState(""); // 粘贴或从文件抽出的原始文本
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // 解析缓存:同一份文本只调一次 parse-resume,analyze/recommend 复用
  const [parsedCache, setParsedCache] = useState<ParsedResume>(null);
  const autoPicked = useRef(false);

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadBusy(true);
    setUploadError(null);
    try {
      const { text } = await parseResumeFile(file);
      setResumeText(text);
      setParsedCache(null);
      setUploadedFileName(file.name);
    } catch (err) {
      setUploadError(
        err instanceof ResumeParseError ? err.message : "文件解析失败,试试直接粘贴文字",
      );
    } finally {
      setUploadBusy(false);
    }
  }

  // —— 目标岗位 / JD / 时间档 ——
  const [role, setRole] = useState(initialRole);
  const [jd, setJd] = useState(initialJd);
  const [srcLabel, setSrcLabel] = useState<"m3" | "m1" | null>(source);
  const [timeTier, setTimeTier] = useState<TimeTier | null>(null);

  // 类② 修:目标岗位/JD 的预填来自【异步晚到】的源(?from=m1 的 m1_target_role、
  // JD_CONTEXT 总线 hydrate、fromm3 DB handoff)。useState(initialX) 在挂载首帧冻结了空值,
  // 父组件一拍后 initialRole/initialJd 才变非空 → 不回填就永远填不进。这里在"用户还没动过、
  // 字段仍为空"时把晚到的预填同步进来(不覆盖用户输入)。
  useEffect(() => {
    if (initialRole && role.trim() === "") setRole(initialRole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRole]);
  useEffect(() => {
    if (initialJd && jd.trim() === "") setJd(initialJd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJd]);
  useEffect(() => {
    if (source && srcLabel === null) setSrcLabel(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // —— 流程状态 ——
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // —— 差距报告 + 勾选 ——
  const [report, setReport] = useState<GapReport | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // 有 handoff(从 M3 带过来的那份)就优先用它作"已有简历",否则用账号最新那份
  const savedParsed = (handoffParsed ??
    (latestResume.parsedResume as unknown)) as ParsedResume;
  const hasSaved = !!handoffParsed || latestResume.hasResume;

  useEffect(() => {
    if (autoPicked.current) return;
    if (handoffParsed) {
      setResumeMode("saved");
      autoPicked.current = true;
      return;
    }
    if (latestResume.loading) return;
    if (latestResume.hasResume) setResumeMode("saved");
    autoPicked.current = true;
  }, [latestResume.loading, latestResume.hasResume, handoffParsed]);

  // 简历就绪:用已有简历 → 有解析结果;换一份 → 有 ≥20 字原始文本(解析延后做)
  const resumeReady =
    resumeMode === "saved" ? !!savedParsed : resumeText.trim().length >= 20;

  const savedName = savedParsed?.basic?.name?.trim();
  const savedWhere = handoffParsed
    ? "来自简历优化"
    : latestResume.source === "db"
      ? "账号最新"
      : "本地";
  const savedSummary = hasSaved
    ? savedName
      ? `已有简历(${savedName} · ${savedWhere})`
      : `已有简历(${savedWhere})`
    : null;

  const jdReady = jd.trim().length >= 30;
  const canAnalyze =
    resumeReady &&
    (role.trim().length > 0 || jdReady) &&
    timeTier !== null &&
    !busy &&
    !uploadBusy;

  /** 拿到结构化简历:已有简历直接用;换一份 → 缓存命中则复用,否则现解析一次 */
  async function resolveParsedResume(): Promise<ParsedResume> {
    if (resumeMode === "saved") return savedParsed;
    if (parsedCache) return parsedCache;
    setPhase("正在读你的简历…");
    const res = await fetch("/api/m3/parse-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resumeText: resumeText.trim() }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `简历解析失败 HTTP ${res.status}`);
    }
    const parsed = (await res.json()) as ParsedResume;
    setParsedCache(parsed);
    try {
      window.localStorage.setItem(
        STORAGE_KEYS.PARSED_RESUME,
        JSON.stringify(parsed),
      );
    } catch {
      /* ignore */
    }
    return parsed;
  }

  // —— ① 分析差距 ——
  async function handleAnalyze() {
    if (!resumeReady) {
      setError("请先提供简历(用已有简历,或粘贴 / 上传一份)");
      return;
    }
    if (role.trim().length === 0 && !jdReady) {
      setError("请填目标岗位名,或粘贴一段目标 JD(≥ 30 字)");
      return;
    }
    if (!timeTier) {
      setError("请选一个可准备时间档");
      return;
    }
    setBusy(true);
    setError(null);
    const roleStr = role.trim();
    try {
      const parsedResume = await resolveParsedResume();
      setPhase("正在把你的简历和岗位逐条对照,找出真实差距…(约 15-30 秒)");
      const body = jdReady
        ? { mode: "full", jdText: jd.trim(), parsedResume }
        : { mode: "role", roleName: roleStr, parsedResume };
      const res = await fetch("/api/m4/analyze-gaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `差距分析失败 HTTP ${res.status}`);
      }
      const rep = (await res.json()) as GapReport;
      setReport(rep);
      // 默认勾选所有缺口
      setPicked(new Set(rep.gaps.map((g) => g.jd_requirement)));
      // 把 JD 落到跨模块总线(供 M5 等继承)
      if (jdReady) {
        onJdParsed({
          gaps: rep.gaps.map((g) => ({
            jd_requirement: g.jd_requirement,
            why_gap: g.why_matters,
          })),
          raw_jd_text: jd.trim(),
          role_name: roleStr || undefined,
        });
      }
      setStep("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败,请重试");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  // —— ② 生成方案 ——
  async function handleRecommend() {
    if (!report || !timeTier) return;
    const selected = report.gaps.filter((g) => picked.has(g.jd_requirement));
    if (selected.length === 0) {
      setError("至少勾一个要攻的缺口");
      return;
    }
    setBusy(true);
    setError(null);
    setPhase(
      report.bridge_fit === "hands_on"
        ? "这类岗位靠真实实验/实习,正在设计可迁移的数字证据建议…(约 20-40 秒)"
        : timeTier === "sprint"
          ? "正在设计快速补能方案…(约 20-40 秒)"
          : "正在设计补强项目…(约 20-40 秒)",
    );
    try {
      // 此时简历已解析过(分析差距时):saved 用账号简历,new 命中 parsedCache
      const parsedResume =
        resumeMode === "saved" ? savedParsed : parsedCache;
      const res = await fetch("/api/m4/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeTier,
          gaps: selected,
          targetRole: role.trim() || undefined,
          parsedResumeBrief: summarizeResume(parsedResume),
          bridgeFit: report.bridge_fit,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `方案生成失败 HTTP ${res.status}`);
      }
      const data = (await res.json()) as {
        cards?: M4ProjectDraft[];
        projects?: M4ProjectDraft[];
      };
      const drafts = data.cards ?? data.projects ?? [];
      if (drafts.length === 0) throw new Error("没生成出有效方案,请重试");
      // 把本次实际所用简历 + JD 快照交给卡片,采纳时用它种入,绝不串成别份
      const sourceJd =
        jd.trim().length > 0
          ? { raw_jd_text: jd.trim(), role_name: role.trim() || undefined }
          : role.trim()
            ? { role_name: role.trim() }
            : null;
      onGenerated(drafts, timeTier, parsedResume ?? null, sourceJd);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败,请重试");
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  // ============ 第 ② 步:差距报告 ============
  if (step === "report" && report) {
    return (
      <GapReportView
        report={report}
        picked={picked}
        onTogglePick={(req) =>
          setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(req)) next.delete(req);
            else next.add(req);
            return next;
          })
        }
        timeTier={timeTier!}
        busy={busy}
        phase={phase}
        error={error}
        onBack={() => {
          setStep("form");
          setError(null);
        }}
        onRecommend={handleRecommend}
      />
    );
  }

  // ============ 第 ① 步:录入表单 ============
  return (
    <Card className="p-6 border-2 border-border bg-card">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div className="flex-1 min-w-[280px]">
          <p className="font-display italic text-xs text-esther-blue mb-1">
            Step 1 / 2 · 填信息,确认后再分析
          </p>
          <h2 className="text-xl font-bold text-ink mb-1">
            {hasProjects ? "再补一个" : "告诉我你的简历、目标岗位和可准备时间"}
          </h2>
          <p className="text-xs text-ink-soft leading-relaxed">
            填了目标 JD 差距分析更精准;只填岗位名也能基于你的简历推断 ·
            时间档决定方案深度(冲刺=快速补概念,标准/深耕=做项目)
          </p>
        </div>
        {hasProjects && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-ink-muted hover:text-ink transition-colors"
          >
            收起
          </button>
        )}
      </div>

      {/* 01 简历 */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <span className="font-display italic text-xl font-bold text-esther-blue">
            01
          </span>
          <h3 className="text-base font-semibold text-ink">
            简历 <span className="text-esther-red">*</span>
          </h3>
        </div>

        {savedSummary && (
          <div className="pl-9 mb-3 flex gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setResumeMode("saved")}
              className={`px-4 py-2.5 rounded-xl border-2 text-left transition-colors ${
                resumeMode === "saved"
                  ? "border-esther-blue bg-esther-blue/5"
                  : "border-border bg-card hover:border-esther-blue/50"
              }`}
            >
              <p className="text-sm font-medium text-ink">
                {resumeMode === "saved" ? "✓ " : ""}用我已有简历
              </p>
              <p className="text-[11px] text-ink-soft">{savedSummary}</p>
            </button>
            <button
              type="button"
              onClick={() => setResumeMode("new")}
              className={`px-4 py-2.5 rounded-xl border-2 text-left transition-colors ${
                resumeMode === "new"
                  ? "border-esther-blue bg-esther-blue/5"
                  : "border-border bg-card hover:border-esther-blue/50"
              }`}
            >
              <p className="text-sm font-medium text-ink">
                {resumeMode === "new" ? "✓ " : ""}换一份简历
              </p>
              <p className="text-[11px] text-ink-soft">重新上传 / 粘贴</p>
            </button>
          </div>
        )}

        {resumeMode === "new" && (
          <div className="pl-9 space-y-2">
            <div className="inline-flex p-0.5 rounded-full bg-warm-bg-deep/40 border border-border">
              {(
                [
                  ["paste", "✍️ 粘贴文字"],
                  ["file", "📎 上传 PDF / Word"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setResumeTab(id)}
                  className={`px-3.5 py-1.5 text-xs rounded-full transition-colors ${
                    resumeTab === id
                      ? "bg-esther-blue text-white"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {resumeTab === "paste" ? (
              <div>
                <textarea
                  value={resumeText}
                  onChange={(e) => {
                    setResumeText(e.target.value);
                    setParsedCache(null); // 文本变了,解析缓存失效
                  }}
                  placeholder="直接粘贴简历全文(姓名 / 教育 / 实习 / 项目 / 技能…)— 贴完直接点下面「分析差距」即可,不用单独解析"
                  className="w-full min-h-[160px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
                />
                <p className="text-[11px] text-ink-muted mt-1">
                  字数:{resumeText.trim().length} · 推荐 800-3000 字
                  {resumeText.trim().length > 0 && resumeText.trim().length < 20
                    ? " · 再多写点才能开始"
                    : ""}
                </p>
              </div>
            ) : (
              <label className="block">
                <div className="border-2 border-dashed border-border rounded-xl p-5 text-center hover:border-esther-blue transition-colors cursor-pointer bg-card/60">
                  {uploadBusy ? (
                    <p className="text-sm text-ink">📖 浏览器本地提取中…</p>
                  ) : uploadedFileName ? (
                    <p className="text-sm text-ink">
                      📎 {uploadedFileName}
                      <span className="block text-xs text-ink-soft mt-0.5">
                        已提取 {resumeText.trim().length} 字 · 点击重新选择 · 直接点「分析差距」即可
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
                    accept=".pdf,.docx,.md,.txt"
                    onChange={handleFilePick}
                    disabled={uploadBusy}
                    className="hidden"
                  />
                </div>
              </label>
            )}
            {uploadError && (
              <p className="text-xs text-esther-red">⚠️ {uploadError}</p>
            )}
          </div>
        )}
      </div>

      {/* 02 目标岗位 + JD */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <span className="font-display italic text-xl font-bold text-esther-blue">
            02
          </span>
          <h3 className="text-base font-semibold text-ink">
            目标岗位 <span className="text-esther-red">*</span>
          </h3>
          {srcLabel === "m3" && (
            <Badge className="bg-esther-blue/15 text-esther-blue hover:bg-esther-blue/15 text-[11px] font-normal px-2 py-0.5">
              来自 M3 的目标岗位
            </Badge>
          )}
          {srcLabel === "m1" && (
            <Badge className="bg-esther-yellow/30 text-ink hover:bg-esther-yellow/30 text-[11px] font-normal px-2 py-0.5">
              来自 M1 测评推荐
            </Badge>
          )}
        </div>
        <div className="pl-9 space-y-3">
          <input
            type="text"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              if (srcLabel) setSrcLabel(null);
            }}
            placeholder="目标岗位名,如:AI 产品经理(实习)"
            className="w-full px-4 py-2.5 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue"
          />
          <div>
            <textarea
              value={jd}
              onChange={(e) => {
                setJd(e.target.value);
                if (srcLabel) setSrcLabel(null);
              }}
              placeholder="(可选,推荐)粘贴目标 JD 全文 — 填了差距分析更精准,只填岗位名也能跑"
              className="w-full min-h-[120px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
            />
            <p className="text-[11px] text-ink-muted mt-1">
              {jd.trim().length === 0
                ? "没填 JD → 基于岗位名 + 你的简历做通用差距分析"
                : jdReady
                  ? "✓ 会按这段 JD 逐条拆解你的差距"
                  : `还差 ${30 - jd.trim().length} 字才会按 JD 精准拆解(也可只靠岗位名)`}
            </p>
          </div>
        </div>
      </div>

      {/* 03 可准备时间 */}
      <div className="mb-6">
        <div className="flex items-baseline gap-3 mb-2 flex-wrap">
          <span className="font-display italic text-xl font-bold text-esther-blue">
            03
          </span>
          <h3 className="text-base font-semibold text-ink">
            可准备时间 <span className="text-esther-red">*</span>
          </h3>
        </div>
        <p className="text-xs text-ink-soft mb-3 pl-9">
          时间决定方案深度 —— 时间紧就先快速补概念,时间够才做项目
        </p>
        <div className="pl-9 grid grid-cols-1 md:grid-cols-3 gap-3">
          {(Object.keys(TIME_TIERS) as TimeTier[]).map((t) => {
            const spec = TIME_TIERS[t];
            const active = timeTier === t;
            const desc =
              t === "sprint"
                ? "看书/视频快速补概念 + 一个轻量产出"
                : t === "standard"
                  ? "按天拆的 end-to-end 小项目"
                  : "按周拆、带迭代的深项目";
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTimeTier(t)}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  active
                    ? "border-esther-blue bg-esther-blue/5"
                    : "border-border bg-card hover:border-esther-blue/50"
                }`}
              >
                <p className="text-sm font-medium text-ink mb-0.5">
                  {active ? "✓ " : ""}
                  {spec.emoji} {spec.label}
                </p>
                <p className="text-[11px] text-esther-blue mb-1">{spec.daysHint}</p>
                <p className="text-[11px] text-ink-soft leading-relaxed">{desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
          ⚠️ {error}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!canAnalyze}
          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
        >
          {busy ? phase || "分析中…" : "✦ 分析差距 →"}
        </button>
        {!busy && !resumeReady && (
          <span className="text-xs text-ink-muted">先给一份简历才能开始</span>
        )}
        {!busy && resumeReady && timeTier === null && (
          <span className="text-xs text-ink-muted">还差:选一个可准备时间档</span>
        )}
      </div>
    </Card>
  );
}

/** ============================================================
 * GapReportView — 第 ② 步:展示打分差距报告 + 勾选要攻哪几条
 * ============================================================ */
function GapReportView({
  report,
  picked,
  onTogglePick,
  timeTier,
  busy,
  phase,
  error,
  onBack,
  onRecommend,
}: {
  report: GapReport;
  picked: Set<string>;
  onTogglePick: (req: string) => void;
  timeTier: TimeTier;
  busy: boolean;
  phase: string;
  error: string | null;
  onBack: () => void;
  onRecommend: () => void;
}) {
  const tier = TIME_TIERS[timeTier];
  const pickedCount = report.gaps.filter((g) => picked.has(g.jd_requirement)).length;
  return (
    <Card className="p-6 border-2 border-border bg-card">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex-1 min-w-[280px]">
          <p className="font-display italic text-xs text-esther-blue mb-1">
            Step 2 / 2 · 这是你和岗位的真实差距
          </p>
          <h2 className="text-xl font-bold text-ink mb-1">
            整体匹配度 {report.overall_fit}/5 · {tier.emoji} {tier.label}档({tier.daysHint})
          </h2>
          <p className="text-sm text-ink-soft leading-relaxed">{report.summary}</p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-ink-muted hover:text-ink transition-colors"
        >
          ← 改信息
        </button>
      </div>

      {/* 岗位适配度兜底横幅 —— 诚实告诉用户这岗位适不适合"独立项目"补强 */}
      {report.bridge_fit === "digital" && (
        <div className="mb-5 rounded-lg border border-esther-yellow/50 bg-esther-yellow/10 px-3 py-2.5 text-xs text-ink leading-relaxed">
          ⚠️ 这个岗位不在内置项目原型库内,下面是基于通用经验的建议,<b>可靠性中等</b> —— 请结合自己判断是否贴合,不必照单全收。
        </div>
      )}
      {report.bridge_fit === "hands_on" && (
        <div className="mb-5 rounded-lg border border-esther-red/40 bg-esther-red/5 px-3 py-2.5 text-xs text-ink leading-relaxed">
          🧪 这类岗位的硬证据来自<b>真实实验室 / 实习 / 现场</b>,一个人在家做不出能替代的"项目"。
          <br />
          所以下面不硬塞项目,而是给你<b>可迁移的"数字证据"</b>(数据分析 / 计算模拟 / 文献综述等)来加分;真·实操经验请走实验室 / 实习争取。
        </div>
      )}

      {/* 已具备 */}
      {report.matched.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] text-ink-muted mb-2 font-display italic uppercase tracking-wider">
            ✅ 已具备(不用补)
          </p>
          <div className="flex flex-wrap gap-2">
            {report.matched.map((m, i) => (
              <span
                key={i}
                title={m.resume_evidence}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/30 text-xs text-ink"
              >
                {m.jd_requirement}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 缺口列表 + 勾选 */}
      <p className="text-[11px] text-ink-muted mb-2 font-display italic uppercase tracking-wider">
        🔧 待补缺口 · 勾选这次要攻的(已默认全选)
      </p>
      <div className="space-y-2 mb-5">
        {report.gaps.map((g, i) => {
          const on = picked.has(g.jd_requirement);
          const fixable = g.fixable_in?.[timeTier];
          return (
            <label
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                on ? "border-esther-blue/50 bg-esther-blue/5" : "border-border bg-card"
              }`}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onTogglePick(g.jd_requirement)}
                className="w-5 h-5 mt-0.5 accent-esther-blue flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-sm font-medium text-ink">
                    {g.jd_requirement}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      g.current_coverage === "none"
                        ? "bg-esther-red/10 border-esther-red/30 text-esther-red"
                        : "bg-esther-yellow/20 border-esther-yellow/40 text-ink"
                    }`}
                  >
                    {COVERAGE_LABEL[g.current_coverage]}
                  </span>
                  <span className="text-[10px] text-ink-muted">影响 {g.impact}/5</span>
                  {!fixable && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warm-bg-deep border border-border text-ink-muted">
                      {tier.label}档内难补
                    </span>
                  )}
                </div>
                <p className="text-xs text-ink-soft leading-relaxed">{g.why_matters}</p>
                {g.evidence && (
                  <p className="text-[11px] text-ink-muted mt-0.5">依据:{g.evidence}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
          ⚠️ {error}
        </div>
      )}

      <button
        type="button"
        onClick={onRecommend}
        disabled={busy || pickedCount === 0}
        className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
      >
        {busy
          ? phase || "生成中…"
          : report.bridge_fit === "hands_on"
            ? `✦ 生成可迁移证据建议(${pickedCount} 个缺口)`
            : timeTier === "sprint"
              ? `✦ 生成快速补能方案(${pickedCount} 个缺口)`
              : `✦ 生成补强项目(${pickedCount} 个缺口)`}
      </button>
    </Card>
  );
}

/** ============================================================
 * ProjectTabs — 多张卡时的横向 tab
 * ============================================================ */
function ProjectTabs({
  projects,
  activeId,
  onSelect,
}: {
  projects: M4Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {projects.map((p) => {
        const active = p.id === activeId;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            className={`px-4 py-2 rounded-full border-2 text-xs transition-colors max-w-[260px] truncate ${
              active
                ? "border-esther-blue bg-esther-blue/10 text-esther-blue font-medium"
                : "border-border bg-card text-ink-soft hover:border-esther-blue/50"
            }`}
            title={p.title}
          >
            <span className="mr-1.5">{p.kind === "learning" ? "📚" : "📋"}</span>
            <span className="mr-1.5">{STATUS_LABEL[p.status].slice(0, 2)}</span>
            {p.title}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 资源搜索链接 —— 不信任 LLM 现编的 url(URL 幻觉,常 404/跳错),
 * 改用标题+类型拼一个必定可达的搜索链接,直接落到这个资源的搜索结果。
 *   书→豆瓣读书搜  视频→B站搜  文档→Bing 搜
 */
function resourceSearchUrl(r: M4Resource): string {
  const q = encodeURIComponent(r.title.trim());
  switch (r.type) {
    case "video":
      return `https://search.bilibili.com/all?keyword=${q}`;
    case "book":
      return `https://search.douban.com/book/subject_search?search_text=${q}`;
    default:
      return `https://www.bing.com/search?q=${q}`;
  }
}

/** —— 共享:资源列表 —— */
function ResourceList({ resources }: { resources: M4Resource[] }) {
  const icon = { book: "📖", video: "🎬", doc: "📄" } as const;
  return (
    <ul className="space-y-2">
      {resources.map((r, i) => (
        <li key={i} className="text-sm leading-snug">
          <span className="mr-1.5">{icon[r.type]}</span>
          {r.title.trim() ? (
            <a
              href={resourceSearchUrl(r)}
              target="_blank"
              rel="noreferrer"
              className="text-esther-blue hover:underline font-medium"
              title="搜索这个资源"
            >
              {r.title}
              <span className="ml-1 text-[10px] text-ink-muted">🔍</span>
            </a>
          ) : (
            <span className="text-ink font-medium">{r.title}</span>
          )}
          {r.lang === "en" && (
            <span className="ml-1 text-[10px] text-ink-muted">EN</span>
          )}
          {r.note && (
            <span className="block text-xs text-ink-soft mt-0.5 ml-6">{r.note}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** —— 共享:状态推进 + 送进简历 + 删除 —— */
function StatusActions({
  project,
  nextLabel,
  onAdvance,
  onAdopt,
  onDelete,
}: {
  project: M4Project;
  nextLabel: string | null;
  onAdvance: () => void;
  onAdopt: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="mt-5 flex items-center gap-3 flex-wrap">
      {nextLabel && (
        <button
          type="button"
          onClick={onAdvance}
          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
        >
          {nextLabel}
        </button>
      )}
      {project.status === "DONE" && project.committable && (
        <button
          type="button"
          onClick={onAdopt}
          className="inline-flex items-center gap-1 rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
        >
          ✓ 送进简历优化 →
        </button>
      )}
      {project.status === "DONE" && !project.committable && (
        <span className="text-xs text-ink-muted">
          ⚠️ 请在「笔记」里写下 ≥ 10 字的实际成果,才允许送进简历
        </span>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="ml-auto text-xs text-ink-muted hover:text-esther-red transition-colors"
      >
        删除
      </button>
    </div>
  );
}

/** —— 共享:笔记卡 —— */
function NotesCard({
  project,
  onNotesChange,
}: {
  project: M4Project;
  onNotesChange: (notes: string) => void;
}) {
  const learning = project.kind === "learning";
  return (
    <Card className="p-5 border-2 border-border">
      <p className="font-display italic text-xs text-esther-blue mb-2">Notes</p>
      <h3 className="text-base font-semibold text-ink mb-1">
        📝 {learning ? "学习笔记" : "项目笔记"}
      </h3>
      <p className="text-xs text-ink-muted mb-3 leading-relaxed">
        {learning
          ? "学完后记一笔:你真正搞懂了什么、做出了什么产出 —— 一页概念总结、一条科普帖、笔记链接都行。"
          : "记下你实际做过的事:访谈了几人、Dashboard 链接、报告产出、卡点等。"}
      </p>
      <textarea
        value={project.notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder={
          learning
            ? "例:看完前 3 章,整理了一页 A/B 测试核心概念总结,发在知乎(附链接)…"
            : "例:已访谈 5 人(Day 5-7),收集 12 条产品意见;Dashboard 已搭好但还在调指标…"
        }
        className="w-full min-h-[120px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
      />
      <div className="mt-2 flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-ink-muted">
          当前字数:{project.notes.trim().length}
          {project.notes.trim().length >= 10 ? " ✓" : " · 至少 10 字"}
        </p>
        <p className="text-[11px] text-ink-muted">
          {learning
            ? "填够 10 字并标「学完」后,可送进简历"
            : "标 DONE 并填够 10 字后,可送进简历池"}
        </p>
      </div>
    </Card>
  );
}

/** —— 共享:Ask AI —— */
function AskAiCard({ project }: { project: M4Project }) {
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  async function handleAsk() {
    const q = askQuestion.trim();
    if (!q) return;
    setAskLoading(true);
    setAskError(null);
    setAskAnswer(null);
    try {
      const res = await fetch("/api/m4/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, question: q, userNotes: project.notes }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { answer: string };
      setAskAnswer(j.answer);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "AI 调用失败");
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <Card className="p-5 border-2 border-esther-yellow bg-esther-yellow/10">
      <p className="text-sm font-semibold text-ink mb-2">💬 Ask AI · 卡住了就问</p>
      <p className="text-xs text-ink-soft mb-3 leading-relaxed">
        AI 会基于这张卡的上下文回答 · 不会假设你已经完成任何事
      </p>
      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={askQuestion}
          onChange={(e) => setAskQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !askLoading) handleAsk();
          }}
          placeholder="例:这个概念没看懂,能举个具体例子吗?"
          className="flex-1 px-4 py-2.5 rounded-full border border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue"
        />
        <button
          type="button"
          onClick={handleAsk}
          disabled={askLoading || !askQuestion.trim()}
          className="px-5 py-2.5 rounded-full bg-esther-blue text-white text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
        >
          {askLoading ? "思考中…" : "问"}
        </button>
      </div>
      {askError && (
        <div className="rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
          ⚠️ {askError}
        </div>
      )}
      {askAnswer && (
        <div className="mt-3 bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-ink-muted mb-2 font-display italic uppercase tracking-wider">
            AI answer
          </p>
          <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
            {askAnswer}
          </p>
        </div>
      )}
    </Card>
  );
}

/** ============================================================
 * LearningDetail — 学习卡(冲刺档)
 * ============================================================ */
function LearningDetail({
  project,
  onAdvance,
  onNotesChange,
  onDelete,
  onAdopt,
}: {
  project: M4LearningItem;
  onAdvance: () => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onAdopt: () => void;
}) {
  return (
    <div className="space-y-6">
      <Card className="p-6 border-2 border-esther-blue/30 bg-esther-blue/5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-[280px]">
            <p className="font-display italic text-xs text-esther-blue mb-1">
              📚 快速补能(冲刺档)
            </p>
            <h2 className="text-2xl font-bold text-ink mb-2">{project.title}</h2>
            <p className="text-sm text-ink-soft leading-relaxed">{project.why}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-esther-yellow/40 border border-esther-yellow text-ink text-xs font-bold">
              {STATUS_LABEL[project.status]}
            </span>
            {project.est_hours && (
              <span className="text-xs text-ink-muted font-display italic">
                预估投入 {project.est_hours}
              </span>
            )}
          </div>
        </div>

        {project.covers_gaps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[11px] text-ink-muted mb-2 font-display italic uppercase tracking-wider">
              Covers
            </p>
            <div className="flex flex-wrap gap-2">
              {project.covers_gaps.map((g, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2.5 py-1 rounded-full bg-warm-bg-deep border border-border text-xs text-ink"
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}

        <StatusActions
          project={project}
          nextLabel={LEARNING_NEXT_LABEL[project.status]}
          onAdvance={onAdvance}
          onAdopt={onAdopt}
          onDelete={onDelete}
        />
      </Card>

      {/* 核心概念 */}
      {project.concepts.length > 0 && (
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">Concepts</p>
          <h3 className="text-base font-semibold text-ink mb-3">先搞懂这些核心概念</h3>
          <div className="flex flex-wrap gap-2">
            {project.concepts.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center px-3 py-1.5 rounded-lg bg-warm-bg-deep border border-border text-sm text-ink"
              >
                {c}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* 学习资源 */}
      {project.resources.length > 0 && (
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">Resources</p>
          <h3 className="text-base font-semibold text-ink mb-3">看这些(书 / 视频 / 文档)</h3>
          <ResourceList resources={project.resources} />
        </Card>
      )}

      {/* 轻量产出 + 诚实落点 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">
            Micro-deliverable
          </p>
          <h3 className="text-base font-semibold text-ink mb-2">做一个轻量可验证产出</h3>
          <p className="text-sm text-ink leading-relaxed">{project.micro_deliverable}</p>
        </Card>
        <Card className="p-5 border-2 border-esther-yellow/40 bg-esther-yellow/5">
          <p className="font-display italic text-xs text-esther-blue mb-2">诚实落点</p>
          <h3 className="text-base font-semibold text-ink mb-2">能在简历/面试怎么用</h3>
          <p className="text-sm text-ink leading-relaxed">{project.honest_use}</p>
        </Card>
      </div>

      <NotesCard project={project} onNotesChange={onNotesChange} />
      <AskAiCard project={project} />
    </div>
  );
}

/** ============================================================
 * ProjectDetail — 项目卡(标准 / 深耕档)
 * ============================================================ */
function ProjectDetail({
  project,
  onAdvance,
  onToggleTask,
  onNotesChange,
  onDelete,
  onAdopt,
}: {
  project: M4ProjectItem;
  onAdvance: () => void;
  onToggleTask: (taskId: string) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onAdopt: () => void;
}) {
  const totalTasks = useMemo(
    () => project.weekly_plan.reduce((sum, w) => sum + w.tasks.length, 0),
    [project.weekly_plan],
  );
  const doneTasks = useMemo(
    () => Object.values(project.task_progress).filter(Boolean).length,
    [project.task_progress],
  );
  const byWeek = project.plan_unit === "week";

  return (
    <div className="space-y-6">
      {/* 项目头 */}
      <Card className="p-6 border-2 border-esther-blue/30 bg-esther-blue/5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-[280px]">
            <p className="font-display italic text-xs text-esther-blue mb-1">
              📋 补强项目({byWeek ? "深耕" : "标准"}档)
            </p>
            <h2 className="text-2xl font-bold text-ink mb-2">{project.title}</h2>
            <p className="text-sm text-ink-soft leading-relaxed">{project.why}</p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-esther-yellow/40 border border-esther-yellow text-ink text-xs font-bold">
              {STATUS_LABEL[project.status]}
            </span>
            <span className="text-xs text-ink-muted font-display italic">
              {project.weeks} 周{byWeek ? "(按周)" : ""}计划 · {doneTasks}/{totalTasks} 任务完成
            </span>
          </div>
        </div>

        {project.source_gaps.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[11px] text-ink-muted mb-2 font-display italic uppercase tracking-wider">
              Covers
            </p>
            <ul className="space-y-1">
              {project.source_gaps.map((g, i) => (
                <li key={i} className="text-xs text-ink-soft leading-relaxed">
                  · <span className="text-ink">{g.jd_requirement}</span> — {g.why_gap}
                </li>
              ))}
            </ul>
          </div>
        )}

        <StatusActions
          project={project}
          nextLabel={PROJECT_NEXT_LABEL[project.status]}
          onAdvance={onAdvance}
          onAdopt={onAdopt}
          onDelete={onDelete}
        />
      </Card>

      {/* 计划 */}
      <Card className="p-6 border-2 border-border">
        <h3 className="text-lg font-semibold text-ink mb-1">
          📅 {byWeek ? "按周里程碑" : "周计划"}
        </h3>
        <p className="text-xs text-ink-muted mb-4 leading-relaxed">
          勾选任务追踪进度 · 这些是计划骨架,不代表已完成
        </p>
        <div className="space-y-5">
          {project.weekly_plan.map((w) => (
            <div key={w.week}>
              <p className="text-sm font-medium text-esther-blue mb-2">
                Week {w.week} · {w.goal}
              </p>
              <div className="border-2 border-border rounded-lg divide-y divide-border overflow-hidden">
                {w.tasks.map((t) => {
                  const done = !!project.task_progress[t.id];
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-warm-bg-deep/30 transition-colors ${
                        done ? "bg-warm-bg-deep/30" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={done}
                        onChange={() => onToggleTask(t.id)}
                        className="w-5 h-5 accent-esther-blue flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="font-display italic text-xs font-bold text-esther-blue">
                            {t.day}
                          </span>
                          <span className="text-[11px] text-ink-muted ml-auto">
                            {t.hours}
                          </span>
                        </div>
                        <p
                          className={`text-sm leading-snug ${
                            done ? "text-ink-muted line-through" : "text-ink"
                          }`}
                        >
                          {t.task}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Deliverables + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">Deliverables</p>
          <h3 className="text-base font-semibold text-ink mb-3">完成后可拿出来的东西</h3>
          <ul className="space-y-2">
            {project.deliverables.length === 0 ? (
              <li className="text-sm text-ink-muted">(无)</li>
            ) : (
              project.deliverables.map((d, i) => (
                <li key={i} className="text-sm text-ink leading-snug flex gap-2">
                  <span className="text-esther-blue flex-shrink-0">▸</span>
                  <span>{d}</span>
                </li>
              ))
            )}
          </ul>
        </Card>

        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">
            Metrics dictionary
          </p>
          <h3 className="text-base font-semibold text-ink mb-3">要追踪的指标</h3>
          <ul className="space-y-3">
            {project.metrics_dictionary.length === 0 ? (
              <li className="text-sm text-ink-muted">(无)</li>
            ) : (
              project.metrics_dictionary.map((m, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-ink-soft leading-relaxed">{m.definition}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">来源:{m.data_source}</p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {/* Skills required */}
      {project.skills_required.length > 0 && (
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">Skills required</p>
          <div className="flex flex-wrap gap-2">
            {project.skills_required.map((s, i) => (
              <span
                key={i}
                className="inline-flex items-center px-2.5 py-1 rounded-full bg-warm-bg-deep border border-border text-xs text-ink"
              >
                {s}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* 项目内要学的资源 */}
      {project.learning_resources && project.learning_resources.length > 0 && (
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">Learning resources</p>
          <h3 className="text-base font-semibold text-ink mb-3">做这个项目要学/查的</h3>
          <ResourceList resources={project.learning_resources} />
        </Card>
      )}

      {/* 风险自检(Skeptical Recruiter) */}
      {project.risks && project.risks.length > 0 && (
        <Card className="p-5 border-2 border-esther-red/30 bg-esther-red/5">
          <p className="font-display italic text-xs text-esther-red mb-2">
            Risks & Mitigations
          </p>
          <h3 className="text-base font-semibold text-ink mb-3">
            ⚠️ 怀疑你做不完的人会问这些
          </h3>
          <ul className="space-y-3">
            {project.risks.map((r, i) => (
              <li key={i}>
                <p className="text-sm text-ink leading-snug">· {r.risk}</p>
                <p className="text-xs text-ink-soft leading-relaxed mt-0.5 pl-3">
                  → 缓解:{r.mitigation}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <NotesCard project={project} onNotesChange={onNotesChange} />
      <AskAiCard project={project} />
    </div>
  );
}
