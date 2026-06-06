"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";
import { STORAGE_KEYS, useLocalState } from "@/lib/use-local-state";
import { useM4Projects } from "@/lib/useM4Projects";
import type {
  M4Project,
  M4ProjectDraft,
  M4ProjectStatus,
  M4SourceGap,
} from "@/lib/m4-types";

type M1TargetRole = {
  role_type: string;
  industry: string;
  employability_level: "now" | "needs_project" | "long_term";
  saved_at: string;
};

/**
 * 模块 4 · 项目陪练 v2(plan offer-1-sparkling-hippo)
 *
 * 数据流:
 *   entry 读 JD_CONTEXT.gaps + PARSED_RESUME 简历摘要 →
 *   POST /api/m4/generate-projects 生成 2-4 个项目草稿 →
 *   写 M4_PROJECTS localStorage →
 *   用户挑一个进入详情卡 →
 *   状态机 PROPOSED → IN_PROGRESS → DONE →
 *   DONE 才可 committable(进 M3 / 简历回写)
 *
 * Ask AI 真实接 /api/m4/ask,不再是死按钮。
 *
 * 反编造守则:
 *   - committable === true 仅在 status === "DONE" 时为真,M3 看到这个 flag 才认为是"已完成项目"
 *   - 进行中项目不展示"加入简历"按钮
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

const STATUS_NEXT_LABEL: Record<M4ProjectStatus, string | null> = {
  PROPOSED: "开始做这个项目 →",
  IN_PROGRESS: "标记为已完成 →",
  DONE: null,
};

/** 把 ParsedResume 摘成 ≤ 500 字的纯文本,给 LLM 当 brief */
function summarizeResume(pr: ParsedResume): string {
  if (!pr) return "";
  const lines: string[] = [];
  if (pr.basic) {
    const b = pr.basic;
    lines.push(
      `专业:${b.major ?? "未知"} · 年级:${b.year_level ?? "未知"}`,
    );
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

function draftToProject(draft: M4ProjectDraft): M4Project {
  return {
    ...draft,
    id: makeId("m4p"),
    generated_at: new Date().toISOString(),
    status: "PROPOSED",
    started_at: null,
    done_at: null,
    notes: "",
    task_progress: {},
    committable: false,
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
  const fromM1 = sp.get("from") === "m1";

  const [jdContext] = useLocalState<JdContext | null>(
    STORAGE_KEYS.JD_CONTEXT,
    null,
  );
  const [parsedResume] = useLocalState<ParsedResume>(
    STORAGE_KEYS.PARSED_RESUME,
    null,
  );
  const [projects, setProjects] = useM4Projects();

  // M1→M4 直通：读取 m1_target_role
  const [m1TargetRole, setM1TargetRole] = useState<M1TargetRole | null>(null);
  useEffect(() => {
    if (!fromM1) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M1_TARGET_ROLE);
      if (raw) setM1TargetRole(JSON.parse(raw) as M1TargetRole);
    } catch { /* ignore */ }
  }, [fromM1]);

  // M1→M4 生成状态
  const [m1Generating, setM1Generating] = useState(false);
  const [m1GenError, setM1GenError] = useState<string | null>(null);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // 默认选中第一个项目
  useEffect(() => {
    if (!activeId && projects.length > 0) {
      setActiveId(projects[0].id);
    }
  }, [activeId, projects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  const gaps = useMemo(() => jdContext?.gaps ?? [], [jdContext]);
  const targetRole = jdContext?.role_name ?? null;
  const targetCompany = jdContext?.company ?? null;
  const jdSummary = jdContext?.jd_summary ?? null;

  // M1→M4：读 evidence 摘要
  const m1Evidence = useMemo(() => {
    if (!fromM1) return null;
    try {
      const raw = window.localStorage.getItem("riasec_result");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed?.evidence ?? null;
    } catch { return null; }
  }, [fromM1]);

  // M1→M4：生成项目
  const handleGenerateFromRole = useCallback(async () => {
    if (!m1TargetRole) return;
    setM1Generating(true);
    setM1GenError(null);
    try {
      const res = await fetch("/api/m4/generate-from-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetRole: m1TargetRole.role_type,
          targetIndustry: m1TargetRole.industry,
          evidenceSummary: m1Evidence?.summary ?? null,
          evidenceTags: m1Evidence?.tags ?? null,
          n: 2,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { gaps: M4SourceGap[]; projects: M4ProjectDraft[] };
      const newProjects = data.projects.map(draftToProject);
      setProjects((prev) => [...newProjects, ...prev]);
      setActiveId(newProjects[0]?.id ?? null);
    } catch (err) {
      setM1GenError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setM1Generating(false);
    }
  }, [m1TargetRole, m1Evidence, setProjects]);

  const handleGenerate = useCallback(async () => {
    if (gaps.length === 0) {
      setGenError("请先去 M3 解析 JD,拿到 gaps 才能生成对应项目");
      return;
    }
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/m4/generate-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gaps,
          targetRole,
          targetCompany,
          jdSummary,
          parsedResumeBrief: summarizeResume(parsedResume),
          n: 3,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { projects: M4ProjectDraft[] };
      const newProjects = data.projects.map(draftToProject);
      setProjects((prev) => [...newProjects, ...prev]);
      setActiveId(newProjects[0]?.id ?? null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "生成失败";
      setGenError(msg);
    } finally {
      setGenerating(false);
    }
  }, [gaps, targetRole, targetCompany, jdSummary, parsedResume, setProjects]);

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
          // 反编造守则:committable 仅在 DONE 且有用户笔记时为 true
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
        task_progress: {
          ...p.task_progress,
          [taskId]: !p.task_progress[taskId],
        },
      }));
    },
    [updateProject],
  );

  const handleNotesChange = useCallback(
    (id: string, notes: string) => {
      updateProject(id, (p) => ({
        ...p,
        notes,
        // 笔记>10字 + DONE 才能 committable
        committable: p.status === "DONE" && notes.trim().length > 10,
      }));
    },
    [updateProject],
  );

  const handleDelete = useCallback(
    (id: string) => {
      if (!confirm("删除这个项目?(已记的笔记会一并删除)")) return;
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
                  补一段能写进简历的项目
                </h1>
                <p className="text-ink-soft text-sm">
                  根据目标岗位和你的简历，设计 2-4 周可交付的补强项目 ·
                  做完再加进简历，绝不把"提案"包装成"已完成"
                </p>
              </div>
            </section>

            {/* from M1：直通入口卡 */}
            {fromM1 && m1TargetRole && (
              <section className="border-b border-border bg-esther-blue/5">
                <div className="max-w-[1100px] mx-auto px-6 py-8">
                  <p className="font-display italic text-xs text-esther-blue mb-2">
                    来自 M1 测评推荐
                  </p>
                  <h2 className="text-xl font-bold text-ink mb-1">
                    为「{m1TargetRole.role_type}」制定补经历计划
                  </h2>
                  <p className="text-sm text-ink-soft mb-5">
                    AI 会分析这个方向通常需要什么经历，结合你的简历找出缺口，然后设计 2 个 2-4 周可完成的项目。
                  </p>
                  {m1GenError && (
                    <p className="text-sm text-esther-red mb-4">⚠️ {m1GenError}</p>
                  )}
                  <button
                    type="button"
                    onClick={handleGenerateFromRole}
                    disabled={m1Generating}
                    className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-6 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
                  >
                    {m1Generating ? "AI 正在分析缺口并设计项目…（约 20-40 秒）" : "✦ 生成补经历计划"}
                  </button>
                </div>
              </section>
            )}

            {/* gap → 生成项目 状态卡（M3 流程，from M1 时隐藏）*/}
            {!fromM1 && (
              <section className="border-b border-border bg-warm-bg-deep/30">
                <div className="max-w-[1100px] mx-auto px-6 py-8">
                  <GapStatusCard
                    gaps={gaps}
                    targetRole={targetRole}
                    hasProjects={projects.length > 0}
                    generating={generating}
                    onGenerate={handleGenerate}
                    error={genError}
                  />
                </div>
              </section>
            )}

            {/* 项目列表 + 当前项目详情 */}
            {projects.length > 0 && (
              <div className="max-w-[1100px] mx-auto px-6 py-10 space-y-6">
                <ProjectTabs
                  projects={projects}
                  activeId={activeId}
                  onSelect={setActiveId}
                />
                {activeProject ? (
                  <ProjectDetail
                    project={activeProject}
                    onAdvance={() => handleAdvanceStatus(activeProject.id)}
                    onToggleTask={(taskId) =>
                      handleToggleTask(activeProject.id, taskId)
                    }
                    onNotesChange={(n) =>
                      handleNotesChange(activeProject.id, n)
                    }
                    onDelete={() => handleDelete(activeProject.id)}
                  />
                ) : (
                  <p className="text-sm text-ink-soft text-center py-10">
                    请从上方选一个项目展开
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
 * GapStatusCard — 顶部状态:有没有 gap / 要不要生成 / 错误提示
 * ============================================================ */
function GapStatusCard({
  gaps,
  targetRole,
  hasProjects,
  generating,
  onGenerate,
  error,
}: {
  gaps: M4SourceGap[];
  targetRole: string | null;
  hasProjects: boolean;
  generating: boolean;
  onGenerate: () => void;
  error: string | null;
}) {
  if (gaps.length === 0 && !hasProjects) {
    return (
      <Card className="p-6 border-2 border-esther-yellow/40 bg-esther-yellow/10">
        <p className="text-base font-semibold text-ink mb-2">
          🔎 还没有 JD gap 输入
        </p>
        <p className="text-sm text-ink-soft leading-relaxed mb-4">
          M4 项目陪练基于 M3 拆解出的 JD 缺口生成补强项目。
          请先去 M3 上传简历 + 粘贴目标 JD,拿到 gaps 后再回来。
        </p>
        <Link
          href="/m3"
          className="inline-flex items-center gap-1 text-sm font-medium text-esther-blue hover:underline"
        >
          去 M3 简历优化 →
        </Link>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-2 border-border bg-card">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex-1 min-w-[280px]">
          <p className="font-display italic text-xs text-esther-blue mb-1">
            From M3 · JD gaps
          </p>
          <h2 className="text-xl font-bold text-ink mb-1">
            🎯 {targetRole ? `${targetRole} — ` : ""}识别出 {gaps.length} 条 gap
          </h2>
          <p className="text-xs text-ink-soft">
            基于这些 gap 生成 2-4 周可独立完成的项目 · 不编造现有能力
          </p>
        </div>
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating || gaps.length === 0}
          className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors disabled:bg-ink-muted disabled:cursor-not-allowed"
        >
          {generating
            ? "AI 正在设计项目…(约 20-40 秒)"
            : hasProjects
              ? "+ 再生成一批"
              : "✦ 生成 3 个补强项目"}
        </button>
      </div>

      {gaps.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2">
          {gaps.slice(0, 6).map((g, i) => (
            <div
              key={i}
              className="text-xs text-ink-soft bg-warm-bg-deep/40 border border-border rounded-md px-3 py-2 leading-relaxed"
            >
              <span className="font-medium text-ink">
                {i + 1}. {g.jd_requirement}
              </span>
              <span className="text-ink-muted"> — {g.why_gap}</span>
            </div>
          ))}
          {gaps.length > 6 && (
            <p className="text-[11px] text-ink-muted col-span-full">
              还有 {gaps.length - 6} 条 gap…
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
          ⚠️ {error}
        </div>
      )}

      <Card className="mt-5 p-4 border-2 border-esther-red/30 bg-esther-red/5">
        <p className="text-xs text-ink leading-relaxed">
          <span className="font-bold text-esther-red">
            ⚠️ 项目没做完之前,不会进简历:
          </span>
          {" "}状态到 DONE 之后,你还得在「项目笔记」里写下实际成果(访谈了几人 / Dashboard 链接 / 报告输出),AI 才会基于真实素材生成 bullet。
        </p>
      </Card>
    </Card>
  );
}

/** ============================================================
 * ProjectTabs — 多个项目时的横向 tab
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
            <span className="mr-1.5">{STATUS_LABEL[p.status].slice(0, 2)}</span>
            {p.title}
          </button>
        );
      })}
    </div>
  );
}

/** ============================================================
 * ProjectDetail — 当前选中项目卡 + Ask AI
 * ============================================================ */
function ProjectDetail({
  project,
  onAdvance,
  onToggleTask,
  onNotesChange,
  onDelete,
}: {
  project: M4Project;
  onAdvance: () => void;
  onToggleTask: (taskId: string) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
}) {
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  const totalTasks = useMemo(
    () => project.weekly_plan.reduce((sum, w) => sum + w.tasks.length, 0),
    [project.weekly_plan],
  );
  const doneTasks = useMemo(
    () => Object.values(project.task_progress).filter(Boolean).length,
    [project.task_progress],
  );

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
        body: JSON.stringify({
          project,
          question: q,
          userNotes: project.notes,
        }),
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

  const nextStatusLabel = STATUS_NEXT_LABEL[project.status];

  return (
    <div className="space-y-6">
      {/* 项目头 */}
      <Card className="p-6 border-2 border-esther-blue/30 bg-esther-blue/5">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-[280px]">
            <p className="font-display italic text-xs text-esther-blue mb-1">
              Current project
            </p>
            <h2 className="text-2xl font-bold text-ink mb-2">{project.title}</h2>
            <p className="text-sm text-ink-soft leading-relaxed">
              {project.why}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="inline-flex items-center px-3 py-1 rounded-full bg-esther-yellow/40 border border-esther-yellow text-ink text-xs font-bold">
              {STATUS_LABEL[project.status]}
            </span>
            <span className="text-xs text-ink-muted font-display italic">
              {project.weeks} 周计划 · {doneTasks}/{totalTasks} 任务完成
            </span>
          </div>
        </div>

        {/* gap → why 关联 */}
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

        <div className="mt-5 flex items-center gap-3 flex-wrap">
          {nextStatusLabel && (
            <button
              type="button"
              onClick={onAdvance}
              className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
            >
              {nextStatusLabel}
            </button>
          )}
          {project.status === "DONE" && project.committable && (
            <Link
              href="/m3"
              className="inline-flex items-center gap-1 text-sm font-medium text-esther-blue hover:underline"
            >
              ✓ 已可送进 M3 简历池 →
            </Link>
          )}
          {project.status === "DONE" && !project.committable && (
            <span className="text-xs text-ink-muted">
              ⚠️ 请在「项目笔记」里写下 ≥ 10 字的实际成果,才允许送进简历
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
      </Card>

      {/* Weekly plan */}
      <Card className="p-6 border-2 border-border">
        <h3 className="text-lg font-semibold text-ink mb-1">📅 周计划</h3>
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
          <p className="font-display italic text-xs text-esther-blue mb-2">
            Deliverables
          </p>
          <h3 className="text-base font-semibold text-ink mb-3">
            完成后可拿出来的东西
          </h3>
          <ul className="space-y-2">
            {project.deliverables.length === 0 ? (
              <li className="text-sm text-ink-muted">(无)</li>
            ) : (
              project.deliverables.map((d, i) => (
                <li
                  key={i}
                  className="text-sm text-ink leading-snug flex gap-2"
                >
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
          <h3 className="text-base font-semibold text-ink mb-3">
            要追踪的指标
          </h3>
          <ul className="space-y-3">
            {project.metrics_dictionary.length === 0 ? (
              <li className="text-sm text-ink-muted">(无)</li>
            ) : (
              project.metrics_dictionary.map((m, i) => (
                <li key={i}>
                  <p className="text-sm font-medium text-ink">{m.name}</p>
                  <p className="text-xs text-ink-soft leading-relaxed">
                    {m.definition}
                  </p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    来源:{m.data_source}
                  </p>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>

      {/* Skills required */}
      {project.skills_required.length > 0 && (
        <Card className="p-5 border-2 border-border">
          <p className="font-display italic text-xs text-esther-blue mb-2">
            Skills required
          </p>
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

      {/* 项目笔记 */}
      <Card className="p-5 border-2 border-border">
        <p className="font-display italic text-xs text-esther-blue mb-2">
          Project notes
        </p>
        <h3 className="text-base font-semibold text-ink mb-1">📝 项目笔记</h3>
        <p className="text-xs text-ink-muted mb-3 leading-relaxed">
          记下实际做过的事(访谈了几人、Dashboard 链接、报告输出、卡点等)。
          只有 DONE 后填了 ≥ 10 字笔记,项目才允许送进 M3 简历池。
        </p>
        <textarea
          value={project.notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="例:已访谈 5 人(Day 5-7),收集 12 条产品意见;Dashboard 已搭好但还在调指标..."
          className="w-full min-h-[120px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
        />
        <p className="text-[11px] text-ink-muted mt-2">
          当前字数:{project.notes.trim().length}
          {project.notes.trim().length >= 10 ? " ✓" : " · 至少 10 字"}
        </p>
      </Card>

      {/* Ask AI */}
      <Card className="p-5 border-2 border-esther-yellow bg-esther-yellow/10">
        <p className="text-sm font-semibold text-ink mb-2">
          💬 Ask AI · 卡住了就问
        </p>
        <p className="text-xs text-ink-soft mb-3 leading-relaxed">
          AI 会基于本项目上下文(目标 / 周计划 / 指标 / 你的笔记)回答 · 不会假设你已经完成任何事
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={askQuestion}
            onChange={(e) => setAskQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !askLoading) handleAsk();
            }}
            placeholder="例:访谈时用户答得很笼统,怎么挖深?"
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
    </div>
  );
}
