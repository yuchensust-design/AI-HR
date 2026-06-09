"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useM3DBSync, type M3Row } from "@/lib/sync/useM3DBSync";
import { M3_OPTIMIZATION_GOALS, type M3OptimizationGoalKey } from "@/lib/m3-optimization-goals";
import {
  EditSuggestionCard,
  type EditSuggestion,
  type Decision,
  type RejectReason,
} from "@/components/EditSuggestionCard";
import { type LlmMetrics } from "@/components/DiffMetricsTable";
import { M3OptimizationStepper } from "@/components/M3OptimizationStepper";
import { M3ScoreDashboard, type M3DashboardData } from "@/components/M3ScoreDashboard";
import { ensureResumeIds } from "@/lib/m3-id-helpers";
import { matchKeywords, getJdKeywords } from "@/lib/keyword-match";
import { skillGroupsOf } from "@/lib/resume-skills";
import ConversationSwitcher from "@/components/conversations/ConversationSwitcher";

/**
 * 模块 3 / Phase 5 Interactive Review-Confirm(2026-06-02 redesigned per user feedback)
 *
 * 左:实时简历预览(应用 accept 后改动)
 * 右:N 条改动建议卡片,逐条 accept/reject/regen
 * 顶部固定:「我看完了 → 下载 Word」
 */

type Status = "loading" | "ready" | "error";

type SuggestEditsResult = {
  edits: EditSuggestion[];
  default_accept_count: number;
  optimization_summary: string;
  used_supplements: string[];
  inferred_persona: string;
  original_issues?: string[];
  optimization_directions?: string[];
};

type DecisionsMap = Record<string, Decision>;
type RewrittenMap = Record<string, string>;

type AnyBullet = { text?: string; narrative_tag?: string } | string;
type ParsedResume = {
  basic?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    school?: string | null;
    major?: string | null;
    year_level?: string | null;
    gpa?: string | null;
    location?: string | null;
  };
  education?: {
    school?: string;
    major?: string;
    degree?: string;
    period?: string;
    gpa?: string | null;
    rank?: string | null;
    research_direction?: string | null;
    advisor?: string | null;
    courses?: string[];
    awards?: string[];
  }[];
  experience?: { org?: string; role?: string; period?: string; bullets?: AnyBullet[] }[];
  projects?: { name?: string; period?: string; role?: string; tech_stack?: string[]; bullets?: AnyBullet[] }[];
  activities?: { org?: string; role?: string; period?: string; bullets?: AnyBullet[] }[];
  self_eval?: { bullets?: AnyBullet[] }[];
  skills?: Record<string, string[]>;
  skill_groups?: { category: string; items: string[] }[];
  meta?: { narrative_tag_distribution?: Record<string, number> };
} | null;
type JdCtx = {
  jd_summary?: string;
  /** parse-jd 确定性抽取的 JD 关键词清单(只忠于 JD;命中由 lib/keyword-match 代码层算) */
  jd_keywords?: string[];
  must_have?: string[];
  nice_to_have?: string[];
  jd_requirements_parsed?: { type?: string; text?: string }[];
  gaps?: { fixable?: string }[];
  /** plan offer-1-sparkling-hippo P1:M6 跳过来但没拿到 JD 全文 → true,UI 展示低置信提示 */
  placeholder_mode?: boolean;
  role_name?: string;
  company?: string;
} | null;
type HiddenList = unknown[];
type RejectionMap = Record<string, RejectReason>;
type FromDebriefHighlight = { evidence: string; source_question?: string } | null;
type PrepQuestion = { q: string; examines?: string; reference_answer: string; tip?: string };
type PrepCategory = { name: string; questions: PrepQuestion[] };

// 轻量内容签名(djb2)— 用于缓存 key,输入变了自动失效
function cheapSig(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export default function ResultPage() {
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
      <ResultShell />
    </Suspense>
  );
}

// 持久壳:Nav + 侧栏不随会话切换重挂载;内容用 key={convId} 切换时干净重置
function ResultShell() {
  const convId = useSearchParams().get("c") ?? "guest";
  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg">
        <div className="h-20" />
        <div className="flex">
          <ConversationSwitcher module="m3" basePath="/m3" itemBasePath="/m3/result" defaultTitle="简历" />
          <div className="flex-1 min-w-0">
            <ResultContent key={convId} />
          </div>
        </div>
      </main>
    </>
  );
}

function ResultContent() {
  const { isLoggedInWithConv, dbData, convId, convQs, saveField, loading: dbLoading } = useM3DBSync();
  // 决策持久化 key(按会话隔离;游客统一 guest)— 修"刷新丢决策"
  const decisionsKey = `m3_decisions_${convId ?? "guest"}`;

  const [localParsedResume, setLocalParsedResume] = useLocalState<ParsedResume>(STORAGE_KEYS.PARSED_RESUME, null);
  const [localJdContext, setLocalJdContext] = useLocalState<JdCtx>(STORAGE_KEYS.JD_CONTEXT, null);
  const [localHidden] = useLocalState<HiddenList>(STORAGE_KEYS.HIDDEN_EXPERIENCES, []);
  // 八大核心优化规则默认全生效,不再让用户选择
  const optimizationGoals = useMemo(
    () => M3_OPTIMIZATION_GOALS.map((g) => g.key) as M3OptimizationGoalKey[],
    [],
  );

  const parsedResume = (isLoggedInWithConv ? dbData?.parsed_resume_json ?? null : localParsedResume) as ParsedResume;
  const jdContext = (isLoggedInWithConv ? dbData?.jd_context_json ?? null : localJdContext) as JdCtx;

  // 点了还没上传简历的会话 → 回设置页(switcher 现在统一指向 /m3/result)
  const router = useRouter();
  const bouncedRef = useRef(false);
  useEffect(() => {
    if (bouncedRef.current) return;
    if (isLoggedInWithConv && !dbLoading && !parsedResume) {
      bouncedRef.current = true;
      router.replace(`/m3?c=${convId}`);
    }
  }, [isLoggedInWithConv, dbLoading, parsedResume, convId, router]);
  const hiddenExperiences = (isLoggedInWithConv
    ? (Array.isArray(dbData?.hidden_experience_json) ? dbData!.hidden_experience_json : [])
    : localHidden) as HiddenList;

  const [status, setStatus] = useState<Status>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [data, setData] = useState<SuggestEditsResult | null>(null);
  const [decisions, setDecisions] = useState<DecisionsMap>({});
  const [rewritten, setRewritten] = useState<RewrittenMap>({});
  const [downloading, setDownloading] = useState(false);
  const [fromDebriefHighlight, setFromDebriefHighlight] = useState<FromDebriefHighlight>(null);

  // 4-tab 结构(对标竞品 ResumeAI Pro:岗位匹配/简历对比/简历中心/面试准备)
  const [activeTab, setActiveTab] = useState<"match" | "diff" | "resume" | "interview">("match");
  const [rejectReasons, setRejectReasons] = useState<Record<string, RejectReason>>({});
  const [regenBusyId, setRegenBusyId] = useState<string | null>(null);
  // "跟 AI 再改" chat(决策 3:做成真功能)
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMsgs, setChatMsgs] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  // 单条针对性 chat:聚焦到某条 edit(图2 反馈)
  const [chatTargetEditId, setChatTargetEditId] = useState<string | null>(null);
  // "已改好"组默认折叠(紧凑)
  const [acceptedCollapsed, setAcceptedCollapsed] = useState(true);
  // 一键复制反馈
  const [copied, setCopied] = useState(false);
  const [copyingText, setCopyingText] = useState(false);
  // 决策持久化:已恢复标记(避免重复 restore 覆盖用户操作)
  const decisionsRestoredRef = useRef(false);

  // 面试准备:提到父组件 + 后台预取 + 缓存(图:点 tab 不再重新生成)
  const [interviewPrep, setInterviewPrep] = useState<PrepCategory[] | null>(null);
  const [interviewPrepLoading, setInterviewPrepLoading] = useState(false);
  const [interviewPrepError, setInterviewPrepError] = useState("");
  const interviewPrepStartedRef = useRef(false);

  // Timing 1: 关键词缺口 — 每个缺失 JD 关键词的用户反应
  const [keywordResponses, setKeywordResponses] = useState<Record<string, "can" | "vague" | "no">>({});
  // 关键词缺口闭环:会用/略懂 → AI 生成补法 → 采纳 → 命中 + 写进最终简历
  type KeywordFill = { level: "can" | "vague"; suggestion: string; where: string; accepted: boolean };
  const [keywordFills, setKeywordFills] = useState<Record<string, KeywordFill>>({});
  const [keywordFillLoading, setKeywordFillLoading] = useState<Record<string, boolean>>({});
  // Timing 3: Skeptical Recruiter 悬浮卡
  const [srOpenEditId, setSrOpenEditId] = useState<string | null>(null);
  const [srAnswers, setSrAnswers] = useState<Record<string, string>>({});

  // V3 — hover/点击 AI 改清单某条 → 右侧简历对应 bullet 蓝色高亮 + 滚到视野
  const [hoveredEditId, setHoveredEditId] = useState<string | null>(null);

  // LLM metrics(STAR 完整度 + 硬门槛对齐)— 给顶部综合评分用
  // 注:JD 关键词清单 + 命中已改成确定性(jdContext.jd_keywords + lib/keyword-match),不再走 LLM
  const [llmMetrics, setLlmMetrics] = useState<LlmMetrics | null>(null);
  const [llmMetricsRefreshing, setLlmMetricsRefreshing] = useState(false);
  // LLM 语义关键词命中(带证据)— 补子串匹配抓不到的能力/职责类词
  const [llmKwResults, setLlmKwResults] = useState<
    { keyword: string; hit: boolean; evidence: string }[] | null
  >(null);
  const [kwMatchLoading, setKwMatchLoading] = useState(false);
  // 核心技能自然语句改写(合并补强)— null=未生成,[]=空/失败回退分类
  const [skillsSummary, setSkillsSummary] = useState<string[] | null>(null);

  // 读模块 5 复盘 highlight(不持久化在 STORAGE_KEYS 里,直接读 raw key,fail-safe)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("from_debrief_highlight");
      if (raw) setFromDebriefHighlight(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  // P0-B(offer-1-sparkling-hippo):为 parsedResume 注入稳定 bullet/item ID,
  // Live Preview 写回时优先按 ID 找,避免章节重排后 target 字符串失配。
  // 幂等:hasAllResumeIds 检测,已齐全则不触发 setter。
  useEffect(() => {
    if (!parsedResume) return;
    const withIds = ensureResumeIds(parsedResume);
    if (withIds === parsedResume) return; // 已经齐全,不重写
    if (isLoggedInWithConv) {
      saveField("parsed_resume_json", withIds);
    } else {
      setLocalParsedResume(withIds);
    }
  }, [parsedResume, isLoggedInWithConv, saveField, setLocalParsedResume]);

  // 内容签名(parsedResume + jd + hidden)— 输入没变就走缓存,变了自动失效。
  // 注:剥掉注入的稳定 id(ensureResumeIds 首次会给简历注 id 改变引用),否则"打开旧简历"
  // 会因 id 注入导致签名漂移 → 误判内容变了 → 重新分析。签名只认真实内容。
  const stripIds = (k: string, v: unknown) => (k === "id" ? undefined : v);
  const contentSig = useMemo(
    () =>
      cheapSig(
        JSON.stringify(parsedResume ?? null, stripIds) +
          JSON.stringify(jdContext ?? null) +
          JSON.stringify(hiddenExperiences ?? [], stripIds) +
          JSON.stringify(optimizationGoals ?? []),
      ),
    [parsedResume, jdContext, hiddenExperiences, optimizationGoals],
  );
  // suggest-edits prompt 版本 — 仅用于写入标记;**自动命中缓存只认 contentSig**,
  // prompt bump 不再自动触发重分析(用户嫌烦),要新 prompt 结果点"重新生成"即可。
  const editsSig = `${contentSig}-p6`;
  const editsCacheKey = `m3_edits_${convId ?? "guest"}_${editsSig}`;
  // metrics 缓存 key:内容 + 决策(决策变 → v2 bullets 变 → STAR/硬门槛要重算)
  const metricsCacheKey = `m3_metrics_${convId ?? "guest"}_${contentSig}_${cheapSig(
    JSON.stringify({ d: decisions, r: rewritten })
  )}`;

  function applyEditsResult(parsed: SuggestEditsResult) {
    setData(parsed);
    // V2 自动 accept:低风险全自动改;高风险保持 pending 等用户填/确认。
    const LOW_RISK_CAT = new Set([
      "narrative-tools",
      "ats-keyword",
      "section-reorder",
      "career-translator",
      "tech-deepening",
    ]);
    const initialDecisions: DecisionsMap = {};
    for (const e of parsed.edits) {
      if (e.claim_type === "explicit" && LOW_RISK_CAT.has(e.category)) {
        initialDecisions[e.id] = "accept";
      }
    }
    setDecisions(initialDecisions);
    setStatus("ready");
  }

  // 统一产物读写:登录 → DB 列(jsonb),游客 → localStorage(plan m3-db-persistence)
  const readArtifact = useCallback(
    <T,>(dbField: keyof M3Row, lsKey: string): T | null => {
      if (isLoggedInWithConv) {
        const v = (dbData as Partial<M3Row> | null)?.[dbField];
        return (v ?? null) as T | null;
      }
      if (typeof window === "undefined") return null;
      try {
        const raw = window.localStorage.getItem(lsKey);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    [isLoggedInWithConv, dbData],
  );

  const writeArtifact = useCallback(
    (dbField: keyof M3Row, lsKey: string, value: unknown) => {
      if (isLoggedInWithConv) {
        void saveField(dbField, value);
        return;
      }
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(lsKey, JSON.stringify(value));
      } catch {
        /* quota — ignore */
      }
    },
    [isLoggedInWithConv, saveField],
  );

  // metrics 内容签名(内容 + 决策变 → v2 bullets 变 → STAR/硬门槛要重算)
  const metricsSig = useMemo(
    () => cheapSig(contentSig + JSON.stringify({ d: decisions, r: rewritten })),
    [contentSig, decisions, rewritten],
  );

  const suggestInFlightRef = useRef<string | null>(null); // 在途 suggest-edits 的 contentSig 令牌,防并发重复请求
  const loadSuggestions = useCallback(async (force = false) => {
    if (!parsedResume) return;
    // 防并发:首次分析期间 parsedResume 引用会因注入 id/saveField 反复变 → 自动 effect
    // 重触发,导致一次「开始优化」并发打出多次 suggest-edits(实测 8 次,空烧 LLM)。
    // 用 contentSig 当在途令牌:同一内容已在请求中就跳过;内容真变了(新 sig)才允许新请求。
    if (!force && suggestInFlightRef.current === contentSig) return;
    setStatus("loading");
    setErrorMsg("");
    // 命中缓存(登录=DB / 游客=localStorage):内容没变就直接出,不重算。
    // 只比 contentSig(内容签名),不比 prompt 版本 → "以前分析过的不再重复分析"。
    // 旧格式只有 sig 没 contentSig → 退回精确匹配,首次会重算一次后按新格式落库。
    if (!force) {
      const cached = readArtifact<{ sig?: string; contentSig?: string; result: SuggestEditsResult }>(
        "edits_json",
        editsCacheKey,
      );
      const hit =
        cached?.result &&
        (cached.contentSig === contentSig || cached.sig === editsSig);
      if (hit) {
        applyEditsResult(cached!.result);
        return;
      }
    }
    suggestInFlightRef.current = contentSig;
    try {
      const res = await fetch("/api/m3/suggest-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          fromDebriefHighlight: fromDebriefHighlight ?? null,
          optimizationGoals: optimizationGoals ?? [],
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const parsed = (await res.json()) as SuggestEditsResult;
      writeArtifact("edits_json", editsCacheKey, { sig: editsSig, contentSig, result: parsed });
      applyEditsResult(parsed);
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载失败";
      setErrorMsg(message);
      setStatus("error");
    } finally {
      suggestInFlightRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedResume, jdContext, hiddenExperiences, fromDebriefHighlight, optimizationGoals, editsCacheKey, contentSig, readArtifact, writeArtifact]);

  useEffect(() => {
    // !dbLoading:登录用户 auth/DB 未就绪前,parsedResume 会临时回退到 localStorage 旧数据,
    // 此时绝不能跑分析(否则在错误简历上算一次、缓存住、再也不重算 → 关键词倒退 + 闪烁)
    if (!dbLoading && parsedResume && !data && status === "loading") {
      loadSuggestions();
    }
  }, [dbLoading, parsedResume, data, status, loadSuggestions]);

  // ?backfill=1:从模块5复盘「采纳」直达 —— 落到「简历对比」tab,自动滚到并高亮
  // 那条来自面试的回写建议(source=interview),保持待确认状态,用户点接受才写入。
  const backfillParam = useSearchParams().get("backfill") === "1";
  const backfillLandedRef = useRef(false);
  // 落地时显式展示"刚从面试采纳"的上下文(不依赖另一条 note 的渲染)
  const [backfillCtx, setBackfillCtx] = useState<{ question: string; excerpt: string } | null>(null);
  useEffect(() => {
    if (!backfillParam || backfillLandedRef.current) return;
    if (status !== "ready" || !data) return;
    backfillLandedRef.current = true;
    /* eslint-disable react-hooks/set-state-in-effect */
    setActiveTab("diff");
    try {
      const raw = window.localStorage.getItem("from_debrief_highlight");
      if (raw) {
        const p = JSON.parse(raw) as { question?: string; excerpt?: string };
        if (p?.excerpt) setBackfillCtx({ question: p.question ?? "", excerpt: p.excerpt });
      }
    } catch {
      /* ignore */
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    // 优先高亮"来自面试"那条;没有(内容已在简历里→变成普通改写)则停在对比页即可
    const target = data.edits.find((e) => e.source === "interview");
    if (!target?.id) return;
    window.setTimeout(() => {
      setHoveredEditId(target.id);
      document
        .querySelector(`[data-edit-id="${target.id}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 350);
  }, [backfillParam, status, data]);

  // === LLM diff-metrics(只取顶部 1 行评分需要的 JD 关键词命中数 + STAR/hard_req 提升)===
  const loadLlmMetrics = useCallback(async () => {
    if (!parsedResume) return;
    // 先查缓存(登录=DB / 游客=localStorage):内容没变就复用,避免重开/刷新重算分数忽高忽低。
    // 只比 contentSig(内容)→ 与 suggest-edits 一致:重开不重算;旧格式退回 sig 精确匹配。
    const cachedMetrics = readArtifact<{ sig?: string; contentSig?: string; metrics: LlmMetrics }>(
      "metrics_json",
      metricsCacheKey,
    );
    if (
      cachedMetrics?.metrics &&
      (cachedMetrics.contentSig === contentSig || cachedMetrics.sig === metricsSig)
    ) {
      setLlmMetrics(cachedMetrics.metrics);
      return;
    }
    setLlmMetricsRefreshing(true);
    try {
      // V2 只给 LLM STAR 完整度 + 硬门槛对齐(关键词命中已确定性化,见 lib/keyword-match)
      const acceptedEditsForDiff = data
        ? data.edits
            .filter((e) => decisions[e.id] === "accept" && e.category !== "gap-alert")
            .map((e) => ({
              target: e.target,
              original_text: e.original_text,
              suggested_text: rewritten[e.id] ?? e.suggested_text,
            }))
        : [];
      const v1Bullets: string[] = [];
      const v2Bullets: string[] = [];
      // 简单提取所有 bullet 文本(rough,只为后端 STAR 评分)
      const sections: Array<keyof NonNullable<ParsedResume>> = [
        "experience",
        "projects",
        "activities",
        "self_eval",
      ];
      for (const sec of sections) {
        const arr = (parsedResume as Record<string, unknown>)?.[sec];
        if (!Array.isArray(arr)) continue;
        for (const it of arr) {
          const bs = (it as { bullets?: Array<string | { text?: string }> })?.bullets;
          if (!Array.isArray(bs)) continue;
          for (const b of bs) {
            const t = typeof b === "string" ? b : b?.text ?? "";
            if (t) {
              v1Bullets.push(t);
              const repl = acceptedEditsForDiff.find((e) => e.original_text === t);
              v2Bullets.push(repl ? repl.suggested_text : t);
            }
          }
        }
      }
      if (v1Bullets.length === 0) {
        setLlmMetricsRefreshing(false);
        return;
      }
      // 修复关键词漏匹配:技能区 / 项目技术栈 / 课程也是简历内容,
      // 但不在 bullet 里 — 必须一起喂给匹配器,否则"编程语言: Python、SQL"会被误报为缺失
      const extraTextParts: string[] = [];
      for (const g of skillGroupsOf(parsedResume)) {
        extraTextParts.push(`${g.category}: ${g.items.join("、")}`);
      }
      if (Array.isArray(parsedResume?.projects)) {
        for (const p of parsedResume.projects) {
          const ts = (p as { tech_stack?: string[] })?.tech_stack;
          if (Array.isArray(ts) && ts.length > 0) extraTextParts.push(`技术栈: ${ts.join("、")}`);
        }
      }
      if (Array.isArray(parsedResume?.education)) {
        for (const e of parsedResume.education) {
          const cs = (e as { courses?: string[] })?.courses;
          if (Array.isArray(cs) && cs.length > 0) extraTextParts.push(`课程: ${cs.join("、")}`);
        }
      }
      const resumeSkillsText = extraTextParts.join("\n");
      const res = await fetch("/api/m3/diff-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          v1Bullets,
          v2Bullets,
          jdContext: jdContext ?? null,
          parsedResumeBasic: parsedResume?.basic ?? null,
          resumeSkillsText,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = (await res.json()) as LlmMetrics;
      const metrics: LlmMetrics = {
        star_complete_v1: parsed.star_complete_v1,
        star_complete_v2: parsed.star_complete_v2,
        hard_req_total: parsed.hard_req_total,
        hard_req_v1_aligned: parsed.hard_req_v1_aligned,
        hard_req_v2_aligned: parsed.hard_req_v2_aligned,
        hard_req_items: parsed.hard_req_items ?? [],
        llm_explain: parsed.llm_explain ?? "",
      };
      setLlmMetrics(metrics);
      // 缓存(登录=DB / 游客=localStorage):带 contentSig,重开按内容命中不重算
      writeArtifact("metrics_json", metricsCacheKey, { sig: metricsSig, contentSig, metrics });
    } catch (err) {
      console.error("[loadLlmMetrics] failed:", err);
    } finally {
      setLlmMetricsRefreshing(false);
    }
  }, [parsedResume, jdContext, data, decisions, rewritten, metricsCacheKey, metricsSig, contentSig, readArtifact, writeArtifact]);

  // 进 ready 状态后自动跑 1 次 LLM diff-metrics
  useEffect(() => {
    if (status === "ready" && data && !llmMetrics && !llmMetricsRefreshing) {
      loadLlmMetrics();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);

  // 面试准备:预取 + 缓存(像竞品 — 一进结果页就在后台备好,点 tab 秒开)
  const prepCacheKey = `m3_prep_${convId ?? "guest"}_${contentSig}`;
  const loadInterviewPrep = useCallback(
    async (force = false) => {
      if (!parsedResume) return;
      if (!force) {
        const cached = readArtifact<{ sig: string; prep: PrepCategory[] }>(
          "interview_prep_json",
          prepCacheKey,
        );
        if (cached?.prep && cached.sig === contentSig) {
          setInterviewPrep(cached.prep);
          return;
        }
      }
      setInterviewPrepLoading(true);
      setInterviewPrepError("");
      try {
        const res = await fetch("/api/m3/interview-prep", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parsedResume, jdContext: jdContext ?? null }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { categories?: PrepCategory[] };
        const cats = Array.isArray(json.categories) ? json.categories : [];
        setInterviewPrep(cats);
        writeArtifact("interview_prep_json", prepCacheKey, { sig: contentSig, prep: cats });
      } catch (err) {
        console.error("[interview-prep] failed:", err);
        setInterviewPrepError("生成失败,点重试再来一次");
      } finally {
        setInterviewPrepLoading(false);
      }
    },
    [parsedResume, jdContext, prepCacheKey, contentSig, readArtifact, writeArtifact],
  );

  // ready 后后台预取面试准备(只跑一次)
  useEffect(() => {
    if (status !== "ready" || !data || interviewPrepStartedRef.current) return;
    interviewPrepStartedRef.current = true;
    loadInterviewPrep();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);

  // 决策持久化:data ready 后恢复一次(persisted 覆盖自动接受的初值)
  useEffect(() => {
    if (status !== "ready" || !data || decisionsRestoredRef.current) return;
    decisionsRestoredRef.current = true;
    const saved = readArtifact<{
      decisions?: DecisionsMap;
      rewritten?: RewrittenMap;
      srAnswers?: Record<string, string>;
      keywordResponses?: Record<string, "can" | "vague" | "no">;
      keywordFills?: Record<string, KeywordFill>;
    }>("decisions_json", decisionsKey);
    if (!saved) return;
    if (saved.decisions) setDecisions((d) => ({ ...d, ...saved.decisions }));
    if (saved.rewritten) setRewritten((r) => ({ ...r, ...saved.rewritten }));
    if (saved.srAnswers) setSrAnswers((a) => ({ ...a, ...saved.srAnswers }));
    if (saved.keywordResponses) setKeywordResponses((k) => ({ ...k, ...saved.keywordResponses }));
    if (saved.keywordFills) setKeywordFills((f) => ({ ...f, ...saved.keywordFills }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, data]);

  // 决策持久化:变更即存(恢复完成后才写,避免空值覆盖)
  // 游客 → localStorage 即时;登录 → DB,debounce 800ms 防止每次点击都打 DB
  useEffect(() => {
    if (!decisionsRestoredRef.current) return;
    const payload = { decisions, rewritten, srAnswers, keywordResponses, keywordFills };
    if (!isLoggedInWithConv) {
      if (typeof window === "undefined") return;
      try {
        window.localStorage.setItem(decisionsKey, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
      return;
    }
    const t = setTimeout(() => {
      void saveField("decisions_json", payload);
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decisions, rewritten, srAnswers, keywordResponses, keywordFills, isLoggedInWithConv]);

  // 收集采纳的 edits + 采纳的关键词补法(后者作为 new: 新增进最终简历)
  function buildAcceptedEdits() {
    const base = (data?.edits ?? [])
      .filter((e) => decisions[e.id] === "accept")
      .map((e) => ({ ...e, suggested_text: rewritten[e.id] ?? e.suggested_text }));
    const fills = Object.entries(keywordFills)
      .filter(([, f]) => f.accepted)
      .map(([kw, f]) => ({
        id: `kwfill-${kw}`,
        target: `new:kwfill:${kw}`,
        original_text: "(新增)",
        suggested_text: f.suggestion,
        reason: `关键词补强:${kw}`,
        category: "ats-keyword",
        priority: "medium" as const,
        claim_type: (f.level === "can" ? "explicit" : "inferred") as
          | "explicit"
          | "inferred",
      }));
    return [...base, ...fills];
  }

  // Tab3 一键复制纯文本(走 finalize-resume 拿 markdown)
  async function handleCopyText() {
    if (!data || copyingText) return;
    setCopyingText(true);
    try {
      const acceptedEdits = buildAcceptedEdits();
      const res = await fetch("/api/m3/finalize-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          acceptedEdits,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const finalized = (await res.json()) as { markdown?: string };
      const text = (finalized.markdown ?? "").replace(/[#*`>]/g, "").trim();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[handleCopyText] failed:", err);
    } finally {
      setCopyingText(false);
    }
  }

  async function handleDownload() {
    if (!data) return;
    setDownloading(true);
    try {
      const acceptedEdits = buildAcceptedEdits();

      const res = await fetch("/api/m3/finalize-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          jdContext: jdContext ?? null,
          hiddenExperiences: hiddenExperiences ?? [],
          acceptedEdits,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const finalized = await res.json();

      // 用 finalized.markdown 走 export-docx
      const docxRes = await fetch("/api/m3/export-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          markdown: finalized.markdown,
          basic: parsedResume?.basic,
          targetRole: jdContext?.jd_summary ?? "通用版",
        }),
      });
      if (!docxRes.ok) throw new Error(`docx HTTP ${docxRes.status}`);
      const blob = await docxRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      a.download = `resume_${parsedResume?.basic?.name ?? "user"}_${datePart}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : "下载失败";
      setErrorMsg(message);
    } finally {
      setDownloading(false);
    }
  }

  // 统计
  const acceptedCount = Object.values(decisions).filter((d) => d === "accept").length;

  // V2 待补充 edit(简历里【请补充】高亮 + 用户点击填)
  const pendingFillEdits = useMemo(() => {
    if (!data) return [];
    return data.edits.filter(
      (e) =>
        e.category !== "gap-alert" &&
        decisions[e.id] !== "accept" &&
        decisions[e.id] !== "reject" &&
        (e.claim_type === "needs_confirmation" ||
          e.claim_type === "inferred" ||
          e.category === "quantification"),
    );
  }, [data, decisions]);

  // Tab2 按"你要做什么"分 4 组(互斥)
  const editGroups = useMemo(() => {
    const done: EditSuggestion[] = [];
    const confirm: EditSuggestion[] = [];
    const needFill: EditSuggestion[] = [];
    const gap: EditSuggestion[] = [];
    if (!data) return { done, confirm, needFill, gap };
    for (const e of data.edits) {
      if (e.category === "gap-alert") {
        gap.push(e);
      } else if (decisions[e.id] === "accept") {
        done.push(e);
      } else if (/【请补充/.test(e.suggested_text ?? "")) {
        // 按【原始 suggested_text】分组(稳定)。不要用 rewritten —— 否则用户一填占位符就少了,
        // 这条会从"待补信息"跳到"待确认"组,导致卡片被父列表卸载重挂载、输入框丢焦点/看起来像自动提交。
        needFill.push(e);
      } else {
        confirm.push(e);
      }
    }
    return { done, confirm, needFill, gap };
  }, [data, decisions, rewritten]);

  // 自愈:凡是"已采纳但文本里还有【请补充】没填"的,退回待确认 —— 带占位符不该算已采纳
  useEffect(() => {
    if (!data) return;
    const bad = data.edits.filter(
      (e) =>
        decisions[e.id] === "accept" &&
        /【请补充/.test(rewritten[e.id] ?? e.suggested_text ?? ""),
    );
    if (bad.length > 0) {
      setDecisions((d) => {
        const n = { ...d };
        for (const e of bad) n[e.id] = null;
        return n;
      });
    }
  }, [data, decisions, rewritten]);

  // === A:确定性关键词命中 ===
  // JD 关键词清单(parse-jd 存好的;老数据从 must_have/requirements 派生)— 不再走 LLM
  const jdKeywords = useMemo(() => getJdKeywords(jdContext), [jdContext]);

  // 简历命中文本 = v2 bullets(含已采纳的修改)+ 技能 + 技术栈 + 课程,拼成一段
  const resumeMatchText = useMemo(() => {
    if (!parsedResume) return "";
    const acceptedById = new Map<string, string>();
    if (data) {
      for (const e of data.edits) {
        if (decisions[e.id] === "accept" && e.category !== "gap-alert") {
          acceptedById.set(e.original_text, rewritten[e.id] ?? e.suggested_text);
        }
      }
    }
    const parts: string[] = [];
    const sections: Array<keyof NonNullable<ParsedResume>> = [
      "experience",
      "projects",
      "activities",
    ];
    for (const sec of sections) {
      const arr = (parsedResume as Record<string, unknown>)?.[sec];
      if (!Array.isArray(arr)) continue;
      for (const it of arr) {
        if (sec === "experience") {
          const exp = it as { org?: string; role?: string; period?: string };
          if (exp.org) parts.push(exp.org);
          if (exp.role) parts.push(exp.role);
          if (exp.period) parts.push(exp.period);
        }
        if (sec === "projects") {
          const proj = it as { name?: string; role?: string; period?: string };
          if (proj.name) parts.push(proj.name);
          if (proj.role) parts.push(proj.role);
          if (proj.period) parts.push(proj.period);
        }
        if (sec === "activities") {
          const act = it as { org?: string; role?: string; period?: string };
          if (act.org) parts.push(act.org);
          if (act.role) parts.push(act.role);
          if (act.period) parts.push(act.period);
        }
        const bs = (it as { bullets?: Array<string | { text?: string }> })?.bullets;
        if (!Array.isArray(bs)) continue;
        for (const b of bs) {
          const t = typeof b === "string" ? b : b?.text ?? "";
          if (t) parts.push(acceptedById.get(t) ?? t);
        }
      }
    }
    // 技能(动态分类,含证书/软技能/语言 — 兼容新老数据)
    for (const g of skillGroupsOf(parsedResume)) {
      parts.push(`${g.category}: ${g.items.join("、")}`);
    }
    if (Array.isArray(parsedResume.projects)) {
      for (const p of parsedResume.projects) {
        const ts = (p as { tech_stack?: string[] })?.tech_stack;
        if (Array.isArray(ts)) parts.push(ts.join("、"));
      }
    }
    if (Array.isArray(parsedResume.education)) {
      for (const e of parsedResume.education) {
        if (e.school) parts.push(e.school);
        if (e.major) parts.push(e.major);
        if (e.degree) parts.push(e.degree);
        if (e.research_direction) parts.push(e.research_direction);
        if (Array.isArray(e.courses)) parts.push(e.courses.join("、"));
        if (Array.isArray(e.awards)) parts.push(e.awards.join("、"));
      }
    }
    if (parsedResume.basic?.major) parts.push(parsedResume.basic.major);
    if (parsedResume.basic?.school) parts.push(parsedResume.basic.school);
    return parts.join("\n");
  }, [parsedResume, data, decisions, rewritten]);

  // 子串保底匹配(硬技能/字面词,确定性)
  const substringMatch = useMemo(
    () => matchKeywords(jdKeywords, resumeMatchText),
    [jdKeywords, resumeMatchText]
  );

  // LLM 语义命中缓存 key(按 简历+JD 内容,稳定;一次算好缓存,刷新不重算)
  const kwCacheKey = `m3_kwmatch_${convId ?? "guest"}_${contentSig}`;

  // LLM 语义关键词命中(读简历全文 + 证据约束)— 补子串抓不到的能力/职责类词
  const loadKeywordMatch = useCallback(async () => {
    if (jdKeywords.length === 0 || !resumeMatchText) return;
    const cached = readArtifact<{
      sig: string;
      results: { keyword: string; hit: boolean; evidence: string }[];
    }>("keyword_match_json", kwCacheKey);
    if (cached?.results && cached.sig === contentSig) {
      setLlmKwResults(cached.results);
      return;
    }
    setKwMatchLoading(true);
    // LLM 语义命中是关键词卡的"灵魂"(子串只能抓 7/18,语义能抓 17/18)。
    // 这个调用 ~10s,偶发超时/502 会让卡片退化成子串保底,看起来像"匹配很差"。
    // → 重试 3 次(指数退避),全失败才退回子串,避免把"调用挂了"误判成"简历不匹配"。
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch("/api/m3/match-keywords", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jdKeywords, resumeText: resumeMatchText }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          results?: { keyword: string; hit: boolean; evidence: string }[];
        };
        const results = Array.isArray(json.results) ? json.results : [];
        if (results.length === 0) throw new Error("empty results");
        setLlmKwResults(results);
        writeArtifact("keyword_match_json", kwCacheKey, { sig: contentSig, results });
        setKwMatchLoading(false);
        return;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    console.error("[loadKeywordMatch] 3 次全失败,退回子串保底:", lastErr);
    setLlmKwResults([]); // 全失败 → 退回子串,不卡在"分析中"
    setKwMatchLoading(false);
  }, [jdKeywords, resumeMatchText, kwCacheKey, contentSig, readArtifact, writeArtifact]);

  // 一拿到简历 + JD 关键词就并行跑语义命中(不等 suggest-edits,消除 11→15 的长延迟)
  useEffect(() => {
    if (
      !dbLoading &&
      jdKeywords.length > 0 &&
      resumeMatchText &&
      llmKwResults === null &&
      !kwMatchLoading
    ) {
      loadKeywordMatch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading, jdKeywords, resumeMatchText]);

  // === 核心技能自然语句改写(合并采纳的补强)===
  const acceptedFillSentences = useMemo(
    () => Object.values(keywordFills).filter((f) => f.accepted).map((f) => f.suggestion),
    [keywordFills],
  );
  const skillsCacheKey = `m3_skills_${convId ?? "guest"}_${contentSig}_${cheapSig(JSON.stringify(acceptedFillSentences))}`;
  const loadSkillsSummary = useCallback(async () => {
    const groups = skillGroupsOf(parsedResume);
    if (groups.length === 0 && acceptedFillSentences.length === 0) {
      setSkillsSummary([]);
      return;
    }
    try {
      const c = window.localStorage.getItem(skillsCacheKey);
      if (c) {
        setSkillsSummary(JSON.parse(c) as string[]);
        return;
      }
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch("/api/m3/skills-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillGroups: groups, fills: acceptedFillSentences }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { lines?: string[] };
      const lines = Array.isArray(json.lines) ? json.lines : [];
      setSkillsSummary(lines);
      try {
        window.localStorage.setItem(skillsCacheKey, JSON.stringify(lines));
      } catch {
        /* quota */
      }
    } catch (err) {
      console.error("[skills-summary] failed:", err);
      setSkillsSummary([]); // 失败 → 空,前端回退分类列表
    }
  }, [parsedResume, acceptedFillSentences, skillsCacheKey]);

  // 内容/补强变 → 重置重算
  useEffect(() => {
    setSkillsSummary(null);
  }, [skillsCacheKey]);
  // 数据就绪后生成(只在 null 时跑)
  useEffect(() => {
    if (!dbLoading && status === "ready" && parsedResume && skillsSummary === null) {
      loadSkillsSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbLoading, status, parsedResume, skillsSummary]);

  // 合并:LLM 语义命中 ∪ 子串命中(子串=硬技能保底);证据取 LLM 原句
  const { matchedKeywords, missingKeywords, evidenceMap } = useMemo(() => {
    const substringHit = new Set(substringMatch.matched.map((k) => k.toLowerCase()));
    const llmHit = new Set(
      (llmKwResults ?? []).filter((r) => r.hit).map((r) => r.keyword.toLowerCase()),
    );
    const ev: Record<string, string> = {};
    for (const r of llmKwResults ?? []) {
      if (r.hit && r.evidence) ev[r.keyword.toLowerCase()] = r.evidence;
    }
    // 用户在缺口里"会用/略懂"并采纳了补法 → 强制命中,证据用补法原句
    const filledHit = new Set<string>();
    for (const [kw, f] of Object.entries(keywordFills)) {
      if (f.accepted) {
        const lc = kw.toLowerCase();
        filledHit.add(lc);
        ev[lc] = `你补充(${f.level === "can" ? "会用" : "略懂"}):${f.suggestion}`;
      }
    }
    const matched: string[] = [];
    const missing: string[] = [];
    for (const kw of jdKeywords) {
      const lc = kw.toLowerCase();
      if (llmHit.has(lc) || substringHit.has(lc) || filledHit.has(lc)) {
        matched.push(kw);
        if (!ev[lc] && substringHit.has(lc)) ev[lc] = "简历技能 / 经历中直接提及";
      } else {
        missing.push(kw);
      }
    }
    return { matchedKeywords: matched, missingKeywords: missing, evidenceMap: ev };
  }, [jdKeywords, substringMatch, llmKwResults, keywordFills]);

  // ⚡ SR 待确认数量(有 sr_question 且未回答)
  const srPendingCount = useMemo(() => {
    if (!data) return 0;
    return data.edits.filter((e) => e.sr_question != null && !srAnswers[e.id]).length;
  }, [data, srAnswers]);

  // V3 评分大卡数据(综合 0-100 + 4 维度 + delta + 改造 tags)
  const dashboardData = useMemo<M3DashboardData>(() => {
    const matchedKeywordsCount = matchedKeywords.length;
    const totalKeywordsCount = jdKeywords.length;
    const keywordsCoveragePct =
      totalKeywordsCount > 0
        ? (matchedKeywordsCount / totalKeywordsCount) * 100
        : 60; // 没 JD 关键词时 60% baseline

    const jdMatchPct = llmMetrics?.hard_req_total
      ? ((llmMetrics.hard_req_v2_aligned ?? 0) / llmMetrics.hard_req_total) * 100
      : keywordsCoveragePct; // fallback 用关键词覆盖度

    // 结构完整度 = 简历关键板块齐全度(确定性,不靠 LLM)
    // 修:旧版量"每条 bullet 的 STAR 齐全度",名实不符 + 太严 + AI 改完还掉分。
    // 改成量板块(个人信息/教育/经历/项目/技能)—— 完整简历≈满分,优化后稳定不掉。
    const structurePct = (() => {
      if (!parsedResume) return 65;
      const pr = parsedResume as Record<string, unknown>;
      const nonEmptyArr = (v: unknown) => Array.isArray(v) && v.length > 0;
      const basic = pr.basic as { name?: unknown; major?: unknown; school?: unknown } | undefined;
      const sections = [
        !!(basic?.name || basic?.major || basic?.school), // 个人信息
        nonEmptyArr(pr.education), // 教育背景
        nonEmptyArr(pr.experience) || nonEmptyArr(pr.activities), // 实习/工作/活动经历
        nonEmptyArr(pr.projects), // 项目/科研
        skillGroupsOf(parsedResume).length > 0, // 技能
      ];
      const present = sections.filter(Boolean).length;
      return Math.round((present / sections.length) * 100);
    })();

    // 成果表达清晰度:基于 acceptedCount / 总 bullet 数
    let totalBullets = 0;
    if (parsedResume) {
      const sections: Array<keyof NonNullable<ParsedResume>> = [
        "experience",
        "projects",
        "activities",
        "self_eval",
      ];
      for (const sec of sections) {
        const arr = (parsedResume as Record<string, unknown>)?.[sec];
        if (Array.isArray(arr)) {
          for (const it of arr) {
            const bs = (it as { bullets?: unknown[] })?.bullets;
            if (Array.isArray(bs)) totalBullets += bs.length;
          }
        }
      }
    }
    const achievementPct =
      totalBullets > 0
        ? Math.min(95, 50 + (acceptedCount / totalBullets) * 50)
        : 70;

    // 综合评分:4 维度加权平均
    const totalScore = Math.round(
      jdMatchPct * 0.3 +
        keywordsCoveragePct * 0.3 +
        structurePct * 0.2 +
        achievementPct * 0.2,
    );

    // delta 估算:v2 - v1 主要靠 STAR + hard_req 提升
    let delta = acceptedCount * 2; // fallback
    if (llmMetrics) {
      const starGain =
        (llmMetrics.star_complete_v2?.complete ?? 0) -
        (llmMetrics.star_complete_v1?.complete ?? 0);
      const hardGain =
        (llmMetrics.hard_req_v2_aligned ?? 0) -
        (llmMetrics.hard_req_v1_aligned ?? 0);
      delta = Math.max(acceptedCount, Math.round(starGain * 3 + hardGain * 5 + acceptedCount * 2));
    }

    // improveTags:基于 edit 分布选 1-3 个有代表性的 tag
    const cats = new Set<string>();
    if (data) {
      for (const e of data.edits) {
        if (decisions[e.id] === "accept") cats.add(e.category);
      }
    }
    const improveTags: string[] = [];
    if (cats.has("ats-keyword") || cats.has("narrative-tools")) improveTags.push("关键词补强");
    if (cats.has("quantification") || cats.has("tech-deepening"))
      improveTags.push("成果表达增强");
    if (cats.has("section-reorder")) improveTags.push("结构更完整");
    if (improveTags.length === 0 && acceptedCount > 0) improveTags.push("表述更精炼");

    return {
      totalScore: Math.max(0, Math.min(100, totalScore)),
      delta: Math.max(0, delta),
      acceptedCount,
      pendingCount: pendingFillEdits.length,
      jdMatchPct,
      keywordsCoveragePct,
      structurePct,
      achievementPct,
      improveTags,
      loading: llmMetricsRefreshing && !llmMetrics,
    };
  }, [
    matchedKeywords,
    jdKeywords,
    llmMetrics,
    llmMetricsRefreshing,
    parsedResume,
    acceptedCount,
    data,
    decisions,
    pendingFillEdits.length,
  ]);

  function handleFillBlank(editId: string, filledText: string) {
    setRewritten((r) => ({ ...r, [editId]: filledText }));
    // 一条可能有多个【请补充X】。只有【全部填完】才自动采纳;
    // 还有剩余占位符 → 保持待确认,让用户继续填下一个,别让卡片提前提交消失。
    if (!/【请补充/.test(filledText)) {
      setDecisions((d) => ({ ...d, [editId]: "accept" }));
    }
  }

  // ===== 关键词缺口闭环 =====
  // 选"会用/略懂" → 生成补法;选"不会" → 不生成(UI 给补项目入口)
  async function handleKeywordRespond(kw: string, resp: "can" | "vague" | "no") {
    setKeywordResponses((r) => ({ ...r, [kw]: resp }));
    if (resp === "no") {
      // 真缺口:清掉可能存在的旧补法,UI 显示"去补项目"
      setKeywordFills((f) => {
        const next = { ...f };
        delete next[kw];
        return next;
      });
      return;
    }
    // 会用/略懂 → 生成可落地的补法
    setKeywordFillLoading((l) => ({ ...l, [kw]: true }));
    try {
      const res = await fetch("/api/m3/fill-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: kw,
          level: resp,
          resumeText: resumeMatchText,
          jdContext: jdContext ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { suggestion?: string; where?: string };
      if (json.suggestion) {
        setKeywordFills((f) => ({
          ...f,
          [kw]: { level: resp, suggestion: json.suggestion!, where: json.where ?? "技能区", accepted: false },
        }));
      }
    } catch (err) {
      console.error("[fill-keyword] failed:", err);
    } finally {
      setKeywordFillLoading((l) => ({ ...l, [kw]: false }));
    }
  }

  function handleAcceptKeywordFill(kw: string) {
    setKeywordFills((f) => (f[kw] ? { ...f, [kw]: { ...f[kw], accepted: true } } : f));
  }
  function handleIgnoreKeywordFill(kw: string) {
    setKeywordFills((f) => {
      const next = { ...f };
      delete next[kw];
      return next;
    });
  }
  // 用户自己改补法文本
  function handleEditKeywordFill(kw: string, text: string) {
    setKeywordFills((f) => (f[kw] ? { ...f, [kw]: { ...f[kw], suggestion: text } } : f));
  }
  // 用户跟 AI 说怎么改(例:会用 Figma 但不会 Axure)→ 据反馈重写
  async function handleRefineKeywordFill(kw: string, instruction: string) {
    const cur = keywordFills[kw];
    if (!cur || !instruction.trim()) return;
    setKeywordFillLoading((l) => ({ ...l, [kw]: true }));
    try {
      const res = await fetch("/api/m3/fill-keyword", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: kw,
          level: cur.level,
          resumeText: resumeMatchText,
          jdContext: jdContext ?? null,
          instruction: instruction.trim(),
          previous: cur.suggestion,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { suggestion?: string; where?: string };
      if (json.suggestion) {
        setKeywordFills((f) =>
          f[kw]
            ? { ...f, [kw]: { ...f[kw], suggestion: json.suggestion!, where: json.where ?? f[kw].where } }
            : f,
        );
      }
    } catch (err) {
      console.error("[fill-keyword refine] failed:", err);
    } finally {
      setKeywordFillLoading((l) => ({ ...l, [kw]: false }));
    }
  }

  // ===== Tab2 简历对比:逐条 accept / reject / 自己改 / 换写法 =====
  function handleAccept(editId: string) {
    setDecisions((d) => ({ ...d, [editId]: "accept" }));
  }
  function handleReject(editId: string, reason: RejectReason) {
    setDecisions((d) => ({ ...d, [editId]: "reject" }));
    setRejectReasons((r) => ({ ...r, [editId]: reason }));
  }
  function handleCustomEdit(editId: string, text: string) {
    setRewritten((r) => ({ ...r, [editId]: text }));
    setDecisions((d) => ({ ...d, [editId]: "accept" }));
  }
  // 卡片里内联填占位符:边填边存草稿(只写 rewritten,不自动采纳)→ 用户填完一起点「采纳」
  function handleDraftRewrite(editId: string, text: string) {
    setRewritten((r) => ({ ...r, [editId]: text }));
  }
  // 已决策后来回切换(改回原文 / 改用建议),不弹 popover
  function handleRevert(editId: string, to: Decision) {
    setDecisions((d) => ({ ...d, [editId]: to }));
  }
  async function handleRegen(editId: string) {
    if (!data) return;
    const target = data.edits.find((e) => e.id === editId);
    if (!target) return;
    setRegenBusyId(editId);
    try {
      const res = await fetch("/api/m3/refine-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "regen",
          edit: target,
          parsedResume,
          jdContext: jdContext ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { edit?: Partial<EditSuggestion> };
      if (json.edit && json.edit.suggested_text) {
        setData((d) =>
          d
            ? {
                ...d,
                edits: d.edits.map((e) =>
                  e.id === editId ? { ...e, ...json.edit, id: e.id, target: e.target } : e,
                ),
              }
            : d,
        );
        // 清掉旧的填空,避免和新文案冲突
        setRewritten((r) => {
          const n = { ...r };
          delete n[editId];
          return n;
        });
      }
    } catch (err) {
      console.error("[handleRegen] failed:", err);
    } finally {
      setRegenBusyId(null);
    }
  }

  // ===== "跟 AI 再改" chat 真功能(决策 3)=====
  async function handleChatRefine() {
    if (!data || !chatInput.trim() || chatBusy) return;
    const instruction = chatInput.trim();
    setChatMsgs((m) => [...m, { role: "user", text: instruction }]);
    setChatInput("");
    setChatBusy(true);
    // 单条聚焦:只把目标 edit 给后端,AI 只改这一条
    const target = chatTargetEditId
      ? data.edits.find((e) => e.id === chatTargetEditId)
      : null;
    try {
      const res = await fetch("/api/m3/refine-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "instruct",
          instruction: target
            ? `只修改这一条建议(id=${target.id}),不要新增其他条。${instruction}`
            : instruction,
          edits: target ? [target] : data.edits,
          parsedResume,
          jdContext: jdContext ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { edits?: EditSuggestion[]; reply?: string };
      if (Array.isArray(json.edits) && json.edits.length > 0) {
        setData((d) => {
          if (!d) return d;
          const map = new Map(d.edits.map((e) => [e.id, e]));
          for (const ne of json.edits!) {
            const prev = map.get(ne.id);
            map.set(ne.id, prev ? { ...prev, ...ne } : ne);
          }
          return { ...d, edits: Array.from(map.values()) };
        });
        setChatMsgs((m) => [
          ...m,
          { role: "ai", text: json.reply ?? `好,已更新 ${json.edits!.length} 处建议,去「简历对比」看看。` },
        ]);
      } else {
        setChatMsgs((m) => [
          ...m,
          { role: "ai", text: json.reply ?? "我没找到合适的可改之处,换个更具体的说法?(eg 指明哪段、想怎么改)" },
        ]);
      }
    } catch (err) {
      console.error("[handleChatRefine] failed:", err);
      setChatMsgs((m) => [...m, { role: "ai", text: "出错了,稍后再试一次。" }]);
    } finally {
      setChatBusy(false);
    }
  }

  // Tab2 完整建议卡(4 组共用,避免重复 props)
  function renderEditCard(edit: EditSuggestion) {
    return (
      <EditSuggestionCard
        key={edit.id}
        edit={edit}
        decision={decisions[edit.id] ?? null}
        rewrittenText={rewritten[edit.id]}
        onAccept={() => handleAccept(edit.id)}
        onReject={(reason) => handleReject(edit.id, reason)}
        onRegen={() => handleRegen(edit.id)}
        onCustomEdit={(text) => handleCustomEdit(edit.id, text)}
        onFillPlaceholder={(text) => handleDraftRewrite(edit.id, text)}
        onRevert={(to) => handleRevert(edit.id, to)}
        onTalkToAI={() =>
          setChatTargetEditId((cur) => (cur === edit.id ? null : edit.id))
        }
        talkActive={chatTargetEditId === edit.id}
        srAnswer={srAnswers[edit.id]}
        onSrAnswer={(opt) => setSrAnswers((a) => ({ ...a, [edit.id]: opt }))}
        regenBusy={regenBusyId === edit.id}
      />
    );
  }

  // 登录用户 DB 还在 fetch → 显示 loading,别闪 "还没读到你的简历"
  // convId 存在但数据未就绪(含 auth 解析中)→ 显示读取,避免先用 localStorage 旧数据渲染再切(闪烁)
  if (convId && dbLoading) {
    return (
      <>
        <div className="max-w-[600px] mx-auto px-6 py-20 text-center">
          <div className="inline-block animate-spin w-8 h-8 border-2 border-esther-blue border-t-transparent rounded-full mb-4" />
          <p className="text-sm text-ink-soft">正在读取你的简历…</p>
        </div>
      </>
    );
  }

  if (!parsedResume) {
    return (
      <div className="flex items-center justify-center p-6 py-20">
        <Card className="p-6 max-w-md">
          <p className="text-sm text-ink mb-3">⚠️ 还没读到你的简历,正在回到上传页…</p>
          <Link
            href={`/m3${convQs}`}
            className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
          >
            ← 回 Step 1 上传简历
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <>
        {/* Loading 中 → V2 stepper(参考竞品 — 显示 AI 思考过程,不再"AI 正在分析…"一句话)*/}
        {status === "loading" && <M3OptimizationStepper ready={false} />}

        {/* Error */}
        {status === "error" && (
          <div className="max-w-[600px] mx-auto px-6 py-20">
            <Card className="p-6 border-2 border-esther-red/30 bg-esther-red/5">
              <p className="text-sm text-esther-red mb-3">⚠️ {errorMsg}</p>
              <button
                onClick={() => loadSuggestions(true)}
                className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                重试 →
              </button>
            </Card>
          </div>
        )}

        {/* Ready — V3 左对话 + 右简历 */}
        {status === "ready" && data && (
          <>
            {/* 顶部 sticky 工具栏(返回 + 状态 + 下载)*/}
            <section className="sticky top-20 z-30 bg-warm-bg/95 backdrop-blur-sm border-b border-border shadow-sm">
              <div className="max-w-[1320px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <Link
                    href={`/m3${convQs}`}
                    className="text-ink-soft hover:text-esther-blue text-xs flex-shrink-0"
                  >
                    ← 改简历 / JD
                  </Link>
                  {(acceptedCount > 0 || srPendingCount > 0) && (
                    <span className="text-xs text-ink-soft truncate">
                      {acceptedCount > 0 && `✓ AI 已改 ${acceptedCount} 处`}
                      {acceptedCount > 0 && srPendingCount > 0 && " | "}
                      {srPendingCount > 0 && (
                        <span className="text-amber-600">⚡ {srPendingCount} 处待你确认</span>
                      )}
                    </span>
                  )}
                </div>
                <button
                  onClick={handleDownload}
                  disabled={downloading}
                  className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {downloading ? "生成中..." : "📥 导出 Word"}
                </button>
              </div>
            </section>

            {/* 吸顶栏以下整块按 0.9 缩放 —— 复刻用户偏好的"90% 观感",固定宽度内容获得更多留白,
                不缩吸顶栏避免与全局导航错位 */}
            <div style={{ zoom: 0.9 }}>

            {/* V3 评分大卡(照抄竞品)*/}
            <div className="max-w-[1320px] mx-auto px-6 pt-4">
              <M3ScoreDashboard data={dashboardData} />
            </div>

            {/* placeholder_mode 提示(M6 → M3 没拿到 JD 全文)*/}
            {jdContext?.placeholder_mode && (
              <div className="max-w-[1320px] mx-auto px-6 pt-4">
                <div className="leading-relaxed bg-esther-yellow/15 border border-esther-yellow/50 rounded-md px-3 py-2">
                  <p className="text-xs text-ink">
                    ⚠️ <strong>岗位摘要模式</strong>:当前 JD 全文未能从 M6 抓到,仅基于
                    <span className="font-medium">
                      {" "}
                      {jdContext.role_name ?? "(岗位名)"}
                      {jdContext.company ? ` @ ${jdContext.company}` : ""}{" "}
                    </span>
                    做岗位推断。建议回 M6 复制完整 JD 重做一次。
                  </p>
                </div>
              </div>
            )}

            {/* 4-tab 切换条 */}
            <div className="max-w-[1320px] mx-auto px-6 pt-4">
              <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
                {([
                  ["match", "🎯 岗位匹配"],
                  ["diff", "🔀 简历对比"],
                  ["resume", "📄 简历中心"],
                  ["interview", "🎤 面试准备"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                      activeTab === key
                        ? "border-esther-blue text-esther-blue"
                        : "border-transparent text-ink-soft hover:text-ink"
                    }`}
                  >
                    {label}
                    {key === "diff" && data.edits.length > 0 && (
                      <span className="ml-1 text-[10px] text-ink-muted">({data.edits.length})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 内容区 */}
            <div className="max-w-[1320px] mx-auto px-6 py-5">
              {/* ===== Tab 1: 岗位匹配 ===== */}
              {activeTab === "match" && (
                <div className="space-y-6">
                  <KeywordHitChips
                    jdKeywords={jdKeywords}
                    matchedKeywords={matchedKeywords}
                    evidenceMap={evidenceMap}
                    gaps={(jdContext as { gaps?: { jd_requirement?: string; why_gap?: string; fixable?: string }[] })?.gaps ?? []}
                    loading={jdKeywords.length > 0 && llmKwResults === null}
                  />

                  {/* 原始简历问题总结 */}
                  {data.original_issues && data.original_issues.length > 0 && (
                    <Card className="p-6">
                      <h3 className="text-base font-semibold text-ink mb-3 flex items-center gap-1.5">
                        <span className="text-esther-red">⚠️</span> 原始简历问题总结
                      </h3>
                      <ol className="space-y-2.5">
                        {data.original_issues.map((issue, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-ink-soft leading-relaxed">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-esther-red/10 text-esther-red text-xs flex items-center justify-center font-medium">
                              {i + 1}
                            </span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ol>
                    </Card>
                  )}

                  {/* 核心优化方向 */}
                  {data.optimization_directions && data.optimization_directions.length > 0 && (
                    <Card className="p-6">
                      <h3 className="text-base font-semibold text-ink mb-3 flex items-center gap-1.5">
                        <span className="text-esther-blue">🎯</span> 核心优化方向
                      </h3>
                      <ol className="space-y-2.5">
                        {data.optimization_directions.map((dir, i) => (
                          <li key={i} className="flex gap-2.5 text-sm text-ink-soft leading-relaxed">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-esther-blue/10 text-esther-blue text-xs flex items-center justify-center font-medium">
                              {i + 1}
                            </span>
                            <span>{dir}</span>
                          </li>
                        ))}
                      </ol>
                      <p className="text-xs text-ink-muted mt-3 pt-3 border-t border-border">
                        💡 大部分方向 AI 已在「简历对比」里给了具体改法,去采纳即可。
                      </p>
                    </Card>
                  )}

                  {/* 缺失关键词技能自评 */}
                  {missingKeywords.length > 0 && (
                    <KeywordGapSection
                      keywords={missingKeywords}
                      responses={keywordResponses}
                      fills={keywordFills}
                      fillLoading={keywordFillLoading}
                      onRespond={handleKeywordRespond}
                      onAcceptFill={handleAcceptKeywordFill}
                      onIgnoreFill={handleIgnoreKeywordFill}
                      onEditFill={handleEditKeywordFill}
                      onRefineFill={handleRefineKeywordFill}
                      convQs={convQs}
                    />
                  )}
                </div>
              )}

              {/* ===== Tab 2: 简历对比 ===== */}
              {activeTab === "diff" && (
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
                  {/* 对比列表 — 按"你要做什么"分 4 组 */}
                  <div className="min-w-0">
                    {backfillCtx && (
                      <Card className="mb-3 p-3 border-2 border-purple-500/40 bg-purple-500/5">
                        <p className="text-[11px] font-medium text-purple-700 mb-1">
                          🎤 刚从模拟面试复盘采纳 — 已加进这份简历
                        </p>
                        <p className="text-xs text-ink-soft leading-relaxed">
                          你在{backfillCtx.question ? `「${backfillCtx.question.slice(0, 24)}」` : "面试"}里说:
                          <span className="text-ink">“{backfillCtx.excerpt.slice(0, 60)}”</span>
                          <br />下面 AI 已把它落到对应内容,点「采纳」即写进简历。
                        </p>
                      </Card>
                    )}
                    <p className="text-sm text-ink-soft mb-3">
                      共 <span className="font-semibold text-ink">{data.edits.length}</span> 处建议 ·
                      按「你要做什么」分组
                    </p>
                    {data.edits.length === 0 ? (
                      <Card className="p-6 text-center text-sm text-ink-muted">
                        现有简历针对该 JD 已经不错,没有必须改的地方。
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        {/* ✅ 已改好(默认折叠 + 紧凑一行)*/}
                        {editGroups.done.length > 0 && (
                          <div>
                            <button
                              onClick={() => setAcceptedCollapsed((v) => !v)}
                              className="w-full flex items-center justify-between mb-2 text-left"
                            >
                              <span className="text-sm font-semibold text-ink">
                                ✅ AI 已帮你改好（{editGroups.done.length}）
                                <span className="ml-1 text-xs font-normal text-ink-muted">低风险已自动采纳,扫一眼就行</span>
                              </span>
                              <span className="text-xs text-ink-muted">{acceptedCollapsed ? "▾ 展开" : "▴ 收起"}</span>
                            </button>
                            {!acceptedCollapsed && (
                              <div className="space-y-3">
                                {editGroups.done.map(renderEditCard)}
                              </div>
                            )}
                          </div>
                        )}

                        {/* 🟡 待你确认 */}
                        {editGroups.confirm.length > 0 && (
                          <div>
                            <p className="text-sm font-semibold text-ink mb-2">
                              🟡 待你确认（{editGroups.confirm.length}）
                              <span className="ml-1 text-xs font-normal text-ink-muted">AI 推断的,你点头才进简历</span>
                            </p>
                            <div className="space-y-2.5">{editGroups.confirm.map(renderEditCard)}</div>
                          </div>
                        )}

                        {/* ✏️ 待你补信息 */}
                        {editGroups.needFill.length > 0 && (
                          <div>
                            <p className="text-sm font-semibold text-ink mb-2">
                              ✏️ 待你补信息（{editGroups.needFill.length}）
                              <span className="ml-1 text-xs font-normal text-ink-muted">在黄色框里直接填数字,填完点「采纳」 · AI 不替你编</span>
                            </p>
                            <div className="space-y-2.5">{editGroups.needFill.map(renderEditCard)}</div>
                          </div>
                        )}

                        {/* 🎯 缺口待补 — 读实时未命中关键词(已命中/已补强自动剔除);全补完则不显示 */}
                        {missingKeywords.length > 0 && (
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                            <p className="text-sm font-semibold text-amber-700 mb-1">
                              🎯 还有 {missingKeywords.length} 个 JD 缺口(简历里没体现)
                            </p>
                            <p className="text-sm text-ink-soft mb-2">{missingKeywords.join("、")}</p>
                            <button
                              type="button"
                              onClick={() => setActiveTab("match")}
                              className="text-sm text-esther-blue hover:underline"
                            >
                              → 去「岗位匹配」处理:勾「会用 / 略懂」,AI 帮你真实补进简历
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 右侧:跟 AI 再改 chat(真功能)*/}
                  <aside className="lg:sticky lg:top-32 lg:self-start lg:max-h-[calc(100vh-9rem)] flex flex-col">
                    <Card className="p-4 flex-1 flex flex-col bg-card min-h-[340px] rounded-2xl border-esther-blue/15 shadow-sm">
                      {/* header */}
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-border/60">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-esther-blue/12 text-sm flex-shrink-0">
                          💬
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="text-sm font-semibold text-ink">跟 AI 再改</p>
                          <p className="font-display italic text-[10px] text-esther-blue/70">Chat with AI</p>
                        </div>
                      </div>
                      {chatTargetEditId ? (
                        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-esther-yellow/30 px-2.5 py-1.5">
                          <span className="text-xs text-ink leading-snug">
                            正在只改 <span className="font-mono">{chatTargetEditId}</span> 这一条
                          </span>
                          <button
                            onClick={() => setChatTargetEditId(null)}
                            className="text-xs text-ink-soft hover:text-ink flex-shrink-0"
                          >
                            ✕ 改全部
                          </button>
                        </div>
                      ) : (
                        <p className="text-xs text-ink-soft leading-relaxed mb-3">
                          想换写法 / 补关键词 / 加技术深度,直接说;也可点某条上的「💬 改这条」单独改。AI 不会编造你没有的经历。
                        </p>
                      )}
                      <div className="flex-1 overflow-y-auto space-y-2 mb-3 min-h-[90px]">
                        {chatMsgs.length === 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {["把项目经历改得更技术", "这条加上 SQL", "实习那段突出量化成果"].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setChatInput(s)}
                                className="text-[11px] px-2 py-1 rounded-full border border-border/70 bg-warm-bg-deep/40 text-ink-soft hover:bg-esther-blue/10 hover:text-esther-blue hover:border-esther-blue/30 transition-colors"
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        )}
                        {chatMsgs.map((m, i) => (
                          <div
                            key={i}
                            className={`text-xs leading-relaxed rounded-2xl px-3 py-1.5 ${
                              m.role === "user"
                                ? "bg-esther-blue/10 text-ink ml-6 rounded-br-sm"
                                : "bg-warm-bg-deep/50 text-ink-soft mr-6 rounded-bl-sm"
                            }`}
                          >
                            {m.text}
                          </div>
                        ))}
                        {chatBusy && (
                          <div className="text-xs text-ink-muted bg-warm-bg-deep/50 rounded-2xl rounded-bl-sm px-3 py-1.5 mr-6">
                            AI 思考中…
                          </div>
                        )}
                      </div>
                      <div className="mt-auto">
                        <textarea
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              e.preventDefault();
                              handleChatRefine();
                            }
                          }}
                          rows={2}
                          placeholder="想怎么改,告诉我…(⌘/Ctrl+Enter 发送)"
                          className="w-full px-3 py-2 rounded-xl border border-border bg-white text-xs text-ink leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-esther-blue/40 focus:border-esther-blue/40 transition-colors"
                        />
                        <button
                          onClick={handleChatRefine}
                          disabled={chatBusy || !chatInput.trim()}
                          className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded-xl bg-esther-blue text-white px-4 py-2 text-xs font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {chatBusy ? "处理中…" : "发送 ↵"}
                        </button>
                      </div>
                    </Card>
                  </aside>
                </div>
              )}

              {/* ===== Tab 3: 简历中心 ===== */}
              {activeTab === "resume" && (
                <div>
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <p className="text-sm text-ink-soft">
                      优化后简历(已反映你采纳的 {acceptedCount} 处改动)
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleCopyText}
                        disabled={copyingText}
                        className="inline-flex items-center justify-center rounded-full border border-border bg-card text-ink-soft px-4 py-1.5 text-xs font-medium hover:border-esther-blue hover:text-esther-blue transition-colors disabled:opacity-40"
                      >
                        {copied ? "✓ 已复制" : copyingText ? "生成中…" : "📋 一键复制纯文本"}
                      </button>
                      <button
                        onClick={handleDownload}
                        disabled={downloading}
                        className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-4 py-1.5 text-xs font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40"
                      >
                        {downloading ? "生成中…" : "📥 下载 Word"}
                      </button>
                    </div>
                  </div>
                  <Card className="p-8 md:p-10 bg-white shadow-sm border-border">
                    <ResumePreview
                      parsedResume={parsedResume}
                      edits={data.edits}
                      decisions={decisions}
                      rewritten={rewritten}
                      keywordFills={keywordFills}
                      skillsSummary={skillsSummary}
                      onFillBlank={handleFillBlank}
                      hoveredEditId={hoveredEditId}
                      onHoverEdit={setHoveredEditId}
                      jdContext={jdContext}
                      srOpenEditId={srOpenEditId}
                      onSrOpen={setSrOpenEditId}
                      srAnswers={srAnswers}
                      onSrAnswer={(editId, option) => {
                        setSrAnswers((a) => ({ ...a, [editId]: option }));
                        setSrOpenEditId(null);
                      }}
                    />
                  </Card>
                  {fromDebriefHighlight && (
                    <Card className="mt-4 p-3 border-2 border-purple-500/30 bg-purple-500/5">
                      <p className="text-[11px] text-purple-700 leading-relaxed">
                        💡 已读到模块 5 面试复盘高价值答案,AI 已优先整理成简历里的
                        <span className="font-medium ml-1">来自面试回写</span>建议。
                      </p>
                    </Card>
                  )}
                </div>
              )}

              {/* ===== Tab 4: 面试准备 ===== */}
              {activeTab === "interview" && (
                <InterviewPrepTab
                  prep={interviewPrep}
                  loading={interviewPrepLoading}
                  error={interviewPrepError}
                  onReload={() => loadInterviewPrep(true)}
                  convQs={convQs}
                />
              )}
            </div>
            </div>
          </>
        )}

        <BuerFloatingButton />
    </>
  );
}

// ============ Resume Preview V2 — word-style + 【请补充】点击填值 ============

const FILL_RE = /【(请补充[^】]*?)】/g;

/**
 * 把 bullet 文本里的【请补充 X】拆成 text fragment + clickable blank,
 * 用户点击 blank → 弹小 input 替换那段【...】写回 rewritten。
 */
function BulletFillableText({
  text,
  editId,
  onFillBlank,
}: {
  text: string;
  editId: string | null;
  onFillBlank?: (editId: string, filledText: string) => void;
}) {
  const [openBlankIdx, setOpenBlankIdx] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // 找到所有【请补充 ...】区域
  const parts: Array<{ kind: "text" | "blank"; value: string; idx?: number }> = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  let blankI = 0;
  const re = new RegExp(FILL_RE);
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ kind: "text", value: text.slice(lastIdx, m.index) });
    parts.push({ kind: "blank", value: m[1], idx: blankI++ });
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) parts.push({ kind: "text", value: text.slice(lastIdx) });

  function applyFill(idx: number, replacement: string) {
    if (!editId || !onFillBlank) return;
    // 把第 idx 个【请补充 ...】替换为 replacement
    let i = 0;
    const next = text.replace(FILL_RE, (full) => {
      const ret = i === idx ? replacement : full;
      i++;
      return ret;
    });
    onFillBlank(editId, next);
    setOpenBlankIdx(null);
    setInputVal("");
  }

  useEffect(() => {
    if (openBlankIdx !== null) inputRef.current?.focus();
  }, [openBlankIdx]);

  if (parts.length === 0) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "text") return <span key={i}>{p.value}</span>;
        const idx = p.idx!;
        if (openBlankIdx === idx) {
          return (
            <span key={i} className="inline-flex items-center gap-1 mx-0.5 align-middle">
              <input
                ref={inputRef}
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputVal.trim()) applyFill(idx, inputVal.trim());
                  else if (e.key === "Escape") {
                    setOpenBlankIdx(null);
                    setInputVal("");
                  }
                }}
                placeholder={p.value}
                className="px-1.5 py-0.5 rounded border border-esther-blue bg-white text-[12px] text-ink w-32 focus:outline-none focus:ring-1 focus:ring-esther-blue"
              />
              <button
                type="button"
                onClick={() => inputVal.trim() && applyFill(idx, inputVal.trim())}
                className="text-[10px] text-esther-blue hover:underline"
              >
                确认
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenBlankIdx(null);
                  setInputVal("");
                }}
                className="text-[10px] text-ink-muted hover:text-ink"
              >
                取消
              </button>
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={() => setOpenBlankIdx(idx)}
            disabled={!editId || !onFillBlank}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded bg-esther-yellow/40 hover:bg-esther-yellow/60 border border-esther-yellow text-[12px] text-ink font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            title="点击填具体数字"
          >
            ✎ {p.value}
          </button>
        );
      })}
    </>
  );
}

function ResumePreview({
  parsedResume,
  edits,
  decisions,
  rewritten,
  keywordFills,
  skillsSummary,
  onFillBlank,
  hoveredEditId,
  onHoverEdit,
  jdContext,
  srOpenEditId,
  onSrOpen,
  srAnswers,
  onSrAnswer,
}: {
  parsedResume: ParsedResume;
  edits: EditSuggestion[];
  decisions: DecisionsMap;
  rewritten: RewrittenMap;
  keywordFills?: Record<string, KeywordFillT>;
  skillsSummary?: string[] | null;
  onFillBlank?: (editId: string, filledText: string) => void;
  hoveredEditId?: string | null;
  onHoverEdit?: (editId: string | null) => void;
  jdContext?: JdCtx;
  srOpenEditId?: string | null;
  onSrOpen?: (editId: string | null) => void;
  srAnswers?: Record<string, string>;
  onSrAnswer?: (editId: string, option: string) => void;
}) {
  // 1 个 edit 只能映射到 1 个 bullet(防 parse-resume 出错导致跨 section 重复 bullet 时,
  // 同一 edit.suggested_text 被多个 bullet 重复显示)
  const usedEditIds = new Set<string>();

  function lookupEdit(
    section: "experience" | "projects" | "activities" | "self_eval",
    sectionIdx: number,
    bulletIdx: number,
    originalText: string,
  ): EditSuggestion | null {
    const target = `${section}[${sectionIdx}].bullets[${bulletIdx}]`;
    const claim = (m: EditSuggestion | undefined) => {
      if (!m) return null;
      if (usedEditIds.has(m.id)) return null; // 已被前面 bullet 用过,不重复
      usedEditIds.add(m.id);
      return m;
    };

    // L1: target 精确字符串匹配(主路径)
    const l1 = edits.find((e) => e.target === target);
    if (l1) {
      const c = claim(l1);
      if (c) return c;
    }

    // L2: bullet_id 精确匹配(章节重排兜底)
    const currentBulletId = (() => {
      const items = (parsedResume as Record<string, unknown>)?.[section];
      if (!Array.isArray(items)) return null;
      const it = items[sectionIdx] as { bullets?: Array<{ id?: string } | string> } | undefined;
      const b = it?.bullets?.[bulletIdx];
      if (!b || typeof b === "string") return null;
      return b.id ?? null;
    })();
    if (currentBulletId) {
      const l2 = edits.find((e) => e.bullet_id === currentBulletId);
      const c = claim(l2);
      if (c) return c;
    }

    // L3: original_text **完全相等**(严格)
    if (originalText.length >= 10) {
      const l3 = edits.find(
        (e) =>
          e.original_text === originalText &&
          e.original_text !== "(新增)" &&
          e.original_text !== "(JD 缺口)",
      );
      const c = claim(l3);
      if (c) return c;
    }

    return null;
  }

  function getBulletDisplay(
    section: "experience" | "projects" | "activities" | "self_eval",
    sectionIdx: number,
    bulletIdx: number,
    originalText: string,
  ): {
    text: string;
    status: "original" | "accepted" | "needs-fill" | "rejected";
    editId: string | null;
  } {
    const matched = lookupEdit(section, sectionIdx, bulletIdx, originalText);
    if (!matched) return { text: originalText, status: "original", editId: null };
    const d = decisions[matched.id];
    if (d === "accept") {
      return {
        text: rewritten[matched.id] ?? matched.suggested_text,
        status: "accepted",
        editId: matched.id,
      };
    }
    if (d === "reject") return { text: originalText, status: "rejected", editId: matched.id };
    // pending — 高风险待用户填
    const isFillable =
      matched.claim_type === "needs_confirmation" ||
      matched.claim_type === "inferred" ||
      matched.category === "quantification";
    if (isFillable) {
      return {
        text: rewritten[matched.id] ?? matched.suggested_text,
        status: "needs-fill",
        editId: matched.id,
      };
    }
    return { text: originalText, status: "original", editId: matched.id };
  }

  function renderBulletList(
    section: "experience" | "projects" | "activities" | "self_eval",
    items: { bullets?: AnyBullet[] }[],
  ) {
    return items.map((it, sIdx) =>
      (it.bullets ?? []).map((b, bIdx) => {
        const orig = typeof b === "string" ? b : b.text ?? "";
        const { text, status, editId } = getBulletDisplay(section, sIdx, bIdx, orig);
        const isHovered = editId && hoveredEditId === editId;
        const hasFillMark = !!text.match(FILL_RE);
        return (
          <li
            key={`${section}-${sIdx}-${bIdx}`}
            data-edit-id={editId ?? undefined}
            onMouseEnter={() => editId && onHoverEdit?.(editId)}
            onMouseLeave={() => onHoverEdit?.(null)}
            className={`text-[13px] leading-relaxed flex items-start gap-2 mb-1.5 px-1.5 rounded-sm transition-all duration-200 ${
              isHovered
                ? "bg-esther-blue/25 ring-2 ring-esther-blue/60 shadow-sm"
                : status === "accepted"
                  ? "bg-esther-blue/[0.08]"
                  : status === "needs-fill"
                    ? "bg-esther-yellow/[0.12]"
                    : ""
            }`}
          >
            <span className="text-ink mt-1.5 flex-shrink-0">·</span>
            <span
              className={
                status === "rejected"
                  ? "text-ink-muted line-through"
                  : "text-ink flex-1"
              }
            >
              <BulletFillableText
                text={text}
                editId={editId}
                onFillBlank={onFillBlank}
              />
              {/* 有内联占位符(BulletFillableText 已渲染成可点击填空)→ 不再额外标记;
                  没有内联占位符的改写 = 纯润色,直接显示"已改"。
                  ❌ 删掉了旧的"往句尾追加【请补充具体数字】"按钮:那会造出脱离上下文、用户不知道填什么的孤立数字框。
                  正确的数字占位符必须由 AI 内联嵌在句中(如"采访了【请补充人数】名学生")。 */}
              {(status === "accepted" || status === "needs-fill") && !hasFillMark && (
                <span className="text-esther-blue ml-1.5 text-[10px]">✓ AI 已改</span>
              )}
              {/* Timing 3: Skeptical Recruiter ⚡ icon */}
              {editId && (() => {
                const srQ = edits.find((x) => x.id === editId)?.sr_question;
                if (!srQ) return null;
                const answered = srAnswers?.[editId];
                if (answered) {
                  return (
                    <span className="ml-1 text-[10px] text-emerald-600" title={`已确认: ${answered}`}>
                      ⚡ 已确认
                    </span>
                  );
                }
                return (
                  <span className="relative inline-block">
                    <button
                      type="button"
                      onClick={() => onSrOpen?.(srOpenEditId === editId ? null : editId)}
                      title="HR 可能追问这里"
                      className="ml-1.5 inline text-amber-500 hover:text-amber-600 text-[13px] leading-none"
                    >
                      ⚡
                    </button>
                    {srOpenEditId === editId && (
                      <SRQuestionCard
                        srQuestion={srQ}
                        onAnswer={(opt) => onSrAnswer?.(editId, opt)}
                        onSkip={() => onSrOpen?.(null)}
                      />
                    )}
                  </span>
                );
              })()}
            </span>
          </li>
        );
      }),
    );
  }

  // 联系方式 + 求职意向
  const basic = parsedResume?.basic;
  const targetRole = (jdContext as { role_name?: string } | null)?.role_name;
  const contactItems: string[] = [];
  if (basic?.phone) contactItems.push(`📞 ${basic.phone}`);
  if (basic?.email) contactItems.push(`✉️ ${basic.email}`);
  if (basic?.location) contactItems.push(`📍 ${basic.location}`);

  // 教育背景:优先用 education[],fallback 用 basic.school
  const educationItems =
    parsedResume?.education && parsedResume.education.length > 0
      ? parsedResume.education
      : basic?.school
        ? [
            {
              school: basic.school,
              major: basic.major ?? "",
              degree: basic.year_level ?? "",
              period: "",
              gpa: basic.gpa ?? null,
            },
          ]
        : [];

  if (!parsedResume) return null;

  return (
    <div className="font-body-zh max-w-[750px] mx-auto">
      {/* ========= 顶部 Header:姓名 + 联系方式 + 求职意向 ========= */}
      {basic && (
        <div className="text-center pb-3 mb-4 border-b-2 border-ink">
          <h2 className="text-3xl font-bold text-ink tracking-wide mb-2">
            {basic.name ?? "—"} 的简历
          </h2>
          {contactItems.length > 0 && (
            <p className="text-xs text-ink-soft mb-1">
              {contactItems.join(" | ")}
              {targetRole && (
                <>
                  {" | "}
                  <span className="text-ink">求职意向:{targetRole}</span>
                </>
              )}
            </p>
          )}
          {contactItems.length === 0 && targetRole && (
            <p className="text-xs text-ink mb-1">求职意向:{targetRole}</p>
          )}
          {basic.major && (
            <p className="text-xs text-ink-soft">
              {basic.major}
              {basic.year_level ? ` · ${basic.year_level}` : ""}
              {basic.gpa ? ` · GPA ${basic.gpa}` : ""}
            </p>
          )}
        </div>
      )}

      {/* ========= 核心技能(自然语句改写;含补强;LLM 没好/失败时回退分类列表) ========= */}
      {(() => {
        const groups = skillGroupsOf(parsedResume);
        const hasFills = Object.values(keywordFills ?? {}).some((f) => f.accepted);
        if (groups.length === 0 && !hasFills) return null;
        const ss = skillsSummary ?? null;
        return (
          <Section title="核心技能">
            {ss === null ? (
              // 生成中:先用分类列表占位,不空白
              <CoreSkillsList groups={groups} />
            ) : ss.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1.5">
                {ss.map((line, i) => (
                  <li key={i} className="text-sm text-ink leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            ) : (
              <CoreSkillsList groups={groups} />
            )}
          </Section>
        );
      })()}

      {/* ========= 工作/实习经历 ========= */}
      {(parsedResume.experience ?? []).length > 0 && (
        <Section title="工作经历">
          {(parsedResume.experience ?? []).map((e, sIdx) => (
            <div key={sIdx} className="mb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-sm font-semibold text-ink">
                  {e.org}
                  {e.role ? ` · ${e.role}` : ""}
                </p>
                {e.period && (
                  <span className="text-ink-muted font-normal text-xs">
                    {e.period}
                  </span>
                )}
              </div>
              <ul>{renderBulletList("experience", [e])[0]}</ul>
            </div>
          ))}
        </Section>
      )}

      {/* ========= 项目经验 ========= */}
      {(parsedResume.projects ?? []).length > 0 && (
        <Section title="项目经验">
          {(parsedResume.projects ?? []).map((p, sIdx) => (
            <div key={sIdx} className="mb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-sm font-semibold text-ink">
                  {p.name}
                  {p.role ? ` · ${p.role}` : ""}
                </p>
                {p.period && (
                  <span className="text-ink-muted font-normal text-xs">
                    {p.period}
                  </span>
                )}
              </div>
              {p.tech_stack && p.tech_stack.length > 0 && (
                <p className="text-[12px] text-ink-soft mb-1">
                  技术栈:{p.tech_stack.join(" · ")}
                </p>
              )}
              <ul>{renderBulletList("projects", [p])[0]}</ul>
            </div>
          ))}
        </Section>
      )}

      {/* ========= 社团活动 ========= */}
      {(parsedResume.activities ?? []).length > 0 && (
        <Section title="社团活动">
          {(parsedResume.activities ?? []).map((a, sIdx) => (
            <div key={sIdx} className="mb-3">
              <p className="text-sm font-semibold text-ink mb-1">
                {a.org}
                {a.role ? ` · ${a.role}` : ""}
                {a.period && (
                  <span className="text-ink-muted font-normal text-xs ml-2">
                    {a.period}
                  </span>
                )}
              </p>
              <ul>{renderBulletList("activities", [a])[0]}</ul>
            </div>
          ))}
        </Section>
      )}

      {/* ========= 自我评价(复用 bullet 改写机制,支持 AI 改写 live preview) ========= */}
      {(parsedResume.self_eval ?? []).length > 0 &&
        (parsedResume.self_eval ?? []).some((s) => (s.bullets ?? []).length > 0) && (
          <Section title="自我评价">
            <ul>{renderBulletList("self_eval", parsedResume.self_eval ?? [])[0]}</ul>
          </Section>
        )}

      {/* ========= 教育背景(放最后,对齐 Skill) ========= */}
      {educationItems.length > 0 && (
        <Section title="教育背景">
          {educationItems.map((ed, idx) => (
            <div key={idx} className="mb-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-ink">
                  {ed.school}
                  {ed.major ? ` | ${ed.major}` : ""}
                  {ed.degree ? ` | ${ed.degree}` : ""}
                  {ed.gpa ? ` | GPA ${ed.gpa}` : ""}
                </p>
                {ed.period && (
                  <span className="text-ink-muted font-normal text-xs">
                    {ed.period}
                  </span>
                )}
              </div>
              {ed.research_direction && (
                <p className="text-[13px] text-ink-soft mt-0.5">
                  研究方向:{ed.research_direction}
                  {ed.advisor ? ` · 导师:${ed.advisor}` : ""}
                </p>
              )}
              {!ed.research_direction && ed.advisor && (
                <p className="text-[13px] text-ink-soft mt-0.5">导师:{ed.advisor}</p>
              )}
              {ed.rank && (
                <p className="text-[13px] text-ink-soft mt-0.5">专业排名:{ed.rank}</p>
              )}
              {ed.awards && ed.awards.length > 0 && (
                <p className="text-[13px] text-ink-soft mt-0.5">
                  荣誉:{ed.awards.join(" · ")}
                </p>
              )}
              {ed.courses && ed.courses.length > 0 && (
                <p className="text-[13px] text-ink-soft mt-0.5">
                  主修:{ed.courses.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

// ====== Tab1: JD 关键词命中全量 chip(对标竞品"JD核心关键词命中情况")======
function KeywordHitChips({
  jdKeywords,
  matchedKeywords,
  evidenceMap,
  gaps,
  loading,
  aiJudging,
}: {
  jdKeywords: string[];
  matchedKeywords: string[];
  evidenceMap?: Record<string, string>;
  gaps: { jd_requirement?: string; why_gap?: string; fixable?: string }[];
  loading?: boolean;
  aiJudging?: boolean;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const matchedSet = new Set(matchedKeywords.map((k) => k.toLowerCase()));
  const hitCount = jdKeywords.filter((k) => matchedSet.has(k.toLowerCase())).length;
  const total = jdKeywords.length;
  const pct = total > 0 ? Math.round((hitCount / total) * 100) : 0;
  const missing = jdKeywords.filter((k) => !matchedSet.has(k.toLowerCase()));
  const ev = evidenceMap ?? {};
  // 命中且有证据的(优先 AI 语义证据)
  const hitWithEvidence = jdKeywords.filter(
    (k) => matchedSet.has(k.toLowerCase()) && ev[k.toLowerCase()],
  );

  // gap 说明:按 jd_requirement 模糊匹配缺失关键词
  function gapNote(kw: string): { note: string; fixable?: string } | null {
    const g = gaps.find(
      (g) => g.jd_requirement && (g.jd_requirement.includes(kw) || kw.includes(g.jd_requirement)),
    );
    if (g) return { note: g.why_gap ?? "简历未明确提及", fixable: g.fixable };
    return null;
  }

  if (loading) {
    return (
      <Card className="p-6">
        <h3 className="text-base font-semibold text-ink flex items-center gap-1.5 mb-2">
          <span className="text-esther-blue">⭐</span> JD 核心关键词命中情况
        </h3>
        <p className="text-sm text-esther-blue animate-pulse">
          AI 正在逐条读你的简历、判定每个关键词是否有真实经历支撑(约 10 秒)…
        </p>
        <p className="text-xs text-ink-muted mt-1">
          为避免误导,分析完才显示命中数 —— 我们只认简历里有据可查的命中。
        </p>
      </Card>
    );
  }
  if (total === 0) {
    return (
      <Card className="p-6">
        <p className="text-sm text-ink-muted">
          关键词命中分析需要先有 JD。回上一步填岗位 JD 后这里会显示命中情况。
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-base font-semibold text-ink flex items-center gap-1.5">
          <span className="text-esther-blue">⭐</span> JD 核心关键词命中情况
        </h3>
        <span className="text-sm text-ink-soft flex items-center gap-2">
          {aiJudging && (
            <span className="text-xs text-esther-blue animate-pulse">AI 正在读简历判定语义命中…</span>
          )}
          命中 <span className="font-semibold text-esther-blue">{hitCount}</span> / {total} · {pct}%
        </span>
      </div>
      {/* 进度条 */}
      <div className="h-2 w-full rounded bg-warm-bg-deep/60 overflow-hidden mb-4">
        <div className="h-full bg-esther-blue transition-all" style={{ width: `${pct}%` }} />
      </div>
      {/* 全量 chip */}
      <div className="flex flex-wrap gap-2 mb-4">
        {jdKeywords.map((kw) => {
          const hit = matchedSet.has(kw.toLowerCase());
          return (
            <span
              key={kw}
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium ${
                hit
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-esther-red/10 text-esther-red border border-esther-red/20"
              }`}
            >
              {hit ? "✓" : "✗"} {kw}
            </span>
          );
        })}
      </div>

      {/* 缺失逐条说明(优先展示 — 用户最需要看"还差什么")*/}
      {missing.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-border">
          <p className="text-sm font-medium text-ink mb-1">还差这些(优先补):</p>
          {missing.map((kw) => {
            const g = gapNote(kw);
            return (
              <p key={kw} className="text-sm text-ink-soft leading-relaxed flex gap-1.5">
                <span className="text-esther-red flex-shrink-0">✗</span>
                <span>
                  <span className="font-medium text-ink">{kw}</span>
                  ：{g?.note ?? "简历未明确提及相关内容"}
                  {g?.fixable && (
                    <span className="ml-1 text-sm text-ink-muted">({g.fixable})</span>
                  )}
                </span>
              </p>
            );
          })}
        </div>
      )}

      {/* 命中证据:默认折叠,点开看(每条命中附简历原句 — anti-fab:有据才算命中)*/}
      {hitWithEvidence.length > 0 && (
        <div className="pt-3 border-t border-border mt-3">
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="text-sm text-esther-blue hover:underline flex items-center gap-1"
          >
            <span>{showEvidence ? "▾" : "▸"}</span>
            {showEvidence ? "收起命中证据" : `查看 ${hitWithEvidence.length} 条命中的简历证据`}
          </button>
          {showEvidence && (
            <div className="space-y-2 mt-2">
              <p className="text-sm text-ink-muted mb-1">
                ✦ 每个命中都来自简历里的真实经历(不硬凑):
              </p>
              {hitWithEvidence.map((kw) => (
                <p key={kw} className="text-sm text-ink-soft leading-relaxed flex gap-1.5">
                  <span className="text-emerald-600 flex-shrink-0">✓</span>
                  <span>
                    <span className="font-medium text-ink">{kw}</span>
                    <span className="text-ink-muted"> ← </span>
                    <span className="text-ink-soft">“{ev[kw.toLowerCase()]}”</span>
                  </span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ====== Tab4: 面试准备(静态 Q&A 文档 + 跳 m5 真人面试)======
function InterviewPrepTab({
  prep,
  loading,
  error,
  onReload,
  convQs,
}: {
  prep: PrepCategory[] | null;
  loading: boolean;
  error: string;
  onReload: () => void;
  convQs: string;
}) {
  return (
    <div className="space-y-6">
      {/* 跳 m5 真人模拟面试入口 */}
      <Card className="p-6 border-2 border-esther-blue/30 bg-esther-blue/5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink mb-1">🎥 想真刀真枪练一场?</h3>
            <p className="text-sm text-ink-soft leading-relaxed">
              真人模拟面试:3 种面试官性格 × 3 种面试类型,视频 + 语音作答,结束给 4 维复盘。
              比背文档更接近真实面试。
            </p>
          </div>
          <Link
            href={`/m5${convQs}`}
            className="flex-shrink-0 inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
          >
            去模拟面试 →
          </Link>
        </div>
      </Card>

      {/* 静态面试题文档 */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-base font-semibold text-ink">📄 面试题准备文档</h3>
            <p className="text-xs text-ink-muted mt-0.5">
              基于你改好的简历 + 目标 JD,先看先背。参考答案只用你简历真实内容,不编造。
            </p>
          </div>
          {prep && !loading && (
            <button
              onClick={onReload}
              className="text-xs text-ink-soft hover:text-esther-blue underline underline-offset-2"
            >
              重新生成
            </button>
          )}
        </div>

        {!prep && !loading && !error && (
          <button
            onClick={onReload}
            className="inline-flex items-center justify-center rounded-full bg-esther-blue text-white px-5 py-2 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
          >
            生成面试题 + 参考答案
          </button>
        )}
        {loading && (
          <div className="py-8 text-center">
            <div className="inline-block animate-spin w-6 h-6 border-2 border-esther-blue border-t-transparent rounded-full mb-2" />
            <p className="text-sm text-ink-soft">AI 正在按你的简历出题…(约 20 秒)</p>
          </div>
        )}
        {error && (
          <div className="py-4">
            <p className="text-sm text-esther-red mb-2">⚠️ {error}</p>
            <button
              onClick={onReload}
              className="text-sm text-esther-blue underline underline-offset-2"
            >
              重试 →
            </button>
          </div>
        )}
        {prep && prep.length > 0 && (
          <div className="space-y-6">
            {prep.map((cat, ci) => (
              <div key={ci}>
                <h4 className="text-base font-semibold text-ink mb-2.5 flex items-center gap-1.5">
                  <span className="w-6 h-6 rounded-full bg-esther-blue/10 text-esther-blue text-xs flex items-center justify-center font-medium">
                    {ci + 1}
                  </span>
                  {cat.name}
                </h4>
                <div className="space-y-3 pl-1">
                  {cat.questions.map((q, qi) => (
                    <div key={qi} className="border border-border rounded-lg p-4 bg-card">
                      <p className="text-sm font-semibold text-ink mb-2.5">Q{qi + 1}. {q.q}</p>
                      {q.examines && (
                        <div className="mb-3">
                          <span className="inline-flex items-center gap-1 rounded-full bg-warm-bg-deep/40 px-2 py-0.5 text-[11px] text-ink-muted">
                            🔍 考察方向 · {q.examines}
                          </span>
                        </div>
                      )}
                      {/* 参考答案 = 主体正文(蓝色左边线标识,可背诵) */}
                      <div className="border-l-2 border-esther-blue/40 pl-3">
                        <p className="text-[11px] font-semibold text-esther-blue mb-1">参考答案</p>
                        <p className="text-sm text-ink leading-relaxed whitespace-pre-wrap">{q.reference_answer}</p>
                      </div>
                      {/* 答题技巧 = 独立高亮提示框,和正文明显区分 */}
                      {q.tip && (
                        <div className="mt-3 flex gap-2 rounded-lg border border-esther-yellow/50 bg-esther-yellow/15 px-3 py-2">
                          <span className="flex-shrink-0 text-sm leading-5">💡</span>
                          <div>
                            <p className="text-[11px] font-semibold text-ink mb-0.5">答题技巧</p>
                            <p className="text-xs text-ink-soft leading-relaxed">{q.tip}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ====== Timing 1: 关键词缺口闭环(会用/略懂 → AI 补法 → 自己改 / 跟 AI 说 → 采纳 → 命中 + 进简历)======
type KeywordFillT = { level: "can" | "vague"; suggestion: string; where: string; accepted: boolean };

function KeywordGapRow({
  kw,
  resp,
  fill,
  loading,
  onRespond,
  onAcceptFill,
  onIgnoreFill,
  onEditFill,
  onRefineFill,
  convQs,
}: {
  kw: string;
  resp?: "can" | "vague" | "no";
  fill?: KeywordFillT;
  loading?: boolean;
  onRespond: (kw: string, resp: "can" | "vague" | "no") => void;
  onAcceptFill: (kw: string) => void;
  onIgnoreFill: (kw: string) => void;
  onEditFill: (kw: string, text: string) => void;
  onRefineFill: (kw: string, instruction: string) => void;
  convQs: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [chat, setChat] = useState("");

  return (
    <div className="border-b border-amber-200/60 last:border-0 pb-3 last:pb-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-ink font-medium mr-1">{kw}</span>
        {(["can", "vague", "no"] as const).map((r) => {
          const label = r === "can" ? "✓ 我会用" : r === "vague" ? "△ 略懂" : "✗ 不会";
          const active = resp === r;
          const cls = active
            ? r === "can"
              ? "bg-emerald-500 text-white border-emerald-500"
              : r === "vague"
                ? "bg-amber-400 text-white border-amber-400"
                : "bg-red-400 text-white border-red-400"
            : "bg-white text-ink-soft border-border hover:border-esther-blue";
          return (
            <button
              key={r}
              type="button"
              onClick={() => onRespond(kw, r)}
              className={`px-2.5 py-1 text-xs rounded border transition-colors ${cls}`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="text-xs text-esther-blue animate-pulse mt-2">
          AI 正在帮你想怎么把「{kw}」真实地写进简历…
        </p>
      )}

      {/* 补法卡(未采纳)— 可采纳 / 自己改 / 跟 AI 说 */}
      {!loading && fill && !fill.accepted && (
        <div className="mt-2 bg-white border border-emerald-200 rounded-lg p-3 space-y-2">
          <p className="text-xs text-ink-muted">
            建议补到「{fill.where}」· {fill.level === "can" ? "会用" : "略懂"}措辞:
          </p>

          {editing ? (
            <>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                className="w-full text-sm text-ink leading-relaxed bg-card border border-esther-blue/40 rounded p-2 resize-none focus:outline-none focus:ring-2 focus:ring-esther-blue/40"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const t = draft.trim();
                    if (t) onEditFill(kw, t);
                    setEditing(false);
                  }}
                  disabled={!draft.trim()}
                  className="inline-flex items-center rounded-full bg-esther-blue text-white px-3 py-1 text-sm font-medium hover:bg-esther-blue-dark disabled:opacity-40"
                >
                  ✓ 保存
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="text-sm text-ink-muted hover:text-ink"
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink leading-relaxed">{fill.suggestion}</p>
          )}

          {/* 跟 AI 说怎么改 */}
          {!editing && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chat}
                onChange={(e) => setChat(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && chat.trim()) {
                    onRefineFill(kw, chat.trim());
                    setChat("");
                  }
                }}
                placeholder="跟 AI 说哪里要改 / 哪点不准,它会重写"
                className="flex-1 min-w-0 text-sm text-ink bg-warm-bg-deep/30 border border-border rounded-full px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-esther-blue/30"
              />
              <button
                type="button"
                onClick={() => {
                  if (chat.trim()) {
                    onRefineFill(kw, chat.trim());
                    setChat("");
                  }
                }}
                disabled={!chat.trim()}
                className="inline-flex items-center rounded-full border border-esther-blue text-esther-blue px-3 py-1.5 text-sm hover:bg-esther-blue/10 transition-colors disabled:opacity-40 flex-shrink-0"
              >
                让 AI 改
              </button>
            </div>
          )}

          {!editing && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onAcceptFill(kw)}
                className="inline-flex items-center rounded-full bg-esther-blue text-white px-3 py-1 text-sm font-medium hover:bg-esther-blue-dark transition-colors"
              >
                ✓ 采纳,补进简历
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(fill.suggestion);
                  setEditing(true);
                }}
                className="inline-flex items-center rounded-full border border-border bg-card text-ink-soft px-3 py-1 text-sm hover:border-esther-blue hover:text-esther-blue transition-colors"
              >
                ✎ 自己改
              </button>
              <button
                type="button"
                onClick={() => onIgnoreFill(kw)}
                className="text-sm text-ink-muted hover:text-ink"
              >
                忽略
              </button>
            </div>
          )}
        </div>
      )}

      {/* 已采纳 */}
      {fill?.accepted && (
        <p className="text-sm text-emerald-700 mt-2 flex items-start gap-1.5">
          <span className="flex-shrink-0">✓</span>
          <span>
            已补进简历:<span className="text-ink">{fill.suggestion}</span>
            <span className="text-ink-muted">(该关键词已命中,会写入你下载的简历)</span>
          </span>
        </p>
      )}

      {/* 不会 → 真缺口,去补项目 */}
      {resp === "no" && (
        <p className="text-sm text-ink-soft mt-2">
          这是真缺口 —— 不替你硬写。建议去
          <Link href={`/m4${convQs}`} className="text-esther-blue hover:underline mx-1">
            「补项目」
          </Link>
          做一段能体现「{kw}」的经历,再回来补进简历。
        </p>
      )}
    </div>
  );
}

function KeywordGapSection({
  keywords,
  responses,
  fills,
  fillLoading,
  onRespond,
  onAcceptFill,
  onIgnoreFill,
  onEditFill,
  onRefineFill,
  convQs,
}: {
  keywords: string[];
  responses: Record<string, "can" | "vague" | "no">;
  fills: Record<string, KeywordFillT>;
  fillLoading: Record<string, boolean>;
  onRespond: (kw: string, resp: "can" | "vague" | "no") => void;
  onAcceptFill: (kw: string) => void;
  onIgnoreFill: (kw: string) => void;
  onEditFill: (kw: string, text: string) => void;
  onRefineFill: (kw: string, instruction: string) => void;
  convQs: string;
}) {
  if (keywords.length === 0) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
      <p className="text-sm font-semibold text-amber-700 mb-1">
        📋 JD 关键词缺口 — 这些 JD 要求、简历还没体现
      </p>
      <p className="text-xs text-ink-muted mb-3">
        选「会用 / 略懂」我帮你把它真实地补进简历(可自己改、可跟 AI 说怎么改);选「不会」就是真缺口,可以去练。
      </p>
      <div className="space-y-3">
        {keywords.map((kw) => (
          <KeywordGapRow
            key={kw}
            kw={kw}
            resp={responses[kw]}
            fill={fills[kw]}
            loading={fillLoading[kw]}
            onRespond={onRespond}
            onAcceptFill={onAcceptFill}
            onIgnoreFill={onIgnoreFill}
            onEditFill={onEditFill}
            onRefineFill={onRefineFill}
            convQs={convQs}
          />
        ))}
      </div>
    </div>
  );
}

// ====== Timing 3: SR 悬浮卡 ======
function SRQuestionCard({
  srQuestion,
  onAnswer,
  onSkip,
}: {
  srQuestion: import("@/components/EditSuggestionCard").SRQuestion;
  onAnswer: (option: string) => void;
  onSkip: () => void;
}) {
  return (
    <span
      className="absolute left-0 top-6 z-50 w-72 bg-white border border-amber-300 rounded-lg shadow-lg p-3 text-left block"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-[11px] font-semibold text-amber-700 mb-1">
        ⚡ HR 可能追问 · {srQuestion.type}
      </p>
      <p className="text-xs text-ink mb-2">{srQuestion.question}</p>
      <div className="flex flex-col gap-1">
        {srQuestion.options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onAnswer(opt)}
            className="text-left text-xs px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-ink transition-colors"
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          onClick={onSkip}
          className="text-left text-[11px] px-2 py-0.5 text-ink-muted hover:text-ink transition-colors mt-1"
        >
          跳过
        </button>
      </div>
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-bold text-ink mb-2 tracking-wide">
        {title}
      </h3>
      <div className="border-t border-ink/20 pt-2.5">{children}</div>
    </div>
  );
}

/** 核心技能:按 category 分类展示(label: value) */
function CoreSkillsList({ groups }: { groups: { category: string; items: string[] }[] }) {
  if (groups.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {groups.map((g) => (
        <p key={g.category} className="text-sm text-ink leading-relaxed">
          <span className="text-esther-blue font-semibold">{g.category}:</span>{" "}
          {g.items.join(" · ")}
        </p>
      ))}
    </div>
  );
}
