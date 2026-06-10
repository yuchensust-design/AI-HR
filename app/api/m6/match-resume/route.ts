/**
 * POST /api/m6/match-resume — 四阶段 Multi-Agent 简历推荐流水线
 *
 * Body: { parsedResume: ParsedResume, cityOverride?: string }
 * Resp: {
 *   keywords: string[],           // Splitter 提取的搜索词,前端展示"为什么搜这些"
 *   city: string,
 *   reasoning: string,
 *   jobs: Job[],                  // 排序后的推荐结果(含 score / highlights / gaps)
 *   stats: { scraped: number, scored: number, recommended: number, blockedPlatforms: string[] }
 * }
 *
 * 流水线:
 *   Agent 1 (Splitter)   - 简历 → 3 个搜索关键词 + 城市
 *   并行调爬虫              - 3 个关键词 × 1 次 = 3 次 /search
 *   Agent 2 (Scorer)     - 批量评分 (10 个/batch)
 *   Agent 3 (Critic)     - 80 分放行 + Fallback 5 个(纯代码,无 LLM)
 *   Agent 4 (Formatter)  - 改写 highlights / gaps 成用户友好文案
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

const CRAWLER_BASE_URL = process.env.CRAWLER_BASE_URL ?? "http://localhost:3030";
const CRAWLER_API_KEY = process.env.CRAWLER_API_KEY ?? "dev-secret-change-me";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// ============ 工具:加载 prompt ============
const promptCache = new Map<string, string>();
async function loadPrompt(name: string): Promise<string> {
  if (promptCache.has(name)) return promptCache.get(name)!;
  const filepath = path.join(process.cwd(), "lib/prompts", name);
  const text = await fs.readFile(filepath, "utf-8");
  promptCache.set(name, text);
  return text;
}

// ============ 类型 ============
interface Job {
  id: string;
  platform: string;
  title: string;
  company: string;
  city: string;
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  experience?: string;
  education?: string;
  tags?: string[];
  jdText?: string;
  jdUrl: string;
  scrapedAt?: string;
  matchScore?: number;
  matchHighlights?: string[];
  matchGaps?: string[];
  matchBreakdown?: { skills: number; experience: number; education: number; industry: number };
}

interface ScorerResult {
  jobId: string;
  score: number;
  breakdown?: { skills: number; experience: number; education: number; industry: number };
  highlights: string[];
  gaps: string[];
}

// ============ Agent 1: Splitter ============
async function runSplitter(parsedResume: unknown, cityOverride?: string): Promise<{
  keywords: string[];
  city: string;
  reasoning: string;
}> {
  const sys = await loadPrompt("m6-splitter.md");
  const userJson = JSON.stringify({ resume: parsedResume, cityOverride }, null, 2);

  const raw = await chat(
    [
      { role: "system", content: sys },
      { role: "user", content: userJson },
    ],
    { model: "chat", temperature: 0.2, max_tokens: 600, jsonMode: true }
  );

  const parsed = JSON.parse(raw);
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.slice(0, 3).map((s: unknown) => String(s))
    : [];
  const city = cityOverride || String(parsed.city ?? "全国");
  const reasoning = String(parsed.reasoning ?? "");

  if (keywords.length === 0) {
    throw new Error("Splitter returned no keywords");
  }
  return { keywords, city, reasoning };
}

// ============ 调爬虫(失败兜底本地 mock,§8.28) ============
async function fetchCrawler(role: string, city: string, limit = 10): Promise<{
  jobs: Job[];
  blockedPlatforms: string[];
  isMock?: boolean;
}> {
  const res = await fetch(`${CRAWLER_BASE_URL}/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": CRAWLER_API_KEY,
    },
    body: JSON.stringify({ role, city, page: 1, limit }),
    signal: AbortSignal.timeout(55_000),
  }).catch((err) => {
    console.warn(
      `[m6/match-resume] crawler unreachable for "${role}" → local mock fallback:`,
      String(err)
    );
    return null;
  });

  if (!res || !res.ok) {
    // 爬虫不可达 → 本地 mock 兜底
    const { generateMockJobs } = await import("@/lib/m6-mock-fallback");
    const mockJobs = generateMockJobs(role, city, Math.min(limit, 6)) as Job[];
    return {
      jobs: mockJobs,
      blockedPlatforms: ["51job", "liepin", "zhilian"],
      isMock: true,
    };
  }
  const data = await res.json();
  return {
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    blockedPlatforms: Array.isArray(data.blockedPlatforms) ? data.blockedPlatforms : [],
    isMock: data.isMock === true,
  };
}

function dedupeJobs(jobs: Job[]): Job[] {
  const seen = new Map<string, Job>();
  for (const j of jobs) {
    // 同 (title + company) 的视为同岗位,跨平台去重
    const key = `${j.title}::${j.company}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, j);
  }
  return Array.from(seen.values());
}

// ============ Agent 2: Scorer ============
async function runScorerBatch(
  parsedResume: unknown,
  jobs: Job[]
): Promise<ScorerResult[]> {
  if (jobs.length === 0) return [];
  const sys = await loadPrompt("m6-scorer.md");

  // 每个 job 的结构化输出(7 维 breakdown + 各 3 条 prose)实测 ~600-900 token。
  // 批量过大 + max_tokens 过小会让 JSON 中途截断 → 整批 JSON.parse 失败 → 这批岗位
  // 被静默丢弃(类③ bug)。故:批大小 5、max_tokens 7000(5×~900 留足余量)。
  const SCORER_BATCH = 5;
  const batches: Job[][] = [];
  for (let i = 0; i < jobs.length; i += SCORER_BATCH) {
    batches.push(jobs.slice(i, i + SCORER_BATCH));
  }

  const allResults: ScorerResult[] = [];

  /** 评一批 → 成功返回 ScorerResult[],失败(截断/超时/坏 JSON)返回 null */
  async function scoreBatch(
    batch: Job[],
    maxTokens: number,
  ): Promise<ScorerResult[] | null> {
    const userJson = JSON.stringify({
      resume: parsedResume,
      jobs: batch.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        salary: j.salary,
        city: j.city,
        experience: j.experience,
        education: j.education,
        tags: j.tags ?? [],
        jdText: j.jdText,
      })),
    });
    try {
      const raw = await chat(
        [
          { role: "system", content: sys },
          { role: "user", content: userJson },
        ],
        { model: "chat", temperature: 0.3, max_tokens: maxTokens, jsonMode: true }
      );
      const parsed = JSON.parse(raw);
      const scores = Array.isArray(parsed.scores) ? parsed.scores : [];
      return scores.map((s: Record<string, unknown>) => ({
        jobId: String(s.jobId ?? ""),
        score: Math.max(0, Math.min(100, Number(s.score ?? 0))),
        breakdown: s.breakdown as ScorerResult["breakdown"],
        highlights: Array.isArray(s.highlights) ? s.highlights.map(String).slice(0, 3) : [],
        gaps: Array.isArray(s.gaps) ? s.gaps.map(String).slice(0, 3) : [],
      }));
    } catch (err) {
      console.warn("Scorer batch failed:", err);
      return null;
    }
  }

  /** 仍拿不到分的 job:给可见降级分(而非静默消失),gap 文案明示未详细分析 */
  const degraded = (j: Job): ScorerResult => ({
    jobId: j.id,
    score: 50,
    highlights: [],
    gaps: ["⚠️ 该岗位评分超时,未能详细分析,仅供参考"],
  });

  await Promise.all(
    batches.map(async (batch) => {
      let res = await scoreBatch(batch, 7000);
      if (res === null) {
        // 整批失败 → 拆成单条重试(单条 JSON 小、几乎不会截断);仍失败的给降级分,不丢
        const singles = await Promise.all(batch.map((j) => scoreBatch([j], 2000)));
        res = singles.flatMap((r, i) => r ?? [degraded(batch[i])]);
      }
      // 批内 LLM 漏评的 job 也补降级分,保证每个 job 都有结果
      const got = new Set(res.map((r) => r.jobId));
      for (const j of batch) if (!got.has(j.id)) res.push(degraded(j));
      allResults.push(...res);
    })
  );

  return allResults;
}

// ============ Agent 3: Critic — 80 分放行 + Fallback ============
function applyCritic(jobs: Job[], scores: ScorerResult[]): Job[] {
  const scoreMap = new Map(scores.map((s) => [s.jobId, s]));

  // 先合并 score 信息到 job
  const merged: Job[] = jobs.map((j) => {
    const s = scoreMap.get(j.id);
    return {
      ...j,
      matchScore: s?.score,
      matchBreakdown: s?.breakdown,
      matchHighlights: s?.highlights ?? [],
      matchGaps: s?.gaps ?? [],
    };
  });

  // 有分的优先,无分的全过滤掉
  const scored = merged.filter((j) => j.matchScore !== undefined);

  const passing = scored.filter((j) => (j.matchScore ?? 0) >= 80);
  const fallback = scored
    .filter((j) => (j.matchScore ?? 0) < 80)
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))
    .slice(0, 5);

  // 51job 已在上游整体过滤,这里只按匹配分排序
  return [...passing, ...fallback].sort(
    (a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0),
  );
}

// ============ Agent 4: Formatter ============
async function runFormatter(jobs: Job[]): Promise<Job[]> {
  if (jobs.length === 0) return jobs;
  const sys = await loadPrompt("m6-formatter.md");

  try {
    const userJson = JSON.stringify({
      items: jobs.map((j) => ({
        jobId: j.id,
        score: j.matchScore,
        highlights: j.matchHighlights ?? [],
        gaps: j.matchGaps ?? [],
      })),
    });

    const raw = await chat(
      [
        { role: "system", content: sys },
        { role: "user", content: userJson },
      ],
      { model: "chat", temperature: 0.5, max_tokens: 3000, jsonMode: true }
    );
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const formatMap = new Map(items.map((it: { jobId: string }) => [String(it.jobId), it]));

    return jobs.map((j) => {
      const f = formatMap.get(j.id) as { highlights?: unknown; gaps?: unknown } | undefined;
      if (!f) return j;
      return {
        ...j,
        matchHighlights: Array.isArray(f.highlights)
          ? f.highlights.map(String).slice(0, 3)
          : j.matchHighlights,
        matchGaps: Array.isArray(f.gaps)
          ? f.gaps.map(String).slice(0, 3)
          : j.matchGaps,
      };
    });
  } catch (err) {
    console.warn("Formatter failed, returning raw:", err);
    return jobs;
  }
}

// ============ POST ============
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedResume = body.parsedResume;
    const cityOverride = typeof body.cityOverride === "string" ? body.cityOverride : undefined;

    if (!parsedResume) {
      return NextResponse.json(
        { error: "parsedResume required" },
        { status: 400 }
      );
    }

    // Stage 1: Splitter
    const split = await runSplitter(parsedResume, cityOverride);

    // Stage 2: 并行调爬虫
    const crawlerResults = await Promise.all(
      split.keywords.map((kw) => fetchCrawler(kw, split.city, 10))
    );
    // 方案 D:不显示 51job(列表卡能拿,但 jdUrl 落搜索页、JD 详情抓不到)
    const allJobs = crawlerResults
      .flatMap((r) => r.jobs)
      .filter((j) => j.platform !== "51job");
    const blockedPlatforms = Array.from(
      new Set(crawlerResults.flatMap((r) => r.blockedPlatforms))
    ).filter((p) => p !== "51job");
    const deduped = dedupeJobs(allJobs);

    if (deduped.length === 0) {
      return NextResponse.json(
        {
          keywords: split.keywords,
          city: split.city,
          reasoning: split.reasoning,
          jobs: [],
          stats: {
            scraped: 0,
            scored: 0,
            recommended: 0,
            blockedPlatforms,
          },
          warning: "暂时没抓到岗位,请稍后重试或检查爬虫服务",
        },
        { status: 200 }
      );
    }

    // Stage 3: Scorer (批量)
    const scores = await runScorerBatch(parsedResume, deduped);

    // Stage 4: Critic (代码逻辑)
    const passed = applyCritic(deduped, scores);

    // Stage 5: Formatter (改写文案)
    const formatted = await runFormatter(passed);

    return NextResponse.json({
      keywords: split.keywords,
      city: split.city,
      reasoning: split.reasoning,
      jobs: formatted,
      stats: {
        scraped: allJobs.length,
        scored: scores.length,
        recommended: formatted.length,
        blockedPlatforms,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m6/match-resume error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
