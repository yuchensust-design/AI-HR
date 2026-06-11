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
import { createConversation, listConversations } from "@/lib/conversations";
import { useM4Projects, type SaveCloudResult } from "@/lib/useM4Projects";
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
  // 富载荷(R2):测评算出的个性化信号，治「千人一面」
  why_fit?: string;
  match_percentage?: number;
  riasec_code?: string;
  evidence_summary?: string;
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


const COVERAGE_LABEL: Record<ScoredGap["current_coverage"], string> = {
  none: "完全没有",
  partial: "沾边不够",
  have: "已具备",
};

const TIER_ORDER: TimeTier[] = ["sprint", "standard", "deep"];

/**
 * 建议档位:基于差距报告里「核心缺口(impact≥4)」的 fixable_in,算出最小够用的时间档。
 * 返回 { tier, coverable }:tier=能覆盖核心缺口的最小档(全都覆盖不了则 deep);
 * coverable=该档是否真能覆盖全部核心缺口(false → 连深耕档也补不齐,诚实提示)。
 */
function recommendTier(report: GapReport): { tier: TimeTier; coverable: boolean } {
  const core = report.gaps.filter((g) => g.impact >= 4);
  const considered = core.length > 0 ? core : report.gaps;
  if (considered.length === 0) return { tier: "sprint", coverable: true };
  for (const t of TIER_ORDER) {
    if (considered.every((g) => g.fixable_in?.[t])) return { tier: t, coverable: true };
  }
  return { tier: "deep", coverable: false };
}

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

// 改简历常是「按岗位名推断」的 JD(raw_jd_text 为空,但有 jd_summary/must_have)。
// 从某个缺口带进补项目时,用这份推断要求合成一份 JD 一起分析 —— 口径与改简历一致,
// 自然不引入实时搜真岗带来的岗位无关噪声(如 AIDD/CADD)。
function synthesizeJdFromContext(jc: {
  role_name?: string;
  jd_summary?: string;
  must_have?: string[];
  nice_to_have?: string[];
}): string {
  const parts: string[] = [];
  if (jc.role_name) parts.push(`目标岗位：${jc.role_name}`);
  if (jc.jd_summary) parts.push(`岗位概述：${jc.jd_summary}`);
  if (Array.isArray(jc.must_have) && jc.must_have.length > 0)
    parts.push("硬性要求：\n" + jc.must_have.map((s) => `- ${s}`).join("\n"));
  if (Array.isArray(jc.nice_to_have) && jc.nice_to_have.length > 0)
    parts.push("加分项：\n" + jc.nice_to_have.map((s) => `- ${s}`).join("\n"));
  return parts.join("\n\n");
}

function Module4Content() {
  const sp = useSearchParams();
  const router = useRouter();
  const { user, loading: userLoading } = useUser();
  const fromM1 = sp.get("from") === "m1";
  const convId = sp.get("c"); // 当前会话(登录态隔离;游客忽略)
  // 从「改简历」的 JD 关键词缺口点「补项目」进来:fromm3=<m3会话id>(带回那份简历+JD),gap=<缺口关键词>
  const fromM3 = sp.get("fromm3");
  const gapKw = sp.get("gap") ?? "";
  const fromM3Active = !!fromM3 || !!gapKw;

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
  const [projects, setProjects, { loading: projectsLoading, saveToCloud }] =
    useM4Projects(convId);

  // M1→M4 直通:读 m1_target_role(预填表单目标岗位/行业 + 测评个性化信号)
  const [m1TargetRole, setM1TargetRole] = useState<M1TargetRole | null>(null);
  // R3:测评时上传过的简历原文(预填 m4 简历框,省得再传一遍)
  const [m1ResumeSnippet, setM1ResumeSnippet] = useState<string>("");
  useEffect(() => {
    if (!fromM1) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.M1_TARGET_ROLE);
      if (raw) setM1TargetRole(JSON.parse(raw) as M1TargetRole);
      // R3:测评里若上传过简历,把原文片段带到 m4 简历框(标注请确认是否完整/最新)
      const evRaw = window.localStorage.getItem("m1_evidence");
      if (evRaw) {
        const ev = JSON.parse(evRaw) as { source?: string; rawSnippet?: string };
        if (ev?.source === "resume" && ev.rawSnippet?.trim()) {
          setM1ResumeSnippet(ev.rawSnippet.trim());
        }
      }
    } catch {
      /* ignore */
    }
  }, [fromM1]);

  // 从测评带着目标进来 + 已读到目标 = 本次是 handoff 流程(控制 banner / 自动展开 / 隐藏旧卡)
  const handoffActive = fromM1 && !!m1TargetRole;

  // —— 会话编排(仅登录态):保证进 m4 时有一个 convId,实现「一个经历一个会话」——
  //   from=m1  → 永远开一个新空会话(进去是干净表单,不串旧目标的卡)
  //   有历史会话 → 跳到最近一个(老用户的卡都在里面,不丢)
  //   无任何会话 → 建第一个
  const convOrchestrated = useRef(false);
  useEffect(() => {
    if (userLoading) return;
    if (!user) return; // 游客单轨,不做会话编排
    if (convId) return; // 已经在某个会话里
    if (convOrchestrated.current) return;
    convOrchestrated.current = true;
    let cancelled = false;
    (async () => {
      if (fromM1) {
        let title = "补经历";
        try {
          const raw = window.localStorage.getItem(STORAGE_KEYS.M1_TARGET_ROLE);
          const r = raw ? (JSON.parse(raw) as M1TargetRole) : null;
          if (r?.role_type) title = `补:${r.role_type}`.slice(0, 20);
        } catch {
          /* ignore */
        }
        const id = await createConversation("m4", title);
        if (!cancelled && id) router.replace(`/m4?c=${id}&from=m1`);
        return;
      }
      // 从改简历的缺口来:给这个缺口单开一个新会话(不串旧卡),并把 fromm3/gap 带过去
      if (fromM3 || gapKw) {
        const title = (gapKw ? `补:${gapKw}` : "补经历").slice(0, 20);
        const id = await createConversation("m4", title);
        if (!cancelled && id) {
          const qs = new URLSearchParams({ c: id });
          if (fromM3) qs.set("fromm3", fromM3);
          if (gapKw) qs.set("gap", gapKw);
          router.replace(`/m4?${qs.toString()}`);
        }
        return;
      }
      const convs = await listConversations("m4");
      if (cancelled) return;
      if (convs.length > 0) router.replace(`/m4?c=${convs[0].id}`);
      else {
        const id = await createConversation("m4", "补经历 1");
        if (!cancelled && id) router.replace(`/m4?c=${id}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, userLoading, convId, fromM1, fromM3, gapKw, router]);

  // M3→M4:按 ?fromm3=<m3会话id> 读「你在改简历里看的那份」简历+JD,作最高优先预填
  // (修跨模块串简历:登录多会话时不再默认套账号最新那份)
  const [handoff, setHandoff] = useState<{
    parsed: ParsedResume;
    role: string;
    jd: string;
    jdInferred: boolean; // true = 这段 JD 是按岗位名推断合成的(非真实 JD),给前端标注用
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
            jd_summary?: string;
            must_have?: string[];
            nice_to_have?: string[];
          };
          // 有真 JD 用真 JD;改简历常是推断 JD(raw 为空)→ 合成一份,绝不再去搜真岗
          const rawJd = (jc.raw_jd_text ?? "").trim();
          const synth = rawJd || synthesizeJdFromContext(jc);
          setHandoff({
            parsed: (data.parsed_resume_json ?? null) as ParsedResume,
            role: jc.role_name ?? "",
            jd: synth,
            jdInferred: !rawJd && synth.length > 0, // 无真 JD、靠合成 → 标记为推断
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

  // 切换会话:清空选中卡,让 activeProject 重新落到新会话的第一张(防显示上个会话的卡)
  useEffect(() => {
    setActiveId(null);
  }, [convId]);

  useEffect(() => {
    if (!activeId && projects.length > 0) setActiveId(projects[0].id);
  }, [activeId, projects]);

  const isGuest = !userLoading && !user;

  // 从测评带目标进来时自动展开表单。
  //   登录:from=m1 已开新空会话(projects 为空)→ 干净表单,不串旧卡。
  //   游客:单轨无法开新会话 → 也展开,并在下方隐藏旧卡(止血),避免新分析与旧卡并排。
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if ((!handoffActive && !fromM3Active) || projectsLoading || autoOpenedRef.current)
      return;
    if (projects.length === 0 || isGuest) {
      autoOpenedRef.current = true;
      setShowForm(true);
    }
  }, [handoffActive, fromM3Active, projectsLoading, projects.length, isGuest]);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  // 表单预填来源:M3 带过来的(fromm3)> M3 拆解过的目标岗位 > M1 推荐岗位
  const prefillRole =
    handoff?.role || jdContext?.role_name || m1TargetRole?.role_type || "";
  const prefillJd = handoff?.jd || jdContext?.raw_jd_text || "";
  // 这段预填 JD 是否为「按岗位名推断」的(改简历常没传真 JD)→ 前端标注 + 允许切换到真岗
  const prefillJdInferred = !!handoff?.jdInferred;
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
      // 首次 handoff 已落地 → 去掉 from=m1 / fromm3 / gap,后续不再触发横幅/止血
      if (fromM1 || fromM3Active)
        router.replace(convId ? `/m4?c=${convId}` : "/m4");
    },
    [setProjects, fromM1, fromM3Active, convId, router],
  );

  const updateProject = useCallback(
    (id: string, updater: (p: M4Project) => M4Project) => {
      setProjects((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));
    },
    [setProjects],
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
        // 不再要求「先标完成」:写够 10 字实际成果即可送进简历优化
        committable: notes.trim().length > 10,
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
            <ConversationSwitcher module="m4" basePath="/m4" defaultTitle="补经历" />
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
                  先把你和目标岗位的真实差距分析清楚,再按你的可准备时间出方案
                </p>
              </div>
            </section>

            {/* 登录态正在建/选会话(还没 convId)→ 占位,避免空表单闪一下又跳走 */}
            {!!user && !convId ? (
              <section className="border-b border-border bg-warm-bg-deep/30">
                <div className="max-w-[1100px] mx-auto px-6 py-12">
                  <p className="text-sm text-ink-soft text-center">正在准备工作区…</p>
                </div>
              </section>
            ) : (projects.length === 0 || showForm) && (
              <section className="border-b border-border bg-warm-bg-deep/30">
                <div className="max-w-[1100px] mx-auto px-6 py-8">
                  {/* 从测评带来的目标横幅:让用户看见"这次补的是测评推荐的哪个方向" */}
                  {handoffActive && showForm && m1TargetRole && (
                    <div className="mb-6 rounded-xl border-2 border-esther-blue/30 bg-esther-blue/5 px-4 py-3">
                      <p className="text-xs font-semibold text-esther-blue mb-1">
                        从测评带来的目标
                      </p>
                      <p className="text-sm text-ink">
                        <span className="font-bold">{m1TargetRole.role_type}</span>
                        {m1TargetRole.industry ? (
                          <span className="text-ink-soft"> · {m1TargetRole.industry}</span>
                        ) : null}
                        {typeof m1TargetRole.match_percentage === "number" ? (
                          <span className="text-ink-soft"> · 匹配 {m1TargetRole.match_percentage}%</span>
                        ) : null}
                      </p>
                      {m1TargetRole.why_fit ? (
                        <p className="mt-1 text-xs text-ink-soft leading-relaxed">
                          测评判断：{m1TargetRole.why_fit}
                        </p>
                      ) : null}
                      <p className="mt-1.5 text-[11px] text-ink-muted">
                        已为你预填目标岗位{m1ResumeSnippet ? "和测评时上传的简历" : ""}，确认后开始分析差距。
                      </p>
                    </div>
                  )}
                  {/* 从「改简历」的 JD 关键词缺口带来的:让用户看见"这次专门补的是哪个能力" */}
                  {fromM3Active && showForm && (
                    <div className="mb-6 rounded-xl border-2 border-esther-blue/30 bg-esther-blue/5 px-4 py-3">
                      <p className="text-xs font-semibold text-esther-blue mb-1">
                        从改简历带来的缺口
                      </p>
                      <p className="text-sm text-ink">
                        要补强的能力：
                        <span className="font-bold">
                          {gapKw || "目标岗位相关经历"}
                        </span>
                      </p>
                      <p className="mt-1.5 text-[11px] text-ink-muted">
                        已带入你在简历优化里的那份简历和目标岗位，做完一段经历后回到「改简历」即可补进去。
                      </p>
                    </div>
                  )}
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
                      initialResumeText={m1ResumeSnippet}
                      focusGap={gapKw}
                      initialJdInferred={prefillJdInferred}
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

            {/* 止血:从测评带新目标、表单正开着时,隐藏下方旧卡,避免新分析与旧卡并排
                (登录态此时多半是新空会话本就无卡;游客单轨靠这条隐藏) */}
            {projects.length > 0 && !((handoffActive || fromM3Active) && showForm) && (
              <div className="max-w-[1100px] mx-auto px-6 py-10 space-y-6">
                {adoptErr && (
                  <div className="rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
                    ⚠️ {adoptErr}
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
                      onNotesChange={(n) => handleNotesChange(activeProject.id, n)}
                      onDelete={() => handleDelete(activeProject.id)}
                      onAdopt={() => handleAdoptToResume(activeProject)}
                      onSaveCloud={saveToCloud}
                      isGuest={isGuest}
                    />
                  ) : (
                    <ProjectDetail
                      project={activeProject}
                      onToggleTask={(taskId) =>
                        handleToggleTask(activeProject.id, taskId)
                      }
                      onNotesChange={(n) => handleNotesChange(activeProject.id, n)}
                      onDelete={() => handleDelete(activeProject.id)}
                      onAdopt={() => handleAdoptToResume(activeProject)}
                      onSaveCloud={saveToCloud}
                      isGuest={isGuest}
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
  initialResumeText = "",
  focusGap = "",
  initialJdInferred = false,
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
  /** R3:测评时上传过的简历原文片段,预填进粘贴框(用户可确认/补全) */
  initialResumeText?: string;
  /** 从改简历的 JD 关键词缺口点进来时,要重点补强的能力关键词(让差距分析优先覆盖它) */
  focusGap?: string;
  /** 预填的 JD 是否为「按岗位名推断」合成的(非真实 JD)→ 顶部标注 + 允许切换到真岗 */
  initialJdInferred?: boolean;
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
  // 当前 JD 是否为「按岗位名推断」合成的(改简历常没传真 JD);用户一改 JD 就不算推断了
  const [jdInferred, setJdInferred] = useState(initialJdInferred);

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
    if (initialJdInferred) setJdInferred(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialJdInferred]);
  useEffect(() => {
    if (source && srcLabel === null) setSrcLabel(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // —— 没贴真实 JD 时:让 AI 按岗位名生成一份 JD,填进框里给用户看(可编辑)——
  const [jdGenerating, setJdGenerating] = useState(false);
  const [jdGenErr, setJdGenErr] = useState<string | null>(null);

  async function generateJd(roleName: string): Promise<string> {
    const res = await fetch("/api/m4/generate-jd", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleName }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error ?? `生成失败 HTTP ${res.status}`);
    return String(j.jdText ?? "").trim();
  }

  async function handleGenerateJd() {
    const r = role.trim();
    if (!r || jdGenerating) return;
    setJdGenerating(true);
    setJdGenErr(null);
    try {
      const txt = await generateJd(r);
      if (txt) {
        setJd(txt);
        setJdInferred(true); // AI 生成的(非用户粘贴的真实 JD)→ 顶部标注、可编辑
      } else {
        setJdGenErr("没生成出来,请重试");
      }
    } catch (e) {
      setJdGenErr(e instanceof Error ? e.message : "生成失败,请重试");
    } finally {
      setJdGenerating(false);
    }
  }

  // 从 m1/测评等带着岗位名(但没 JD)进来 → 自动生成一份 JD 填进框,让用户看见。
  // 仅对"预填的岗位名"自动生成(initialRole 非空);手动打字的不自动触发,用按钮。
  const autoGenRef = useRef(false);
  useEffect(() => {
    if (autoGenRef.current) return;
    if (!initialRole.trim()) return; // 没有预填岗位名 → 不自动生成
    if (jd.trim().length > 0) {
      autoGenRef.current = true; // 已有 JD(粘贴/m3 带入)→ 不生成
      return;
    }
    if (role.trim().length === 0) return; // 等岗位名落定
    autoGenRef.current = true;
    void handleGenerateJd();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRole, role, jd]);

  // —— 流程状态 ——
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // —— 差距报告 + 勾选 ——
  const [report, setReport] = useState<GapReport | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // 有 handoff(从 M3 带过来的那份)就优先用它作"已有简历",否则用账号最新那份
  // 关键:若账号最新简历带 m3 优化稿(finalMarkdown),把它一并附到对象上,
  // 否则差距分析只看 parsed_resume_json(优化前结构),会和已优化的简历对不上。
  const savedParsed = (() => {
    const base = (handoffParsed ?? latestResume.parsedResume) as unknown;
    if (!handoffParsed && base && latestResume.finalMarkdown) {
      return {
        ...(base as Record<string, unknown>),
        optimized_resume_markdown: latestResume.finalMarkdown,
      } as unknown as ParsedResume;
    }
    return base as ParsedResume;
  })();
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

  // R3:测评时上传过简历 → 预填粘贴框(只在没有账号已存简历时切到「换一份」,不覆盖用户已输入)
  const m1ResumePrefilled = useRef(false);
  const [resumeFromM1, setResumeFromM1] = useState(false);
  useEffect(() => {
    if (m1ResumePrefilled.current) return;
    if (!initialResumeText.trim()) return;
    if (latestResume.loading) return;
    m1ResumePrefilled.current = true;
    if (resumeText.trim() === "") {
      setResumeText(initialResumeText);
      setResumeFromM1(true);
      if (!handoffParsed && !latestResume.hasResume) {
        setResumeMode("new");
        setResumeTab("paste");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialResumeText, latestResume.loading, latestResume.hasResume, handoffParsed]);

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
    const roleStr = role.trim();
    setBusy(true);
    setError(null);
    try {
      const parsedResume = await resolveParsedResume();
      // JD 框是唯一来源:有就用(粘贴的 / AI 生成的 / m3 带入的);
      // 还空但有岗位名 → 现场生成一份(填进框,让用户也看得见),再分析。
      let effectiveJd = jd.trim();
      if (effectiveJd.length < 20) {
        setPhase("正在按岗位名生成一份 JD…");
        try {
          const gen = await generateJd(roleStr);
          if (gen) {
            effectiveJd = gen;
            setJd(gen);
            setJdInferred(true);
          }
        } catch {
          /* 生成失败 → 下面报错提示 */
        }
      }
      if (effectiveJd.length < 20) {
        setBusy(false);
        setPhase("");
        setError("没有可分析的 JD —— 点「生成 JD」或粘贴一段目标 JD 再试");
        return;
      }
      setPhase("正在把你的简历和岗位逐条对照,找出真实差距…(约 15-30 秒)");
      const focus = focusGap.trim();
      const body = {
        mode: "full",
        jdText: effectiveJd,
        parsedResume,
        focusGap: focus,
      };
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
      // JD 落到跨模块总线(供 M5 等继承)
      onJdParsed({
        gaps: rep.gaps.map((g) => ({
          jd_requirement: g.jd_requirement,
          why_gap: g.why_matters,
        })),
        raw_jd_text: effectiveJd,
        role_name: roleStr || undefined,
      });
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
        onChangeTier={(t) => setTimeTier(t)}
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
                {resumeFromM1 && (
                  <p className="text-[11px] text-esther-blue bg-esther-blue/5 border border-esther-blue/20 rounded-lg px-2.5 py-1.5 mb-1.5">
                    📎 已带入你测评时上传的简历，请确认是否完整 / 最新，可直接补全
                  </p>
                )}
                <textarea
                  value={resumeText}
                  onChange={(e) => {
                    setResumeText(e.target.value);
                    setParsedCache(null); // 文本变了,解析缓存失效
                    if (resumeFromM1) setResumeFromM1(false);
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
            {/* JD 框是唯一来源:没贴真实 JD 时,可让 AI 按岗位名生成一份(填进来给你看、可编辑)*/}
            {jdInferred && jd.trim().length > 0 && (
              <div className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  这份 JD 是 <span className="font-semibold">AI 按岗位名「{role || "目标岗位"}」生成的(非真实 JD)</span>,仅作分析参考 —— 可直接编辑,或粘贴真实 JD 覆盖。
                </p>
              </div>
            )}
            <textarea
              value={jd}
              onChange={(e) => {
                setJd(e.target.value);
                setJdInferred(false); // 用户手改 → 当作真实 JD,去掉「AI 生成」标注
                if (srcLabel) setSrcLabel(null);
              }}
              placeholder="粘贴目标 JD 全文;没有的话,填上面的岗位名,点下面「让 AI 生成一份 JD」"
              className="w-full min-h-[120px] px-4 py-3 rounded-xl border-2 border-border bg-card text-sm text-ink placeholder-ink-muted focus:outline-none focus:border-esther-blue resize-y"
            />
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleGenerateJd}
                disabled={jdGenerating || role.trim().length === 0}
                className="inline-flex items-center rounded-full border-2 border-esther-blue/40 bg-card text-esther-blue px-3.5 py-1.5 text-xs font-medium hover:bg-esther-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {jdGenerating
                  ? "AI 生成中…"
                  : jd.trim().length > 0
                    ? "重新生成 JD"
                    : "让 AI 生成一份 JD"}
              </button>
              <p className="text-[11px] text-ink-muted">
                {jdGenErr ? (
                  <span className="text-esther-red">{jdGenErr}</span>
                ) : role.trim().length === 0 ? (
                  "先填目标岗位名,再让 AI 生成 JD"
                ) : jdInferred && jd.trim().length > 0 ? (
                  "AI 生成的 JD,可直接编辑;会按它逐条拆解你的差距"
                ) : jd.trim().length > 0 ? (
                  "会按这段 JD 逐条拆解你的差距"
                ) : (
                  "没有 JD 也行 —— 点「分析差距」会先按岗位名生成一份再分析"
                )}
              </p>
            </div>
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
  onChangeTier,
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
  onChangeTier: (t: TimeTier) => void;
  busy: boolean;
  phase: string;
  error: string | null;
  onBack: () => void;
  onRecommend: () => void;
}) {
  const tier = TIME_TIERS[timeTier];
  const pickedCount = report.gaps.filter((g) => picked.has(g.jd_requirement)).length;

  // 建议档位:当前选的档比能覆盖核心缺口的最小档还短时,提示用户升档(可一键切换)
  const rec = recommendTier(report);
  const recTier = TIME_TIERS[rec.tier];
  const currentTooShort =
    TIER_ORDER.indexOf(rec.tier) > TIER_ORDER.indexOf(timeTier);
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

      {/* 建议档位:当前档补不出核心缺口的可信证据时,提示升档 */}
      {currentTooShort && rec.coverable && (
        <div className="mb-4 flex items-start gap-3 flex-wrap rounded-xl border-2 border-esther-yellow/50 bg-esther-yellow/10 px-4 py-3">
          <span className="text-sm flex-shrink-0">💡</span>
          <div className="flex-1 min-w-[220px]">
            <p className="text-sm font-medium text-ink">
              建议至少选「{recTier.emoji} {recTier.label}档({recTier.daysHint})」
            </p>
            <p className="text-xs text-ink-soft mt-0.5">
              你勾选要攻的核心缺口在「{tier.label}档({tier.daysHint})」内拿不出可信证据，硬出方案会注水。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChangeTier(rec.tier)}
            className="flex-shrink-0 rounded-full bg-esther-blue text-white px-4 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors"
          >
            切到{recTier.label}档
          </button>
        </div>
      )}
      {/* 连深耕档也补不齐的诚实提示 */}
      {!rec.coverable && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border-2 border-esther-red/30 bg-esther-red/5 px-4 py-3">
          <span className="text-sm flex-shrink-0">⚠️</span>
          <p className="text-xs text-ink-soft leading-relaxed">
            说句实在话：部分核心缺口即使「深耕档」也很难在 1-2 个月内补出可信证据，这个方向可能更适合
            <span className="text-ink font-medium">拉长时间线或换一个更贴近你现状的目标</span>。下面仍可生成方案，但请把它当作起步而非终点。
          </p>
        </div>
      )}
      {/* 岗位适配度兜底横幅 —— 诚实告诉用户这岗位适不适合"独立项目"补强(来自 main) */}
      {report.bridge_fit === "digital" && (
        <div className="mb-5 rounded-lg border border-esther-yellow/50 bg-esther-yellow/10 px-3 py-2.5 text-xs text-ink leading-relaxed">
          这个岗位不在内置项目原型库内,下面是基于通用经验的建议,<b>可靠性中等</b> —— 请结合自己判断是否贴合,不必照单全收。
        </div>
      )}
      {report.bridge_fit === "hands_on" && (
        <div className="mb-5 rounded-lg border border-esther-red/40 bg-esther-red/5 px-3 py-2.5 text-xs text-ink leading-relaxed">
          这类岗位的硬证据来自<b>真实实验室 / 实习 / 现场</b>,一个人在家做不出能替代的"项目"。
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
function StatusActions({ onDelete }: { onDelete: () => void }) {
  // 进度靠「按周里程碑」勾选 + 笔记体现;「送进简历优化」在笔记卡底部一步送出。
  // 不再有「开始/完成」状态按钮(纯仪式,无意义)。
  return (
    <div className="mt-5 flex items-center gap-3 flex-wrap">
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
  onAdopt,
  onSaveCloud,
  isGuest,
}: {
  project: M4Project;
  onNotesChange: (notes: string) => void;
  onAdopt: () => void;
  onSaveCloud: () => Promise<SaveCloudResult>;
  isGuest: boolean;
}) {
  const learning = project.kind === "learning";

  // 显式「保存到云端」状态
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  async function handleSaveCloud() {
    if (saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const r = await onSaveCloud();
      if (r.ok) {
        setSavedAt(
          new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
        );
      } else {
        setSaveErr(r.error ?? "保存失败,请重试");
      }
    } finally {
      setSaving(false);
    }
  }

  // 已勾选(声称在做/做过)的任务文本 —— 用于「AI 整理笔记草稿」
  const doneTasks = useMemo(() => {
    if (project.kind !== "project") return [];
    const out: string[] = [];
    for (const w of project.weekly_plan) {
      for (const t of w.tasks) {
        if (project.task_progress[t.id]) out.push(t.task);
      }
    }
    return out;
  }, [project]);

  const [drafting, setDrafting] = useState(false);
  const [draftErr, setDraftErr] = useState<string | null>(null);

  async function handleDraft() {
    if (drafting || doneTasks.length === 0) return;
    if (
      project.notes.trim().length > 0 &&
      !confirm("已有笔记内容,用 AI 草稿覆盖?(覆盖后你仍可继续编辑)")
    ) {
      return;
    }
    setDrafting(true);
    setDraftErr(null);
    try {
      const res = await fetch("/api/m4/draft-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, doneTasks }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { draft: string };
      onNotesChange(j.draft);
    } catch (err) {
      setDraftErr(err instanceof Error ? err.message : "AI 整理失败");
    } finally {
      setDrafting(false);
    }
  }

  return (
    <Card className="p-5 border-2 border-border">
      <p className="font-display italic text-xs text-esther-blue mb-2">Notes</p>
      <h3 className="text-base font-semibold text-ink mb-1">
        📝 {learning ? "学习笔记" : "项目笔记"}
      </h3>
      {learning && (
        <p className="text-xs text-ink-muted mb-3 leading-relaxed">
          学完后记一笔:你真正搞懂了什么、做出了什么产出 —— 一页概念总结、一条科普帖、笔记链接都行。
        </p>
      )}

      {/* AI 整理笔记草稿:基于已勾选任务,出一版带【】占位的脚手架,用户填真实成果 */}
      {!learning && (
        <div className="mb-3">
          <button
            type="button"
            onClick={handleDraft}
            disabled={drafting || doneTasks.length === 0}
            className="inline-flex items-center gap-1.5 rounded-full border-2 border-esther-blue/40 bg-card text-esther-blue px-3.5 py-1.5 text-xs font-medium hover:bg-esther-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {drafting
              ? "AI 整理中…"
              : `✦ 根据已勾选的 ${doneTasks.length} 个任务，让 AI 整理一版草稿`}
          </button>
          <p className="text-[11px] text-ink-muted mt-1.5 leading-relaxed">
            {doneTasks.length === 0
              ? "先在上面「按周里程碑」勾选你在做 / 做过的任务，再让 AI 帮你起草。"
              : "AI 只把任务组织成叙述、真实成果留【】占位 —— 记得把【】换成你的真实数字 / 产出再保存。"}
          </p>
          {draftErr && (
            <div className="mt-1.5 rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
              ⚠️ {draftErr}
            </div>
          )}
        </div>
      )}

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
      <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-ink-muted">
          当前字数:{project.notes.trim().length}
          {project.notes.trim().length >= 10 ? " ✓" : " · 至少 10 字"}
        </p>
        {isGuest ? (
          <p className="text-[11px] text-ink-muted">
            📍 游客笔记只存在本机浏览器,{" "}
            <Link href="/login" className="text-esther-blue hover:underline">
              登录
            </Link>{" "}
            后存云端,换设备 / 重新登录也能看到
          </p>
        ) : (
          <div className="flex items-center gap-2">
            {saveErr ? (
              <span className="text-[11px] text-esther-red">⚠️ {saveErr}</span>
            ) : savedAt ? (
              <span className="text-[11px] text-ink-muted">✓ 已保存到云端 · {savedAt}</span>
            ) : null}
            <button
              type="button"
              onClick={handleSaveCloud}
              disabled={saving}
              className="inline-flex items-center gap-1 rounded-full border-2 border-esther-blue/40 bg-card text-esther-blue px-3.5 py-1.5 text-xs font-medium hover:bg-esther-blue/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "保存中…" : "💾 保存到云端"}
            </button>
          </div>
        )}
      </div>

      {/* 送进简历优化 —— 写完笔记就在这一步送出(从项目头部移来) */}
      <div className="mt-4 pt-4 border-t border-border">
        {project.committable ? (
          <button
            type="button"
            onClick={onAdopt}
            className="inline-flex items-center gap-1 rounded-full bg-esther-blue text-white px-5 py-2.5 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
          >
            ✓ 把这段经历送进简历优化 →
          </button>
        ) : (
          <p className="text-xs text-ink-muted">
            ⚠️ 写够 10 字的实际成果(把【】换成你的真实数字 / 产出),就能送进简历优化
          </p>
        )}
      </div>
    </Card>
  );
}

/** —— 共享:Ask AI(多轮对话)—— */
type AskTurn = { role: "user" | "assistant"; content: string };
function AskAiCard({ project }: { project: M4Project }) {
  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [askError, setAskError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  // 新消息进来自动滚到底
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [turns, askLoading]);

  async function handleAsk() {
    const q = askQuestion.trim();
    if (!q || askLoading) return;
    const nextTurns: AskTurn[] = [...turns, { role: "user", content: q }];
    setTurns(nextTurns);
    setAskQuestion("");
    setAskLoading(true);
    setAskError(null);
    try {
      const res = await fetch("/api/m4/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, messages: nextTurns, userNotes: project.notes }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { answer: string };
      setTurns((prev) => [...prev, { role: "assistant", content: j.answer }]);
    } catch (err) {
      setAskError(err instanceof Error ? err.message : "AI 调用失败");
    } finally {
      setAskLoading(false);
    }
  }

  return (
    <Card className="p-5 border-2 border-esther-yellow bg-esther-yellow/10">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-ink">💬 Ask AI · 卡住了就问</p>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setTurns([]);
              setAskError(null);
            }}
            className="text-[11px] text-ink-muted hover:text-ink transition-colors"
          >
            清空对话
          </button>
        )}
      </div>

      {turns.length > 0 && (
        <div
          ref={threadRef}
          className="mb-3 max-h-[360px] overflow-y-auto space-y-3 pr-1"
        >
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="flex justify-end">
                <p className="max-w-[85%] bg-esther-blue text-white rounded-2xl rounded-br-sm px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {t.content}
                </p>
              </div>
            ) : (
              <div key={i} className="flex justify-start">
                <p className="max-w-[85%] bg-card border border-border rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm text-ink leading-relaxed whitespace-pre-wrap">
                  {t.content}
                </p>
              </div>
            ),
          )}
          {askLoading && (
            <div className="flex justify-start">
              <p className="bg-card border border-border rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm text-ink-muted">
                思考中…
              </p>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={askQuestion}
          onChange={(e) => setAskQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !askLoading) handleAsk();
          }}
          placeholder={
            turns.length > 0
              ? "接着问…(例:那第一步具体怎么做?)"
              : "例:这个概念没看懂,能举个具体例子吗?"
          }
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
        <div className="mt-3 rounded-lg border border-esther-red/40 bg-esther-red/10 px-3 py-2 text-xs text-esther-red">
          ⚠️ {askError}
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
  onNotesChange,
  onDelete,
  onAdopt,
  onSaveCloud,
  isGuest,
}: {
  project: M4LearningItem;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onAdopt: () => void;
  onSaveCloud: () => Promise<SaveCloudResult>;
  isGuest: boolean;
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
          {project.est_hours && (
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <span className="text-xs text-ink-muted font-display italic">
                预估投入 {project.est_hours}
              </span>
            </div>
          )}
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

        <StatusActions onDelete={onDelete} />
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

      <NotesCard
        project={project}
        onNotesChange={onNotesChange}
        onAdopt={onAdopt}
        onSaveCloud={onSaveCloud}
        isGuest={isGuest}
      />
      <AskAiCard project={project} />
    </div>
  );
}

/** ============================================================
 * ProjectDetail — 项目卡(标准 / 深耕档)
 * ============================================================ */
function ProjectDetail({
  project,
  onToggleTask,
  onNotesChange,
  onDelete,
  onAdopt,
  onSaveCloud,
  isGuest,
}: {
  project: M4ProjectItem;
  onToggleTask: (taskId: string) => void;
  onNotesChange: (notes: string) => void;
  onDelete: () => void;
  onAdopt: () => void;
  onSaveCloud: () => Promise<SaveCloudResult>;
  isGuest: boolean;
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

        <StatusActions onDelete={onDelete} />
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
            ⚠️ 可能会问的问题
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

      <NotesCard
        project={project}
        onNotesChange={onNotesChange}
        onAdopt={onAdopt}
        onSaveCloud={onSaveCloud}
        isGuest={isGuest}
      />
      <AskAiCard project={project} />
    </div>
  );
}
