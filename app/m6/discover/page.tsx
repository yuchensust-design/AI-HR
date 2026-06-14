"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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

// 猎聘优先:稳定排序,把 liepin 平台岗位提到最前(组内保持原有匹配分顺序)
function sortLiepinFirst(jobs: Job[]): Job[] {
  return [
    ...jobs.filter((j) => j.platform === "liepin"),
    ...jobs.filter((j) => j.platform !== "liepin"),
  ];
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
  const [searchPage, setSearchPage] = useLocalState<number>(STORAGE_KEYS.DISCOVER_SEARCH_PAGE, 1);
  // 「是否已翻到末页」用内存态、不持久化:每次进页面默认 false → 只要搜索 tab 有结果就显示
  // 加载更多;只有点了之后 API 明确说没有下一页才置 true 隐藏。不依赖会被存旧的持久化值。
  const [reachedEnd, setReachedEnd] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
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
  // 推荐 tab「加载更多」:翻页复用上次关键词,抓下一页去重追加
  const [recommendPage, setRecommendPage] = useState(1);
  const [loadingMoreRec, setLoadingMoreRec] = useState(false);
  const [noMoreRec, setNoMoreRec] = useState(false);
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
  // 当前简历内容签名 + 上次推荐所依据的签名;不一致 = 推荐缓存已过期。
  // 含优化稿(finalMarkdown):在 m3 优化简历后,即便 parsed 结构没变也能让推荐失效重算。
  const effectiveOptimized = uploadedResume ? "" : latestResume.finalMarkdown ?? "";
  const currentSig = resumeSignature({ r: parsedResume, o: effectiveOptimized });
  const [recommendSig, setRecommendSig] = useLocalState<string>(
    STORAGE_KEYS.DISCOVER_RECOMMEND_SIG,
    ""
  );
  const [staleNotice, setStaleNotice] = useState(false);

  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  // 爬虫不可达 → 走本地 mock 兜底,据此显示「演示数据」banner(不让评委误把示例当真岗)
  const [searchIsMock, setSearchIsMock] = useState(false);

  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [agentSteps, setAgentSteps] = useState<
    Partial<Record<AgentStepState["step"], AgentStepState>>
  >({});

  const [detailModal, setDetailModal] = useState<{ job: Job; jdText: string } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // 看JD / handoff / 后台预抓 共用的 JD 全文缓存(job.id → 全文;""=抓过但没拿到)
  const jdCacheRef = useRef<Map<string, string>>(new Map());
  const jdInflightRef = useRef<Map<string, Promise<string>>>(new Map());
  // handoff 时正为哪张卡抓全文 → 卡上按钮显示"抓取完整 JD…"
  const [handoffJobId, setHandoffJobId] = useState<string | null>(null);

  // 抓某岗位 JD 全文:列表自带就用;否则查缓存 / 复用在途请求;否则现抓 /detail。
  // 抓不到(如 51job 详情反爬)缓存空串 → 上层兜底 role 模式,不卡用户。
  const fetchDetail = useCallback(async (job: Job): Promise<string> => {
    if (job.jdText && job.jdText.length > 30) return job.jdText;
    const cached = jdCacheRef.current.get(job.id);
    if (cached !== undefined) return cached;
    const inflight = jdInflightRef.current.get(job.id);
    if (inflight) return inflight;
    const p = (async () => {
      let txt = "";
      try {
        const res = await fetch("/api/m6/job-detail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: job.id, platform: job.platform }),
          // 20s 超时:抓详情若卡住,不让 handoff 按钮无限"抓取完整 JD…",
          // 超时即放弃 → 用岗位名兜底继续(下游已支持空 JD)
          signal: AbortSignal.timeout(20_000),
        });
        if (res.ok) txt = ((await res.json()).jdText as string) ?? "";
      } catch {
        /* 抓不到 / 超时 → 空串兜底,改简历用岗位名 */
      }
      jdCacheRef.current.set(job.id, txt);
      jdInflightRef.current.delete(job.id);
      return txt;
    })();
    jdInflightRef.current.set(job.id, p);
    return p;
  }, []);

  // 后台低并发预抓当前 tab 岗位的 JD 全文 → 点看JD/handoff 时多半已就绪、不用等。
  useEffect(() => {
    const jobs = activeTab === "recommend" ? recommendedJobs : searchJobs;
    const queue = jobs.filter((j) => !jdCacheRef.current.has(j.id));
    if (queue.length === 0) return;
    let cancelled = false;
    const work = async () => {
      while (!cancelled && queue.length) {
        const job = queue.shift();
        if (job) await fetchDetail(job);
      }
    };
    void Promise.all([work(), work()]); // 并发 2,温和不打爆爬虫
    return () => {
      cancelled = true;
    };
  }, [activeTab, recommendedJobs, searchJobs, fetchDetail]);

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
        setReachedEnd(true);
        return;
      }
      setSearchJobs(data.jobs ?? []);
      setSearchPage(1);
      setReachedEnd(!data.hasNext);
      setSearchIsMock(Boolean(data.isMock));
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setSearchLoading(false);
      setSearchDone(true);
    }
  }, [filters.role, filters.city, setSearchJobs, setSearchPage]);

  // 加载更多 — 爬下一页,去重后追加(不替换现有列表)
  const loadMore = useCallback(async () => {
    if (loadingMore || searchLoading || reachedEnd) return;
    if (!filters.role.trim()) return;
    const nextPage = searchPage + 1;
    setLoadingMore(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/m6/search-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: filters.role.trim(),
          city: filters.city === "全国" ? undefined : filters.city || undefined,
          page: nextPage,
          limit: 20,
        }),
      });
      const data: SearchResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setSearchError(data.error ?? `请求失败 ${res.status}`);
        return;
      }
      const incoming = data.jobs ?? [];
      // 跨页去重:id 或 title::company 命中已有的就丢掉(API 单页内已去重,这里防跨页重复)
      setSearchJobs((prev) => {
        const seenId = new Set(prev.map((j) => j.id));
        const seenKey = new Set(
          prev.map((j) => `${(j.title || "").toLowerCase()}::${(j.company || "").toLowerCase()}`),
        );
        const fresh = incoming.filter((j) => {
          const key = `${(j.title || "").toLowerCase()}::${(j.company || "").toLowerCase()}`;
          if (seenId.has(j.id) || seenKey.has(key)) return false;
          seenId.add(j.id);
          seenKey.add(key);
          return true;
        });
        return [...prev, ...fresh];
      });
      setSearchPage(nextPage);
      setReachedEnd(!data.hasNext);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoadingMore(false);
    }
  }, [
    loadingMore,
    searchLoading,
    reachedEnd,
    searchPage,
    filters.role,
    filters.city,
    setSearchJobs,
    setSearchPage,
  ]);

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
    setRecommendPage(1);
    setNoMoreRec(false);

    // 模拟分阶段进度更新(实际后端一次性返回,前端用 timer 演示流水线)
    setAgentSteps({
      splitter: { step: "splitter", status: "running", label: "Agent 1 — Splitter:从简历提取搜索关键词" },
      scraper: { step: "scraper", status: "pending", label: "Crawler:并行抓取猎聘 / 智联等真实岗位" },
      scorer: { step: "scorer", status: "pending", label: "Agent 2 — Scorer:7 维度评分(批量)" },
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
        // 带上 m3 优化后的简历全文 → 匹配以优化版为准(否则一直按原始上传简历推岗位)
        body: JSON.stringify({
          parsedResume,
          optimizedResume: uploadedResume ? undefined : latestResume.finalMarkdown,
        }),
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
        scraper: { step: "scraper", status: "done", label: `Crawler:抓到 ${data.stats.scraped} 个原始岗位`, detail: data.stats.blockedPlatforms.length ? `平台兜底生效,${data.stats.blockedPlatforms.join("/")} 暂不可用,已切换备用平台` : "猎聘 / 智联多平台数据齐全" },
        scorer: { step: "scorer", status: "done", label: `Agent 2 — Scorer:评分 ${data.stats.scored} 个岗位` },
        formatter: { step: "formatter", status: "done", label: `Agent 4 — Formatter:推荐 ${data.stats.recommended} 个(80 分放行 + Fallback 保底)` },
      });
      setRecommendedJobs(sortLiepinFirst(data.jobs));
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

  // 加载更多推荐 — 复用上次关键词/城市,抓下一页,评分后去重追加(变体 A)
  const loadMoreRecommend = useCallback(async () => {
    if (loadingMoreRec || matchLoading || noMoreRec) return;
    if (!parsedResume || !matchMeta.keywords?.length) return;
    setLoadingMoreRec(true);
    setMatchError(null);
    const nextPage = recommendPage + 1;
    try {
      const res = await fetch("/api/m6/match-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parsedResume,
          optimizedResume: uploadedResume ? undefined : latestResume.finalMarkdown,
          keywords: matchMeta.keywords,
          city: matchMeta.city,
          page: nextPage,
        }),
      });
      const data: MatchResumeResponse & { error?: string } = await res.json();
      if (!res.ok) {
        setMatchError(data.error ?? `请求失败 ${res.status}`);
        return;
      }
      // 按 标题::公司 去重(与后端 dedupeJobs 一致),只追加新岗位
      const seen = new Set(
        recommendedJobs.map((j) => `${j.title}::${j.company}`.toLowerCase()),
      );
      const fresh = (data.jobs ?? []).filter(
        (j) => !seen.has(`${j.title}::${j.company}`.toLowerCase()),
      );
      if (fresh.length === 0) {
        setNoMoreRec(true);
      } else {
        setRecommendedJobs(sortLiepinFirst([...recommendedJobs, ...fresh]));
        setRecommendPage(nextPage);
      }
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoadingMoreRec(false);
    }
  }, [
    loadingMoreRec,
    matchLoading,
    noMoreRec,
    parsedResume,
    matchMeta.keywords,
    matchMeta.city,
    recommendPage,
    recommendedJobs,
    uploadedResume,
    latestResume.finalMarkdown,
    setRecommendedJobs,
  ]);

  // ============ 卡片三按钮 handler ============
  // /m6 写"待消费 JD" raw 数据;M3/M5 入口读后预填自有流程
  const writePendingJd = useCallback((job: Job, jdTextFull?: string) => {
    const jdText =
      jdTextFull && jdTextFull.trim().length > 0 ? jdTextFull : job.jdText ?? "";
    const pending = {
      jdText,
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

  // 「用这个优化简历」→ 直接进 /m3 改简历主表单页(图2),不再经过 /m3/jd 中间页。
  // 每次都新建一份简历会话(不复用历史会话,避免混在一起);岗位 JD 用 pending 预填,
  // 看岗位时已知的简历(parsedResume)如有则 seed 进新会话。都没有也照常进页面。
  const handleOptimizeResume = useCallback(
    async (job: Job) => {
      setHandoffJobId(job.id);
      try {
        const jd = await fetchDetail(job); // 先拿真全文(抓不到=空,改简历用岗位名兜底)
        writePendingJd(job, jd);
        if (!user) {
          // 游客:单轨 localStorage,简历沿用本地、JD 由刚写的 pending 预填
          router.push("/m3?new=1&setup=1");
          return;
        }
        // 登录:每次新建一份会话,不和历史简历会话混在一起
        const title = `改简历 · ${job.title}`.slice(0, 40);
        const convId = await createConversation("m3", title);
        if (!convId) {
          router.push("/m3?new=1&setup=1");
          return;
        }
        // 简历只在「用我的简历推荐」路径带过去 — 那条路径用户确实用简历匹配过岗位。
        // 关键词搜索没提供简历 → 新会话留空,用户在 m3 Step 1 自行上传。
        if (activeTab === "recommend" && parsedResume?.basic?.name) {
          await createClient()
            .from("m3_resumes")
            .update({ parsed_resume_json: parsedResume })
            .eq("conversation_id", convId);
        }
        router.push(`/m3?c=${convId}&new=1&setup=1`);
      } finally {
        setHandoffJobId(null);
      }
    },
    [router, writePendingJd, user, parsedResume, activeTab, fetchDetail]
  );

  const handlePracticeInterview = useCallback(
    async (job: Job) => {
      setHandoffJobId(job.id);
      try {
        const jd = await fetchDetail(job);
        writePendingJd(job, jd);
        router.push("/m5");
      } finally {
        setHandoffJobId(null);
      }
    },
    [router, writePendingJd, fetchDetail]
  );

  const handleViewDetail = useCallback(
    async (job: Job) => {
      setDetailModal({ job, jdText: job.jdText ?? "" });
      setDetailLoading(true);
      try {
        const jd = await fetchDetail(job);
        setDetailModal({ job, jdText: jd });
      } finally {
        setDetailLoading(false);
      }
    },
    [fetchDetail]
  );

  // 就地上传简历解析成功 → 持久化 + 即时生效。
  // 游客:落 localStorage(useLatestResume 游客分支会读到);
  // 登录:新建一份 m3 简历会话并写入 parsed_resume_json(跨模块/跨设备可见,落本地兜底)。
  const handleInlineResume = useCallback(
    async (parsed: unknown) => {
      try {
        window.localStorage.setItem(STORAGE_KEYS.PARSED_RESUME, JSON.stringify(parsed));
        // 就地上传 = 一份新的原始简历,旧的优化稿(FINAL_RESUME)已不对应这份 parsed。
        // 不清的话,游客下游 useLatestResume 会把"旧优化稿 + 新 parsed"错配返回。
        window.localStorage.removeItem(STORAGE_KEYS.FINAL_RESUME);
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

          {/* 爬虫不可达 → 演示数据 banner(评委透明:这不是真在招岗位) */}
          {activeTab === "search" && searchIsMock && searchJobs.length > 0 && (
            <div className="mt-6 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span aria-hidden>⚠️</span>
              <span>
                实时爬虫暂时不可达,下方为 <strong>演示示例数据</strong>(非真实在招岗位,链接不可点击)。
                匹配评分、推荐解释等功能逻辑与真数据完全一致 — 待爬虫恢复后即自动切回真岗位。
              </span>
            </div>
          )}

          {/* 结果列表 */}
          {jobsForActiveTab.length > 0 && (
            <section className="mt-8">
              {/* 推荐 tab 保留标题;关键词搜索 tab 不显示"共 X 个"统计标题 */}
              {showMatch && (
                <h2 className="text-lg font-semibold text-ink mb-4">
                  为你推荐 {jobsForActiveTab.length} 个岗位
                </h2>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {jobsForActiveTab.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    showMatch={showMatch}
                    busy={handoffJobId === job.id}
                    onOptimizeResume={handleOptimizeResume}
                    onPracticeInterview={handlePracticeInterview}
                    onViewDetail={handleViewDetail}
                  />
                ))}
              </div>

              {/* 加载更多 — 仅搜索 tab、未翻到末页时显示 */}
              {activeTab === "search" && !reachedEnd && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-esther-blue/40 text-esther-blue bg-esther-blue/5 hover:bg-esther-blue/10 transition-colors text-sm font-medium disabled:opacity-60"
                  >
                    {loadingMore ? "正在抓取更多岗位…(约 20-30s)" : "加载更多岗位 ↓"}
                  </button>
                </div>
              )}

              {/* 加载更多 — 推荐 tab:复用关键词抓下一页,评分后追加 */}
              {activeTab === "recommend" && !matchLoading && (
                <div className="mt-6 flex flex-col items-center gap-2">
                  {!noMoreRec ? (
                    <button
                      onClick={loadMoreRecommend}
                      disabled={loadingMoreRec}
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full border border-esther-blue/40 text-esther-blue bg-esther-blue/5 hover:bg-esther-blue/10 transition-colors text-sm font-medium disabled:opacity-60"
                    >
                      {loadingMoreRec ? "正在为你找更多岗位…(约 30-60s)" : "加载更多岗位 ↓"}
                    </button>
                  ) : (
                    <p className="text-sm text-ink-soft">没有更多匹配岗位了</p>
                  )}
                </div>
              )}
            </section>
          )}

          {/* 搜了但 0 结果 → 给反馈,别让用户以为"点搜索没反应" */}
          {activeTab === "search" &&
            searchDone &&
            !searchLoading &&
            !searchError &&
            searchJobs.length === 0 && (
              <div className="mt-8 text-center text-ink-soft text-sm py-10 border border-dashed border-border rounded-2xl">
                没搜到「{filters.role}」的在招岗位 — 换个关键词或城市再试试。
              </div>
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
          正在从猎聘 / 智联抓取真实岗位...(20-30s)
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
