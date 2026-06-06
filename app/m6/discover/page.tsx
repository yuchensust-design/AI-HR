"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { JobCard } from "@/components/m6/JobCard";
import { AgentProgress } from "@/components/m6/AgentProgress";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useUser } from "@/lib/auth/useUser";
import { createConversation } from "@/lib/conversations";
import type {
  AgentStepState,
  Job,
  MatchResumeResponse,
  Platform,
  SearchResponse,
} from "@/components/m6/types";

const POPULAR_CITIES = ["上海", "北京", "深圳", "广州", "杭州", "成都", "南京", "武汉", "西安", "全国"];

interface ParsedResume {
  basic?: { name?: string; [k: string]: unknown };
  [k: string]: unknown;
}

function DiscoverPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialMode = sp.get("mode") === "match-resume" ? "recommend" : "search";
  const { user } = useUser();

  const [activeTab, setActiveTab] = useLocalState<"search" | "recommend">(
    STORAGE_KEYS.DISCOVER_TAB,
    initialMode
  );
  const [filters, setFilters] = useLocalState(STORAGE_KEYS.DISCOVER_FILTERS, {
    role: sp.get("role") ?? "",
    city: sp.get("city") ?? "上海",
  });
  const [searchJobs, setSearchJobs] = useLocalState<Job[]>(STORAGE_KEYS.DISCOVER_SEARCH_JOBS, []);
  const [recommendedJobs, setRecommendedJobs] = useLocalState<Job[]>(
    STORAGE_KEYS.DISCOVER_RECOMMENDED_JOBS,
    []
  );
  const [matchMeta, setMatchMeta] = useLocalState<{
    keywords?: string[];
    city?: string;
    reasoning?: string;
    stats?: MatchResumeResponse["stats"];
  }>(STORAGE_KEYS.DISCOVER_MATCH_META, {});
  const [parsedResume] = useLocalState<ParsedResume | null>(STORAGE_KEYS.PARSED_RESUME, null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchBlocked, setSearchBlocked] = useState<Platform[]>([]);

  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<
    Partial<Record<AgentStepState["step"], AgentStepState>>
  >({});

  const [detailModal, setDetailModal] = useState<{ job: Job; jdText: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // URL → 初始 tab 同步(避免 useLocalState 跟 URL 冲突)
  useEffect(() => {
    if (initialMode === "recommend" && activeTab !== "recommend") {
      setActiveTab("recommend");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMode]);

  // 自动触发搜索:URL 带 role 参数时
  const autoSearchTriggered = useRouterAutoSearch(sp, setFilters);

  // ============ 搜索 ============
  // 关键词搜索 4 阶段进度(plan offer-1-sparkling-hippo P1):抓取 → 去重 → 过滤 → 完成
  type SearchStage = "scraping" | "dedup" | "filtering" | "done" | null;
  const [searchStage, setSearchStage] = useState<SearchStage>(null);
  const [searchAntiNoise, setSearchAntiNoise] = useState(0);

  const runSearch = useCallback(async () => {
    if (!filters.role.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearchBlocked([]);
    setSearchStage("scraping");
    setSearchAntiNoise(0);
    // 阶段计时(后端一次性返回,前端 timer 推动进度可视化)
    const t1 = setTimeout(() => setSearchStage("dedup"), 8_000);
    const t2 = setTimeout(() => setSearchStage("filtering"), 16_000);
    try {
      const res = await fetch("/api/m6/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: filters.role.trim(),
          city: filters.city === "全国" ? undefined : filters.city,
          limit: 20,
        }),
      });
      clearTimeout(t1);
      clearTimeout(t2);
      const data: SearchResponse & { error?: string; anti_noise_filtered?: number } = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? `请求失败 ${res.status}`);
        setSearchJobs([]);
        setSearchStage(null);
        return;
      }
      setSearchJobs(data.jobs ?? []);
      setSearchBlocked(data.blockedPlatforms ?? []);
      setSearchAntiNoise(data.anti_noise_filtered ?? 0);
      setSearchStage("done");
    } catch (err) {
      clearTimeout(t1);
      clearTimeout(t2);
      setSearchError(err instanceof Error ? err.message : "网络错误");
      setSearchStage(null);
    } finally {
      setSearchLoading(false);
    }
  }, [filters.role, filters.city, setSearchJobs]);

  // URL 触发自动搜索
  useEffect(() => {
    if (autoSearchTriggered && filters.role.trim() && searchJobs.length === 0 && !searchLoading) {
      runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearchTriggered]);

  // ============ 简历推荐(四阶段) ============
  const runMatchResume = useCallback(async () => {
    if (!parsedResume) {
      setMatchError("请先上传简历(进入「简历优化」M3 模块)");
      return;
    }
    setMatchLoading(true);
    setMatchError(null);
    setRecommendedJobs([]);

    // 模拟分阶段进度更新(实际后端一次性返回,前端用 timer 演示流水线)
    setAgentSteps({
      splitter: { step: "splitter", status: "running", label: "Agent 1 — Splitter:从简历提取搜索关键词" },
      scraper: { step: "scraper", status: "pending", label: "Crawler:并行抓取 BOSS + 51job 真实岗位" },
      scorer: { step: "scorer", status: "pending", label: "Agent 2 — Scorer:4 维度评分(批量)" },
      formatter: { step: "formatter", status: "pending", label: "Agent 4 — Formatter:生成个性化推荐说明" },
    });

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setAgentSteps((prev) => ({
          ...prev,
          splitter: { ...prev.splitter!, status: "done" },
          scraper: { ...prev.scraper!, status: "running" },
        }));
      }, 5_000)
    );
    timers.push(
      setTimeout(() => {
        setAgentSteps((prev) => ({
          ...prev,
          scraper: { ...prev.scraper!, status: "done" },
          scorer: { ...prev.scorer!, status: "running" },
        }));
      }, 25_000)
    );
    timers.push(
      setTimeout(() => {
        setAgentSteps((prev) => ({
          ...prev,
          scorer: { ...prev.scorer!, status: "done" },
          formatter: { ...prev.formatter!, status: "running" },
        }));
      }, 50_000)
    );

    try {
      const res = await fetch("/api/m6/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parsedResume }),
      });
      const data: MatchResumeResponse & { error?: string } = await res.json();
      timers.forEach(clearTimeout);

      if (!res.ok) {
        setMatchError(data.error ?? `请求失败 ${res.status}`);
        setAgentSteps((prev) => ({
          ...prev,
          ...(Object.fromEntries(
            Object.entries(prev).map(([k, v]) => [
              k,
              v?.status === "running" ? { ...v, status: "error" as const } : v,
            ])
          ) as typeof prev),
        }));
        return;
      }

      setAgentSteps({
        splitter: { step: "splitter", status: "done", label: `Agent 1 — Splitter:抽取 ${data.keywords.length} 个关键词`, detail: data.keywords.join(" / ") },
        scraper: { step: "scraper", status: "done", label: `Crawler:抓到 ${data.stats.scraped} 个原始岗位`, detail: data.stats.blockedPlatforms.length ? `平台兜底生效,${data.stats.blockedPlatforms.join("/")} 暂不可用,已切换备用平台` : "BOSS + 51job 双平台数据齐全" },
        scorer: { step: "scorer", status: "done", label: `Agent 2 — Scorer:评分 ${data.stats.scored} 个岗位` },
        formatter: { step: "formatter", status: "done", label: `Agent 4 — Formatter:推荐 ${data.stats.recommended} 个(80 分放行 + Fallback 保底)` },
      });
      setRecommendedJobs(data.jobs);
      setMatchMeta({
        keywords: data.keywords,
        city: data.city,
        reasoning: data.reasoning,
        stats: data.stats,
      });
    } catch (err) {
      timers.forEach(clearTimeout);
      setMatchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setMatchLoading(false);
    }
  }, [parsedResume, setRecommendedJobs, setMatchMeta]);

  // ============ 卡片三按钮 handler ============
  // /m6 写"待消费 JD" raw 数据;M3/M5 入口读后预填自有流程
  const writePendingJd = useCallback((job: Job) => {
    const pending = {
      jdText: job.jdText ?? "",
      roleName: job.title,
      company: job.company,
      salary: job.salary ?? "",
      city: job.city,
      jdUrl: job.jdUrl,
      sourceJobId: job.id,
      platform: job.platform,
      from_m6: true,
      writtenAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEYS.M6_PENDING_JD, JSON.stringify(pending));
  }, []);

  /**
   * §8.28 — 登录用户:m6 直跳必须带 convId,否则被 useM3DBSync redirect 回主页 + 丢预填
   * 自动新建一个 m3/m5 conv,标题用岗位名 + 公司类型(便于侧栏识别)
   */
  const handleOptimizeResume = useCallback(
    async (job: Job) => {
      writePendingJd(job);
      if (user) {
        const convId = await createConversation(
          "m3",
          `${job.title} · ${job.company}`.slice(0, 40)
        );
        if (convId) {
          router.push(`/m3/jd?c=${convId}`);
          return;
        }
      }
      router.push("/m3/jd");
    },
    [router, writePendingJd, user]
  );

  const handlePracticeInterview = useCallback(
    async (job: Job) => {
      writePendingJd(job);
      if (user) {
        const convId = await createConversation(
          "m5",
          `${job.title} · ${job.company}`.slice(0, 40)
        );
        if (convId) {
          router.push(`/m5?c=${convId}`);
          return;
        }
      }
      router.push("/m5");
    },
    [router, writePendingJd, user]
  );

  const handleViewDetail = useCallback(async (job: Job) => {
    setDetailModal({ job, jdText: job.jdText ?? "" });
    if (job.jdText) return;
    setDetailLoading(true);
    try {
      const res = await fetch("/api/m6/job-detail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, platform: job.platform }),
      });
      if (res.ok) {
        const data = await res.json();
        setDetailModal({ job, jdText: data.jdText ?? "" });
      }
    } catch {
      /* ignore — 兜底显示"打开原网页"按钮 */
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // ============ render ============

  const jobsForActiveTab = activeTab === "search" ? searchJobs : recommendedJobs;
  const showMatch = activeTab === "recommend";

  return (
    <>
      <Nav />
      <main className="min-h-screen bg-warm-bg pt-24 pb-24" id="top">
        <div className="max-w-[1100px] mx-auto px-6">
          {/* Header */}
          <header className="mb-6">
            <p className="font-display italic text-sm text-esther-blue mb-2">
              Look for jobs
            </p>
            <h1 className="text-3xl md:text-4xl font-bold text-ink mb-2">
              🎯 找适合你的岗位
            </h1>
            <p className="text-ink-soft text-sm">
              从主流招聘站抓取真实在招岗位,AI 帮你按简历评分、推荐、解释为什么适合。
            </p>
          </header>

          {/* Tab 切换 */}
          <div className="flex gap-2 mb-6 border-b-2 border-border">
            {[
              { id: "search" as const, label: "🔍 关键词搜索" },
              { id: "recommend" as const, label: "✨ 用我的简历推荐" },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-0.5 ${
                  activeTab === t.id
                    ? "border-esther-blue text-esther-blue"
                    : "border-transparent text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === "search" ? (
            <>
              <SearchTab
                filters={filters}
                setFilters={setFilters}
                runSearch={runSearch}
                loading={searchLoading}
                error={searchError}
                blocked={searchBlocked}
              />
              {/* 4 阶段搜索进度(plan offer-1-sparkling-hippo P1) */}
              {(searchStage || searchAntiNoise > 0) && (
                <SearchStageProgress
                  stage={searchStage}
                  antiNoiseFiltered={searchAntiNoise}
                  resultCount={searchJobs.length}
                />
              )}
            </>
          ) : (
            <RecommendTab
              parsedResume={parsedResume}
              runMatch={runMatchResume}
              loading={matchLoading}
              error={matchError}
              steps={agentSteps}
              meta={matchMeta}
            />
          )}

          {/* 结果列表 */}
          {jobsForActiveTab.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-ink mb-4">
                {showMatch
                  ? `为你推荐 ${jobsForActiveTab.length} 个岗位`
                  : `共 ${jobsForActiveTab.length} 个真实在招岗位`}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {jobsForActiveTab.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    showMatch={showMatch}
                    onOptimizeResume={handleOptimizeResume}
                    onPracticeInterview={handlePracticeInterview}
                    onViewDetail={handleViewDetail}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* JD Modal */}
        {detailModal && (
          <div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setDetailModal(null)}
          >
            <div
              className="bg-card rounded-2xl border-2 border-border max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-ink">{detailModal.job.title}</h3>
                  <p className="text-sm text-ink-soft">
                    {detailModal.job.company} · {detailModal.job.city} ·{" "}
                    <span className="text-esther-red">{detailModal.job.salary}</span>
                  </p>
                </div>
                <button
                  onClick={() => setDetailModal(null)}
                  className="text-ink-muted hover:text-ink text-xl leading-none px-2"
                >
                  ×
                </button>
              </div>
              {detailLoading ? (
                <div className="py-6 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-esther-blue border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-ink-muted mt-2">正在拉取 JD 全文...</p>
                </div>
              ) : detailModal.jdText ? (
                <pre className="text-sm text-ink leading-relaxed whitespace-pre-wrap font-sans bg-warm-bg-deep/40 p-4 rounded-lg border border-border/60 max-h-[50vh] overflow-y-auto">
                  {detailModal.jdText}
                </pre>
              ) : (
                <div className="py-4 text-center">
                  <p className="text-sm text-ink-soft mb-3">
                    JD 全文暂时拿不到,可以打开原网页查看完整描述。
                  </p>
                  <a
                    href={detailModal.job.jdUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-4 py-2 rounded-lg bg-esther-blue text-white text-sm hover:bg-esther-blue-dark"
                  >
                    打开原网页 ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      <BuerFloatingButton />
    </>
  );
}

// ============ 子组件 ============

function SearchTab({
  filters,
  setFilters,
  runSearch,
  loading,
  error,
  blocked,
}: {
  filters: { role: string; city: string };
  setFilters: (v: { role: string; city: string }) => void;
  runSearch: () => void;
  loading: boolean;
  error: string | null;
  blocked: Platform[];
}) {
  return (
    <div className="bg-card border-2 border-border rounded-2xl p-5">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && !loading && runSearch()}
          placeholder="岗位名,如 产品经理 / 前端工程师"
          className="flex-1 px-4 py-2.5 rounded-lg border-2 border-border focus:border-esther-blue focus:outline-none text-sm bg-warm-bg"
        />
        <select
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          className="px-4 py-2.5 rounded-lg border-2 border-border focus:border-esther-blue focus:outline-none text-sm bg-warm-bg min-w-[100px]"
        >
          {POPULAR_CITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button
          onClick={runSearch}
          disabled={loading || !filters.role.trim()}
          className="px-6 py-2.5 rounded-lg bg-esther-blue text-white font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm whitespace-nowrap"
        >
          {loading ? "搜索中..." : "搜索 →"}
        </button>
      </div>
      {loading && (
        <p className="text-xs text-ink-soft mt-3 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-esther-blue border-t-transparent rounded-full animate-spin" />
          正在从 BOSS + 51job 抓取真实岗位...(20-30s)
        </p>
      )}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-esther-red/10 border border-esther-red/30 text-sm text-esther-red">
          ⚠️ {error}
        </div>
      )}
      {blocked.length > 0 && (
        <div className="mt-3 p-3 rounded-lg bg-esther-yellow/30 border border-esther-yellow/60 text-xs text-ink">
          <span className="font-semibold">双平台兜底已生效:</span> {blocked.join(" / ")} 暂时不可用,已切换到备用平台
        </div>
      )}
    </div>
  );
}

function RecommendTab({
  parsedResume,
  runMatch,
  loading,
  error,
  steps,
  meta,
}: {
  parsedResume: ParsedResume | null;
  runMatch: () => void;
  loading: boolean;
  error: string | null;
  steps: Partial<Record<AgentStepState["step"], AgentStepState>>;
  meta: {
    keywords?: string[];
    city?: string;
    reasoning?: string;
    stats?: MatchResumeResponse["stats"];
  };
}) {
  const hasResume = !!parsedResume;
  const hasResults = meta.keywords && meta.keywords.length > 0;

  return (
    <div className="space-y-4">
      {/* 简历状态 + CTA */}
      <div className="bg-card border-2 border-border rounded-2xl p-5">
        {hasResume ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-esther-blue text-base">✓</span>
              <p className="text-sm text-ink">
                已检测到你的简历(本地)
                {parsedResume?.basic?.name ? ` — ${parsedResume.basic.name}` : ""}
              </p>
            </div>
            <button
              onClick={runMatch}
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 rounded-lg bg-esther-yellow text-ink font-semibold hover:bg-esther-yellow/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm border-2 border-esther-yellow/60"
            >
              {loading ? "AI 正在工作..." : "✨ 用我的简历推荐岗位 →"}
            </button>
            <p className="text-xs text-ink-muted mt-2">
              全流程约 60-90 秒。会调爬虫抓取 + 3 次 LLM 评分 / 改写。
            </p>
          </>
        ) : (
          <div className="text-center py-3">
            <p className="text-sm text-ink mb-3">
              还没上传简历?先去「简历优化」上传,再回来推荐。
            </p>
            <a
              href="/m3"
              className="inline-block px-5 py-2.5 rounded-lg bg-esther-blue text-white text-sm font-medium hover:bg-esther-blue-dark"
            >
              去上传简历 →
            </a>
          </div>
        )}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-esther-red/10 border border-esther-red/30 text-sm text-esther-red">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* AgentProgress */}
      {(loading || Object.keys(steps).length > 0) && <AgentProgress steps={steps} />}

      {/* 推荐 meta 展示(关键词 + 推理) */}
      {hasResults && !loading && (
        <div className="bg-esther-blue/5 border border-esther-blue/30 rounded-2xl p-4 text-sm">
          <p className="text-xs text-esther-blue font-semibold mb-1 uppercase tracking-wide">
            AI 是这么挑的
          </p>
          <p className="text-ink leading-relaxed mb-2">
            <span className="font-medium">搜索关键词:</span>{" "}
            {meta.keywords?.map((k, i) => (
              <span
                key={i}
                className="inline-block mr-1.5 px-2 py-0.5 rounded-md bg-card border border-esther-blue/30 text-esther-blue text-xs"
              >
                {k}
              </span>
            ))}{" "}
            · 城市 <span className="font-medium">{meta.city}</span>
          </p>
          {meta.reasoning && (
            <p className="text-xs text-ink-soft leading-relaxed">{meta.reasoning}</p>
          )}
          {meta.stats && (
            <p className="text-xs text-ink-muted mt-2">
              共抓取 {meta.stats.scraped} 个 · 评分 {meta.stats.scored} 个 · 推荐{" "}
              {meta.stats.recommended} 个
              {meta.stats.blockedPlatforms.length > 0 &&
                ` · 平台兜底生效:${meta.stats.blockedPlatforms.join("/")}`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function useRouterAutoSearch(
  sp: ReturnType<typeof useSearchParams>,
  setFilters: (v: { role: string; city: string }) => void
): boolean {
  const [triggered, setTriggered] = useState(false);
  useEffect(() => {
    const role = sp.get("role");
    const city = sp.get("city");
    if (role) {
      setFilters({ role, city: city ?? "上海" });
      setTriggered(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return triggered;
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-warm-bg" />}>
      <DiscoverPageInner />
    </Suspense>
  );
}

/**
 * SearchStageProgress — 关键词搜索 4 阶段进度条(plan offer-1-sparkling-hippo P1)
 * 抓取中 → 去重 → 过滤(标题/经验/城市) → 完成
 * 让用户等 20-30s 时知道进度,不焦虑;完成后展示反噪过滤数字
 */
function SearchStageProgress({
  stage,
  antiNoiseFiltered,
  resultCount,
}: {
  stage: "scraping" | "dedup" | "filtering" | "done" | null;
  antiNoiseFiltered: number;
  resultCount: number;
}) {
  if (!stage) return null;
  const stages: Array<{ key: "scraping" | "dedup" | "filtering" | "done"; label: string; hint: string }> = [
    { key: "scraping", label: "抓取中", hint: "BOSS 直聘 + 51job 并行" },
    { key: "dedup", label: "去重中", hint: "同岗位多平台合并" },
    { key: "filtering", label: "过滤中", hint: "标题 / 城市 / 经验匹配" },
    { key: "done", label: "完成", hint: `${resultCount} 条相关岗位` },
  ];
  const currentIdx = stages.findIndex((s) => s.key === stage);

  return (
    <div className="mt-4 p-4 rounded-lg bg-card border border-border">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {stages.map((s, i) => {
          const isDone = i < currentIdx || stage === "done";
          const isActive = s.key === stage && stage !== "done";
          return (
            <div key={s.key} className="flex items-center gap-2 flex-1 min-w-0">
              <span
                className={`flex-shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                  isDone
                    ? "bg-esther-blue text-white"
                    : isActive
                      ? "bg-esther-yellow text-ink animate-pulse"
                      : "bg-warm-bg-deep text-ink-muted"
                }`}
              >
                {isDone ? "✓" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium truncate ${isDone || isActive ? "text-ink" : "text-ink-muted"}`}>
                  {s.label}
                </p>
                <p className="text-[10px] text-ink-muted truncate">{s.hint}</p>
              </div>
              {i < stages.length - 1 && (
                <span className="text-ink-muted text-xs hidden sm:inline">→</span>
              )}
            </div>
          );
        })}
      </div>
      {stage === "done" && antiNoiseFiltered > 0 && (
        <p className="text-[11px] text-ink-soft mt-3 leading-relaxed">
          ℹ️ 反噪过滤生效:已过滤 <span className="font-medium text-ink">{antiNoiseFiltered}</span> 条不相关岗位(标题不匹配 / 经验过高 / 异地 / 资深岗位等)
        </p>
      )}
    </div>
  );
}
