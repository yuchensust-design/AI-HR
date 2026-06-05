/**
 * 本地 smoke test:启动后跑一次搜索 + 详情,验证基本能跑通
 *
 * 用法:
 *   npm run dev          # 另一个终端开服务
 *   npm run smoke        # 在另一个终端跑
 */

import "dotenv/config";

const BASE = `http://localhost:${process.env.PORT ?? 3030}`;
const KEY = process.env.CRAWLER_API_KEY ?? "dev-secret-change-me";

async function main() {
  console.log("→ GET /health");
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  console.log("  ", health);

  console.log("\n→ POST /search { role: '产品经理', city: '上海' }");
  const t0 = Date.now();
  const searchRes = await fetch(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": KEY },
    body: JSON.stringify({ role: "产品经理", city: "上海", limit: 10 }),
  });
  const search = await searchRes.json();
  console.log(`  status: ${searchRes.status}, took ${Date.now() - t0}ms`);
  console.log(
    `  jobs: ${search.jobs?.length ?? 0}, blocked: ${JSON.stringify(search.blockedPlatforms ?? [])}, total: ${search.total ?? 0}`
  );
  if (search.jobs?.length) {
    const sample = search.jobs[0];
    console.log("  sample:", {
      id: sample.id,
      platform: sample.platform,
      title: sample.title,
      company: sample.company,
      salary: sample.salary,
      city: sample.city,
    });
  }

  // 如果拿到 job,试一下详情
  const first = search.jobs?.[0];
  if (first) {
    console.log(`\n→ POST /detail { jobId: '${first.id}', platform: '${first.platform}' }`);
    const detailRes = await fetch(`${BASE}/detail`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": KEY },
      body: JSON.stringify({ jobId: first.id, platform: first.platform }),
    });
    const detail = await detailRes.json();
    console.log(`  status: ${detailRes.status}`);
    console.log(`  jdText length: ${detail.jdText?.length ?? 0}`);
    if (detail.jdText) {
      console.log(`  jdText preview: ${detail.jdText.slice(0, 200)}...`);
    }
  }

  console.log("\n✓ smoke complete");
}

main().catch((err) => {
  console.error("✗ smoke failed:", err);
  process.exit(1);
});
