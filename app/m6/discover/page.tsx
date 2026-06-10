"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Nav } from "@/components/Nav";
import { BuerFloatingButton } from "@/components/BuerFloatingButton";
import { JobCard } from "@/components/m6/JobCard";
import { AgentProgress } from "@/components/m6/AgentProgress";
import { ResumeUploadInline } from "@/components/m6/ResumeUploadInline";
import { useLocalState, STORAGE_KEYS } from "@/lib/use-local-state";
import { useLatestResume } from "@/lib/sync/useLatestResume";
import { useUser } from "@/lib/auth/useUser";
import { createConversation } from "@/lib/conversations";
import { createClient } from "@/lib/supabase/client";
import type {
  AgentStepState,
  Job,
  MatchResumeResponse,
  SearchResponse,
} from "@/components/m6/types";

// 已知城市白名单(含常见拼写);不在列表里时显示软提示,不阻断搜索
const KNOWN_CITIES = new Set([
  "上海", "北京", "深圳", "广州", "杭州", "成都", "南京", "武汉", "西安",
  "重庆", "苏州", "天津", "长沙", "郑州", "青岛", "合肥", "宁波", "厦门",
  "福州", "济南", "大连", "沈阳", "哈尔滨", "长春", "南昌", "昆明", "贵阳",
  "南宁", "太原", "石家庄", "乌鲁木齐", "呼和浩特", "兰州", "西宁", "银川",
  "海口", "三亚", "珠海", "东莞", "佛山", "中山", "惠州", "汕头", "温州",
  "金华", "宁波", "无锡", "常州", "南通", "泉州", "徐州", "保定",
  "全国",
]);

interface ParsedResume {
  basic?: { name?: string; [k: string]: unknown };
  [k: string]: unknown;
}

// 简历内容签名(djb2)——只要底层简历内容变了,签名就变,用来给推荐缓存加 key。
// 换/重传简历后旧推荐不能再被当作当前结果静默展示(见下方失效逻辑)。
// key-order-independent 序列化:同一份简历经 DB jsonb 往返后 key 顺序可能变,
// 普通 JSON.stringify 会得到不同字符串 → 误判"简历变了"。递归排序 key 消除这点。
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Record<string, unknown>;
  return (
    "{" +
    Object.keys(obj)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

function resumeSignature(r: unknown): string {
  if (!r) return "";
  const s = stableStringify(r);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function DiscoverPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const { user } = useUser();
  const initialMode = sp.get("mode") === "match-resume" ? "recommend" : "search";

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
  // 统一读简历:登录读账号最近简历(DB),游客读 localStorage(见 useLatestResume)
  const latestResume = useLatestResume();
  // 就地上传解析出的简历:本会话即时生效(同时持久化,见 handleInlineResume),
  // 让"无简历"用户不必跳去 m3 也能直接上传后推荐。
  const [uploadedResume, setUploadedResume] = useState<unknown>(null);
  const parsedResume = (uploadedResume ?? latestResume.parsedResume) as unknown as ParsedResume | null;
  const resumeSource: "db" | "local" | "none" = uploadedResume
    ? user
      ? "db"
      : "local"
    : latestResume.source;
  // 当前简历内容签名 + 上次推荐所依据的签名;不一致 = 推荐缓存已过期
  const currentSig = resumeSignature(parsedResume);
  const [recommendSig, setRecommendSig] = useLocalState<string>(
    STORAGE_KEYS.DISCOVER_RECOMMEND_SIG,
    ""
  );
  const [staleNotice, setStaleNotice] = useState(false);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

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

  // 简历变了(换/重传)→ 不清空旧推荐(用户还想接着看),只在上方挂个非破坏性提示:
  // 这些推荐基于旧简历,想更新就点「重新推荐」。用户不点 → 旧推荐一直保留。
  // 用 key-order 无关的签名比对,避免 DB jsonb 往返 reorder 导致的误判。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (latestResume.loading) return; // 简历还在确定中,别误判
    if (!currentSig) return; // 没简历 → 保持现状
    if (recommendedJobs.length === 0) return; // 没有缓存推荐 → 无需提示
    if (!recommendSig) return; // 旧数据无签名 → 无法判定,不动
    setStaleNotice(recommendSig !== currentSig); // 不一致才提示,一致则撤掉提示
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSig, latestResume.loading, recommendSig, recommendedJobs.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ============ 搜索 ============
  const runSearch = useCallback(async () => {
    if (!filters.role.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/m6/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: filters.role.trim(),
          city: filters.city === "全国" ? undefined : filters.city || undefined,
          limit: 20,
        }),
      });
      const data: SearchResponse & { error?: string; anti_noise_filtered?: number } = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? `请求失败 ${res.status}`);
        setSearchJobs([]);
        return;
      }
      setSearchJobs(data.jobs ?? []);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "网络错误");
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
    setStaleNotice(false);
    setRecommendedJobs([]);

    // 模拟分阶段进度更新(实际后端一次性返回,前端用 timer 演示流水线)
    setAgentSteps({
      splitter: { step: "splitter", status: "running", label: "Agent 1 — Splitter:从简历提取搜索关键词" },
      scraper: { step: "scraper", status: "pending", label: "Crawler:并行抓取前程无忧 / 猎聘 / 智联真实岗位" },
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
        scraper: { step: "scraper", status: "done", label: `Crawler:抓到 ${data.stats.scraped} 个原始岗位`, detail: data.stats.blockedPlatforms.length ? `平台兜底生效,${data.stats.blockedPlatforms.join("/")} 暂不可用,已切换备用平台` : "前程无忧 / 猎聘 / 智联多平台数据齐全" },
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
      // 记录本次推荐所依据的简历签名,作为缓存有效性的判据
      setRecommendSig(currentSig);
    } catch (err) {
      timers.forEach(clearTimeout);
      setMatchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setMatchLoading(false);
    }
  }, [parsedResume, setRecommendedJobs, setMatchMeta, currentSig, setRecommendSig]);

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

  // 登录用户必须带 ?c=<会话id> 进 m3 子页,否则 useM3DBSync 会把没 conv 的访问
  // 弹回 /m3 选择页(出现"跳一下又跳一下"且丢 JD)。优先复用最近一份简历会话
  // (它带着简历,正是看岗位用的那份),没有才新建。游客无会话概念,直接进。
  const resolveM3Conv = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    // 取"看岗位刚用的那份简历"所在的会话:最新一行有简历的 m3_resumes
    // (与 useLatestResume 同一条查询 → 落在同一行,不会跳到空会话)
    const supabase = createClient();
    const { data } = await supabase
      .from("m3_resumes")
      .select("conversation_id")
      .not("parsed_resume_json", "is", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const id = (data as { conversation_id?: string } | null)?.conversation_id;
    if (id) return id;
    // 一份带简历的会话都没有 → 新建(用户会在 m3 里上传简历)
    return createConversation("m3", "改简历 1");
  }, [user]);

  const handleOptimizeResume = useCallback(
    async (job: Job) => {
      writePendingJd(job);
      if (!user) {
        router.push("/m3/jd");
        return;
      }
      const convId = await resolveM3Conv();
      router.push(convId ? `/m3/jd?c=${convId}` : "/m3");
    },
    [router, writePendingJd, user, resolveM3Conv]
  );

  const handlePracticeInterview = useCallback(
    (job: Job) => {
      writePendingJd(job);
      router.push("/m5");
    },
    [router, writePendingJd]
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

  // 就地上传简历解析成功 → 持久化 + 即时生效。
  // 游客:落 localStorage(useLatestResume 游客分支会读到);
  // 登录:新建一份 m3 简历会话并写入 parsed_resume_json(跨模块/跨设备可见,落本地兜底)。
  const handleInlineResume = useCallback(
    async (parsed: unknown) => {
      try {
        window.localStorage.setItem(STORAGE_KEYS.PARSED_RESUME, JSON.stringify(parsed));
      } catch {
        /* localStorage 不可用也不阻断 */
      }
      if (user) {
        try {
          const convId = await createConversation("m3", "我的简历");
          if (convId) {
            const supabase = createClient();
            await supabase
              .from("m3_resumes")
              .update({ parsed_resume_json: parsed })
              .eq("conversation_id", convId);
          }
        } catch {
          /* DB 落库失败 → 已落本地,推荐流程仍可继续 */
        }
      }
      setUploadedResume(parsed);
      setStaleNotice(false);
    },
    [user]
  );

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
            <SearchTab
              filters={filters}
              setFilters={setFilters}
              runSearch={runSearch}
              loading={searchLoading}
              error={searchError}
            />
          ) : (
            <RecommendTab
              parsedResume={parsedResume}
              resumeLoading={latestResume.loading}
              resumeSource={resumeSource}
              runMatch={runMatchResume}
              loading={matchLoading}
              error={matchError}
              steps={agentSteps}
              meta={matchMeta}
              staleNotice={staleNotice}
              onUploadResume={handleInlineResume}
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
}: {
  filters: { role: string; city: string };
  setFilters: (v: { role: string; city: string }) => void;
  runSearch: () => void;
  loading: boolean;
  error: string | null;
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
        <input
          type="text"
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          onKeyDown={(e) => e.key === "Enter" && !loading && runSearch()}
          placeholder="城市(可选)"
          className="px-4 py-2.5 rounded-lg border-2 border-border focus:border-esther-blue focus:outline-none text-sm bg-warm-bg w-full sm:w-[120px]"
        />
        <button
          onClick={runSearch}
          disabled={loading || !filters.role.trim()}
          className="px-6 py-2.5 rounded-lg bg-esther-blue text-white font-medium hover:bg-esther-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm whitespace-nowrap"
        >
          {loading ? "搜索中..." : "搜索 →"}
        </button>
      </div>
      {filters.city.trim() && !KNOWN_CITIES.has(filters.city.trim()) && (
        <p className="text-xs text-ink-muted mt-2">
          ⚠️ 未收录该城市,招聘数据可能较少或不准确
        </p>
      )}
      {loading && (
        <p className="text-xs text-ink-soft mt-3 flex items-center gap-2">
          <span className="inline-block w-3 h-3 border-2 border-esther-blue border-t-transparent rounded-full animate-spin" />
          正在从前程无忧 / 猎聘 / 智联抓取真实岗位...(20-30s)
        </p>
      )}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-esther-red/10 border border-esther-red/30 text-sm text-esther-red">
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

function RecommendTab({
  parsedResume,
  resumeLoading,
  resumeSource,
  runMatch,
  loading,
  error,
  steps,
  meta,
  staleNotice,
  onUploadResume,
}: {
  parsedResume: ParsedResume | null;
  resumeLoading: boolean;
  resumeSource: "db" | "local" | "none";
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
  staleNotice: boolean;
  onUploadResume: (parsed: unknown) => void | Promise<void>;
}) {
  const hasResume = !!parsedResume;
  const hasResults = meta.keywords && meta.keywords.length > 0;
  // 有简历时也允许换/重传一份(默认收起,点开才显示上传器)
  const [showSwap, setShowSwap] = useState(false);

  return (
    <div className="space-y-4">
      {/* 简历状态 + CTA */}
      <div className="bg-card border-2 border-border rounded-2xl p-5">
        {resumeLoading ? (
          <div className="text-center py-3">
            <p className="text-sm text-ink-muted">读取你的简历中…</p>
          </div>
        ) : hasResume ? (
          <>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-esther-blue text-base">✓</span>
              <p className="text-sm text-ink">
                已检测到你的简历{resumeSource === "db" ? "(账号最新)" : "(本地)"}
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
              全流程约 60-90 秒,AI 抓取 + 评分 + 推荐,请稍候。
            </p>
            <button
              onClick={() => setShowSwap((v) => !v)}
              className="text-xs text-esther-blue hover:underline mt-3 inline-block"
            >
              {showSwap ? "收起" : "不是这份?换一份 / 重新上传简历 →"}
            </button>
            {showSwap && (
              <div className="mt-3">
                <ResumeUploadInline
                  onParsed={async (p) => {
                    await onUploadResume(p);
                    setShowSwap(false);
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="py-1">
            <p className="text-sm text-ink mb-3">
              上传你的简历,AI 就能按它给岗位打分、推荐、解释为什么适合 👇
            </p>
            <ResumeUploadInline onParsed={onUploadResume} />
            <p className="text-xs text-ink-muted mt-3">
              想完整整理简历?也可以去{" "}
              <a href="/m3" className="text-esther-blue hover:underline">
                简历优化
              </a>{" "}
              再回来。
            </p>
          </div>
        )}
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-esther-red/10 border border-esther-red/30 text-sm text-esther-red">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* 简历已变 → 旧推荐已失效的提示 */}
      {staleNotice && !loading && (
        <div className="p-3 rounded-lg bg-esther-yellow/15 border border-esther-yellow/50 text-sm text-ink">
          📝 你的简历有更新,下面这些推荐还是基于旧简历(先留着给你看)。想用新简历的话,点上方「用我的简历推荐岗位」重新生成。
        </div>
      )}

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
