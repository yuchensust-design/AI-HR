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

const CRAWLER_BASE_URL = process.env.CRAWLER_BASE_URL ?? "http://localhost:3030";
const CRAWLER_API_KEY = process.env.CRAWLER_API_KEY ?? "dev-secret-change-me";

export const dynamic = "force-dynamic"; // 不缓存
export const maxDuration = 60; // Vercel 60s 上限,刚好够爬虫慢响应

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const role = typeof body.role === "string" ? body.role.trim() : "";
    const city = typeof body.city === "string" ? body.city.trim() : undefined;
    const page = Number(body.page ?? 1);
    const limit = Number(body.limit ?? 20);

    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    const upstream = await fetch(`${CRAWLER_BASE_URL}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": CRAWLER_API_KEY,
      },
      body: JSON.stringify({ role, city, page, limit }),
      // crawler 端可能慢,内部 ~25-30s
      signal: AbortSignal.timeout(55_000),
    }).catch((err) => {
      throw new Error(`crawler unreachable: ${String(err)}`);
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.warn(`/api/m6/search-jobs crawler returned ${upstream.status}:`, text.slice(0, 500));
      return NextResponse.json(
        {
          error: "crawler unavailable",
          status: upstream.status,
          detail: text.slice(0, 500),
        },
        { status: 503 }
      );
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

      // ==== Post-filter(plan offer-1-sparkling-hippo P1)====
      // 减少"搜 AI 产品实习出现总账会计"这类不相关结果
      const roleKw = role.toLowerCase();
      const wantsIntern = /实习|intern/.test(roleKw);
      const wantsGraduate = /校招|应届|graduate/.test(roleKw);
      const roleTokens: string[] = roleKw
        .replace(/[实习生|实习|校招|应届|岗|师|员]/g, " ")
        .split(/\s+/)
        .filter((t: string) => t.length >= 1);

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

          // 3) 经验过滤:title / experience 含 "3 年以上" / "5 年" / "10 年" → 排除(学生场景)
          const seniorMatch = /(3-?5|5-?10|3年以上|5年以上|10年|经验丰富|资深|高级|总监|leader|经理)/.test(
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
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m6/search-jobs error:", err);
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
