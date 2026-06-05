/**
 * Fastify HTTP 入口
 *
 * 路由:
 *   GET  /health                                — 健康检查
 *   POST /search { role, city?, page?, limit?, platforms? } — 双平台并行搜索
 *   POST /detail { jobId, platform }            — 单岗位详情(含 JD 全文)
 *
 * 认证: 所有 POST 路由检查 X-API-Key header(GET /health 免鉴权)
 *
 * 兜底策略: Promise.allSettled 任一平台成功就返回;都失败才 503
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import { config } from "./config.js";
import { ALL_PLATFORMS, adapters } from "./crawler/adapters/index.js";
import { platformQueue } from "./ratelimit.js";
import { cacheList, readList, cacheDetail, readDetail } from "./cache.js";
import type { Platform, Job } from "./crawler/adapters/types.js";

const fastify = Fastify({
  logger: { level: "info" },
  bodyLimit: 1 * 1024 * 1024,
});

await fastify.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
});

// 鉴权钩子(GET /health 跳过)
fastify.addHook("onRequest", async (request, reply) => {
  if (request.method === "GET" && request.url.startsWith("/health")) return;
  const key = request.headers["x-api-key"];
  if (key !== config.apiKey) {
    reply.code(401).send({ error: "missing or invalid X-API-Key" });
  }
});

// ============ /health ============
fastify.get("/health", async () => ({
  status: "ok",
  uptime: process.uptime(),
  platforms: ALL_PLATFORMS,
}));

// ============ /search ============
interface SearchBody {
  role?: string;
  city?: string;
  page?: number;
  limit?: number;
  platforms?: Platform[];
}

fastify.post<{ Body: SearchBody }>("/search", async (request, reply) => {
  const { role, city, page = 1, limit = 20, platforms } = request.body ?? {};
  if (!role || typeof role !== "string") {
    return reply.code(400).send({ error: "role required" });
  }

  const selectedPlatforms: Platform[] = (platforms && platforms.length > 0
    ? platforms.filter((p) => ALL_PLATFORMS.includes(p))
    : ALL_PLATFORMS) as Platform[];

  if (selectedPlatforms.length === 0) {
    return reply.code(400).send({ error: "no valid platforms" });
  }

  const cacheKey = `${selectedPlatforms.sort().join(",")}:list:${role}:${city ?? ""}:${page}:${limit}`;
  const cached = readList<{ jobs: Job[]; blockedPlatforms: Platform[] }>(cacheKey);
  if (cached) {
    return {
      ...cached,
      total: cached.jobs.length,
      hasNext: cached.jobs.length >= limit,
      cached: true,
    };
  }

  // 并行 + p-queue 限速
  const results = await Promise.allSettled(
    selectedPlatforms.map((p) =>
      platformQueue(p).add(() =>
        adapters[p].search({ role, city, page, limit })
      )
    )
  );

  const jobs: Job[] = [];
  const blockedPlatforms: Platform[] = [];

  results.forEach((r, i) => {
    const platform = selectedPlatforms[i]!;
    if (
      r.status === "fulfilled" &&
      r.value &&
      Array.isArray((r.value as { jobs?: Job[] }).jobs) &&
      (r.value as { jobs: Job[] }).jobs.length > 0
    ) {
      jobs.push(...(r.value as { jobs: Job[] }).jobs);
    } else {
      blockedPlatforms.push(platform);
      const reason =
        r.status === "rejected"
          ? String(r.reason)
          : r.value
            ? `empty jobs (${(r.value as { jobs?: Job[] }).jobs?.length ?? 0})`
            : "no value (queue cancelled?)";
      fastify.log.warn({ platform, err: reason }, "platform failed");
    }
  });

  if (jobs.length === 0) {
    // 反爬封锁 fallback — 返 mock 岗位让 demo 不挂(plan §8.24 / m6 决策)
    const { generateMockJobs } = await import("./mock-jobs.js");
    const mockJobs = generateMockJobs(role, city, limit);
    fastify.log.warn(
      { blockedPlatforms, mockCount: mockJobs.length },
      "all platforms blocked, serving mock jobs",
    );
    return {
      jobs: mockJobs,
      blockedPlatforms,
      total: mockJobs.length,
      hasNext: false,
      cached: false,
      isMock: true,
      mockNotice:
        "当前真实数据被反爬封锁,显示演示岗位。生产环境用代理 IP 池突破反爬。",
    };
  }

  const payload = { jobs, blockedPlatforms };
  cacheList(cacheKey, payload);

  return {
    ...payload,
    total: jobs.length,
    hasNext: jobs.length >= limit,
    cached: false,
  };
});

// ============ /detail ============
interface DetailBody {
  jobId?: string;
  platform?: Platform;
}

fastify.post<{ Body: DetailBody }>("/detail", async (request, reply) => {
  const { jobId, platform } = request.body ?? {};
  if (!jobId || !platform) {
    return reply.code(400).send({ error: "jobId and platform required" });
  }
  if (!ALL_PLATFORMS.includes(platform)) {
    return reply.code(400).send({ error: `unsupported platform: ${platform}` });
  }

  const cacheKey = `${platform}:detail:${jobId}`;
  const cached = readDetail<{ jdText: string; job: Job }>(cacheKey);
  if (cached) return { ...cached, cached: true };

  try {
    const result = await platformQueue(platform).add(() =>
      adapters[platform].detail({ jobId })
    );
    if (!result) {
      return reply.code(502).send({ error: "adapter returned no result" });
    }
    cacheDetail(cacheKey, result);
    return { ...result, cached: false };
  } catch (err) {
    fastify.log.error({ err, jobId, platform }, "detail failed");
    return reply.code(503).send({ error: String(err) });
  }
});

// 启动
const port = config.port;
fastify
  .listen({ port, host: "0.0.0.0" })
  .then(() => {
    fastify.log.info(`crawler service listening on :${port}`);
  })
  .catch((err) => {
    fastify.log.error(err);
    process.exit(1);
  });
