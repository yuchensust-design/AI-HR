import "dotenv/config";

function num(key: string, def: number): number {
  const raw = process.env[key];
  if (!raw) return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

function bool(key: string, def: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined) return def;
  return raw === "true" || raw === "1";
}

export const config = {
  port: num("PORT", 3030),
  apiKey: process.env.CRAWLER_API_KEY ?? "dev-secret-change-me",
  headless: bool("HEADLESS", true),
  listCacheTtlMs: num("LIST_CACHE_TTL_MS", 60 * 60 * 1000),
  detailCacheTtlMs: num("DETAIL_CACHE_TTL_MS", 6 * 60 * 60 * 1000),
  platformConcurrency: num("PLATFORM_CONCURRENCY", 2),
  scrapeTimeoutMs: num("SCRAPE_TIMEOUT_MS", 30_000),
};
