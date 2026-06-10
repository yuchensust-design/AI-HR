/**
 * POST /api/m6/search-jobs — 关键词 + 城市搜索真实在招岗位
 *
 * 代理到独立爬虫服务 (CRAWLER_BASE_URL),双平台并行 + 兜底
 *
 * Body: { role: string, city?: string, page?: number, limit?: number }
 * Resp: { jobs: Job[], blockedPlatforms?: string[], total, hasNext, cached }
 *
 * 错误:
 *   400 - 缺 role
 *   503 - 爬虫服务不可达 / 两个平台都被封
 */

import { NextRequest, NextResponse } from "next/server";
import { generateMockJobs } from "@/lib/m6-mock-fallback";

const CRAWLER_BASE_URL = process.env.CRAWLER_BASE_URL ?? "http://localhost:3030";
const CRAWLER_API_KEY = process.env.CRAWLER_API_KEY ?? "dev-secret-change-me";

export const dynamic = "force-dynamic"; // 不缓存
export const maxDuration = 60; // Vercel 60s 上限,刚好够爬虫慢响应

/** §8.28 — 本地 mock 兜底:构造跟爬虫一致的 response shape */
function buildLocalMockResponse(role: string, city: string, limit: number) {
  // 方案 D:不显示 51job(列表卡能拿,但 jdUrl 落搜索页、JD 详情抓不到)
  const jobs = generateMockJobs(role, city, Math.min(limit, 6)).filter(
    (j) => j.platform !== "51job",
  );
  return {
    jobs,
    blockedPlatforms: ["liepin", "zhilian"],
    total: jobs.length,
    hasNext: false,
    cached: false,
    isMock: true,
    mockReason: "crawler-unreachable",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : "上海";
    const page = Number(body.page ?? 1);
    const limit = Number(body.limit ?? 20);

    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    // ===== Layer 1: 调真爬虫,失败兜底本地 mock =====
    let upstream: Response;
    try {
      upstream = await fetch(`${CRAWLER_BASE_URL}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": CRAWLER_API_KEY,
        },
        body: JSON.stringify({ role, city, page, limit }),
        // crawler 端可能慢,内部 ~25-30s
        signal: AbortSignal.timeout(55_000),
      });
    } catch (err) {
      // 爬虫服务整个不可达(腾讯云挂 / 本地没起 / 网络断)→ 本地 mock 兜底
      console.warn(
        `[m6/search-jobs] crawler unreachable → local mock fallback:`,
        String(err)
      );
      return NextResponse.json(buildLocalMockResponse(role, city, limit));
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      console.warn(
        `[m6/search-jobs] crawler returned ${upstream.status} → local mock fallback:`,
        text.slice(0, 200)
      );
      return NextResponse.json(buildLocalMockResponse(role, city, limit));
    }

    const data = await upstream.json();

    // 去重(同 id 视为同岗位;同 title+company 也视为同岗位 — 51job 列表可能有重复展示)
    if (Array.isArray(data.jobs)) {
      const seenId = new Set<string>();
      const seenKey = new Set<string>();
      data.jobs = data.jobs.filter((j: { id: string; title: string; company: string }) => {
        if (seenId.has(j.id)) return false;
        const key = `${(j.title || "").toLowerCase()}::${(j.company || "").toLowerCase()}`;
        if (seenKey.has(key)) return false;
        seenId.add(j.id);
        seenKey.add(key);
        return true;
      });

      // 方案 D:不显示 51job —— 它只能拿到列表卡,jdUrl 落搜索页、JD 详情抓不到。
      // 放在去重后、anti-noise/兜底/排序之前,确保所有下游分支都不含 51job。
      data.jobs = (data.jobs as Array<{ platform?: string }>).filter(
        (j) => j.platform !== "51job",
      );

      // ==== Post-filter(plan offer-1-sparkling-hippo P1)====
      // 减少"搜 AI 产品实习出现总账会计"这类不相关结果
      // Mock fallback 数据已保证 role 匹配 + 经验合适,跳过 filter 避免误杀(如 "产品经理" 命中 /经理/ 正则)
      if (data.isMock) {
        data.total = data.jobs.length;
        data.anti_noise_filtered = 0;
        return NextResponse.json(data);
      }
      const roleKw = role.toLowerCase();
      const wantsIntern = /实习|intern/.test(roleKw);
      const wantsGraduate = /校招|应届|graduate/.test(roleKw);
      // 中文搜索词不能按空格分词:对"AI产品经理"要能命中"产品经理"标题。
      // 取 英文/数字连续段 + 中文连续段及其 2-gram 作为相关性 token。
      const cleaned = roleKw.replace(/[实习生实习校招应届岗师员()（）]/g, " ");
      const tokenSet = new Set<string>();
      for (const m of cleaned.matchAll(/[a-z0-9]+/g)) {
        if (m[0].length >= 2) tokenSet.add(m[0]);
      }
      for (const m of cleaned.matchAll(/[一-龥]+/g)) {
        const s = m[0];
        if (s.length >= 2) tokenSet.add(s);
        for (let i = 0; i + 2 <= s.length; i++) tokenSet.add(s.slice(i, i + 2));
      }
      const roleTokens: string[] = [...tokenSet];

      const rawJobs = [...data.jobs];
      const beforeFilter = data.jobs.length;
      data.jobs = data.jobs.filter(
        (j: {
          title?: string;
          city?: string;
          experience?: string;
          salary?: string;
        }) => {
          const title = (j.title ?? "").toLowerCase();
          const exp = (j.experience ?? "").toLowerCase();
          const jobCity = (j.city ?? "").toLowerCase();

          // 1) 实习关键词:title 必须含 实习 / intern,或经验 = 无 / 在校
          if (wantsIntern) {
            const hasInternMarker =
              /实习|intern/.test(title) ||
              /无经验|无要求|在校|应届/.test(exp);
            if (!hasInternMarker) return false;
          }

          // 2) 校招应届:title 含 校招 / 应届 / 实习,或 exp 含 应届 / 无经验
          if (wantsGraduate) {
            const hasGradMarker =
              /校招|应届|实习/.test(title) ||
              /应届|无经验/.test(exp);
            if (!hasGradMarker) return false;
          }

          // 3) 经验过滤:title / experience 含 "3 年以上" / "5 年" / "10 年" 等真·资深信号 → 排除(学生场景)。
          // 注意:不要把"经理"当资深信号 —— "产品经理/客户经理"常是入门岗,且正是用户搜索词,会误杀全部。
          const seniorMatch = /(3-?5|5-?10|3年以上|5年以上|10年|经验丰富|资深|总监|director)/.test(
            `${title} ${exp}`,
          );
          if (seniorMatch) return false;

          // 4) 城市过滤:用户指定 city 时,job.city 必须包含或为空(空表示远程/未填)
          if (city && jobCity && !jobCity.includes(city.toLowerCase()) && !city.toLowerCase().includes(jobCity)) {
            return false;
          }

          // 5) 标题相关性:title 必须命中 role 的至少 1 个 token(避免完全不相关)
          if (roleTokens.length > 0) {
            const matched = roleTokens.some((t) => title.includes(t));
            if (!matched) return false;
          }

          return true;
        },
      );

      data.total = data.jobs.length;
      data.anti_noise_filtered = beforeFilter - data.jobs.length;

      // 安全网:过滤把结果清空了(搜的词太具体 / 命中误杀正则)→ 回退到仅城市过滤的原始
      // 结果,绝不让"明明有真岗位"却显示 0 个。
      if (data.jobs.length === 0 && rawJobs.length > 0) {
        const cityKw = (city ?? "").toLowerCase();
        data.jobs = rawJobs.filter((j: { city?: string }) => {
          const jc = (j.city ?? "").toLowerCase();
          return !cityKw || !jc || jc.includes(cityKw) || cityKw.includes(jc);
        });
        data.total = data.jobs.length;
        data.anti_noise_filtered = 0;
        data.noiseFallback = true;
      }
      // (51job 已在去重后整体过滤,无需再做平台降权排序)
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m6/search-jobs error:", err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
