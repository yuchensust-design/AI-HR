/* Seed bug + UX: when the underlying resume changes, m6 recommend cache must NOT be silently
 * shown as current — but per product decision we KEEP the old cards and show a non-destructive
 * banner (not clear them). Also: a DB jsonb key-reorder of the SAME resume must NOT false-trigger.
 * Guest path (resume content fully controllable via localStorage). */
const { BASE, newBrowser, newGuest } = require("./_lib");

// key-order-independent sig — must match app's resumeSignature (stableStringify + djb2)
function stableStringify(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStringify(v[k])).join(",") + "}";
}
function sig(r) {
  if (!r) return "";
  const s = stableStringify(r);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const resumeA = { basic: { name: "张三A" }, skills: ["Java", "Spring"], summary: "后端工程师A".repeat(5) };
// same content as A but different key order (simulates Postgres jsonb round-trip)
const resumeA_reordered = { summary: "后端工程师A".repeat(5), skills: ["Java", "Spring"], basic: { name: "张三A" } };
const resumeB = { basic: { name: "李四B" }, skills: ["React", "TS"], summary: "前端工程师B".repeat(5) };
const jobA = {
  id: "jobA1", title: "后端开发工程师(缓存测试A)", company: "甲公司", city: "上海",
  platform: "51job", jdUrl: "https://example.com/a", matchScore: 88, salary: "20-30k",
};

async function setResume(page, resume) {
  await page.evaluate((r) => localStorage.setItem("parsed_resume", JSON.stringify(r)), resume);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1600);
  return (await page.locator("body").innerText());
}

const NOTICE = "简历有更新";

(async () => {
  const b = await newBrowser();
  const { ctx, page } = await newGuest(b);
  let pass = true;
  try {
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    // seed: cached jobA + sig of resumeA + resumeA present
    await page.evaluate(([job, s, r]) => {
      localStorage.setItem("parsed_resume", JSON.stringify(r));
      localStorage.setItem("discover_recommended_jobs", JSON.stringify([job]));
      localStorage.setItem("discover_match_meta", JSON.stringify({ keywords: ["产品"], city: "上海" }));
      localStorage.setItem("discover_recommend_sig", JSON.stringify(s));
      localStorage.setItem("discover_tab", JSON.stringify("recommend"));
    }, [jobA, sig(resumeA), resumeA]);

    // CASE1: sig matches A → card stays, no banner
    let body = await setResume(page, resumeA);
    const c1 = { card: body.includes("缓存测试A"), notice: body.includes(NOTICE) };
    const c1ok = c1.card && !c1.notice;
    console.log("CASE1 (sig matches A):", JSON.stringify(c1), "→", c1ok ? "PASS" : "FAIL");
    pass = pass && c1ok;

    // CASE2 (the user's bug): same resume, keys reordered (DB jsonb round-trip) → NO false banner
    body = await setResume(page, resumeA_reordered);
    const c2 = { card: body.includes("缓存测试A"), notice: body.includes(NOTICE) };
    const c2ok = c2.card && !c2.notice;
    console.log("CASE2 (same resume, key reorder → no false banner):", JSON.stringify(c2), "→", c2ok ? "PASS" : "FAIL");
    pass = pass && c2ok;

    // CASE3: resume genuinely changes A→B → KEEP old cards + show banner (non-destructive)
    body = await setResume(page, resumeB);
    const stored = await page.evaluate(() => localStorage.getItem("discover_recommended_jobs"));
    const c3 = {
      cardKept: body.includes("缓存测试A"),
      notice: body.includes(NOTICE),
      cacheNotCleared: !!stored && stored !== "[]",
    };
    const c3ok = c3.cardKept && c3.notice && c3.cacheNotCleared;
    console.log("CASE3 (resume changed A→B → keep + banner):", JSON.stringify(c3), "→", c3ok ? "PASS" : "FAIL");
    pass = pass && c3ok;

    console.log(pass ? "\nALL PASS" : "\nSOME FAIL");
  } catch (e) {
    console.log("ERR", e.message);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
