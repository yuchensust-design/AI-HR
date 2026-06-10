/**
 * API 滥用防护(评委加固 2026-06-10)
 *
 * 背景:本站 LLM / 语音凭证接口走「前端 proxy」模式 —— API key 留后端,
 * 前端只调 /api/*。游客模式是产品刻意设计(不强制登录),所以不能用
 * 「必须登录」来防刷,否则砸掉核心体验。
 *
 * 防御取向:在 middleware 单点收口,挡掉两类真实威胁,且不影响站内游客:
 *   1. 同源校验 —— 浏览器对跨站/非简单请求会带 Origin 头;curl/脚本默认不带。
 *      要求「写类请求(POST 等)的 Origin/Referer 必须匹配本站」即可挡掉:
 *        · curl 直接刷 /api/chat 烧 token
 *        · 第三方站点盗用我们的 endpoint
 *      同源 fetch 一定带 Origin,游客不受影响。
 *   2. 轻量限流 —— per-IP 滑动窗口,挡住单 IP 高频脚本。
 *      注意:Vercel serverless 是多实例,内存计数只在单实例内有效,
 *      所以这是「抬高门槛」而非「绝对防线」;要硬防需接 Upstash/Redis(见文档)。
 */

import { NextResponse, type NextRequest } from "next/server";

/** 需要防护的写类方法(读类 GET/HEAD 放行) */
const GUARDED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** 限流:同一 IP 在 WINDOW_MS 内最多 MAX_HITS 次写请求 */
const WINDOW_MS = 60_000;
const MAX_HITS = 40;
const hits = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(ip, arr);
  // 顺手清理过期 key,避免内存无限涨
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (v.every((t) => now - t >= WINDOW_MS)) hits.delete(k);
    }
  }
  return arr.length > MAX_HITS;
}

/**
 * 校验 /api 写请求是否同源且未超频。
 * @returns 不通过时返回应当直接回给客户端的 NextResponse;通过返回 null。
 */
export function guardApiRequest(req: NextRequest): NextResponse | null {
  if (!GUARDED_METHODS.has(req.method)) return null;

  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // 同源校验:Origin 优先,缺 Origin 时退回 Referer(部分浏览器同源 POST 只带 Referer)
  let sameOrigin = false;
  try {
    if (origin) {
      sameOrigin = new URL(origin).host === host;
    } else if (referer) {
      sameOrigin = new URL(referer).host === host;
    }
  } catch {
    sameOrigin = false;
  }

  if (!sameOrigin) {
    return NextResponse.json(
      { error: "跨源请求被拒绝 — 该接口仅供本站调用" },
      { status: 403 },
    );
  }

  if (rateLimited(clientIp(req))) {
    return NextResponse.json(
      { error: "请求过于频繁,请稍后再试" },
      { status: 429 },
    );
  }

  return null;
}
