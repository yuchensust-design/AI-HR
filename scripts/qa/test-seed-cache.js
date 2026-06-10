/* Seed bug: m6 recommend cache must invalidate when the underlying resume changes.
 * Drives guest path (resume content fully controllable via localStorage). */
const { BASE, newBrowser, newGuest } = require("./_lib");

// identical djb2 to app's resumeSignature
function sig(r) {
  if (!r) return "";
  const s = JSON.stringify(r);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const resumeA = { basic: { name: "张三A" }, skills: ["Java", "Spring"], summary: "后端工程师A".repeat(5) };
const resumeB = { basic: { name: "李四B" }, skills: ["React", "TS"], summary: "前端工程师B".repeat(5) };
const jobA = {
  id: "jobA1", title: "后端开发工程师(缓存测试A)", company: "甲公司", city: "上海",
  platform: "51job", jdUrl: "https://example.com/a", matchScore: 88, salary: "20-30k",
};

async function seed(page, resume) {
  await page.evaluate(
    ([job, s, resumeObj]) => {
      localStorage.setItem("parsed_resume", JSON.stringify(resumeObj));
      localStorage.setItem("discover_recommended_jobs", JSON.stringify([job]));
      localStorage.setItem("discover_match_meta", JSON.stringify({ keywords: ["产品"], city: "上海" }));
      localStorage.setItem("discover_recommend_sig", JSON.stringify(s));
      localStorage.setItem("discover_tab", JSON.stringify("recommend"));
    },
    [jobA, sig(resume), resume]
  );
}

(async () => {
  const b = await newBrowser();
  const { ctx, page } = await newGuest(b);
  try {
    // ---- Case 1: sig matches resume A → cached card stays, no stale notice ----
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    await seed(page, resumeA); // sig of resumeA
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    let body = await page.locator("body").innerText();
    const case1 = {
      cardVisible: body.includes("缓存测试A"),
      staleNotice: body.includes("检测到你的简历有更新"),
    };
    console.log("CASE1 (sig matches A):", JSON.stringify(case1), "→", case1.cardVisible && !case1.staleNotice ? "PASS" : "FAIL");

    // ---- Case 2: resume changes to B (sig stored is still A) → cache invalidated ----
    await page.evaluate((resumeObj) => localStorage.setItem("parsed_resume", JSON.stringify(resumeObj)), resumeB);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    body = await page.locator("body").innerText();
    const cleared = await page.evaluate(() => localStorage.getItem("discover_recommended_jobs"));
    const case2 = {
      cardGone: !body.includes("缓存测试A"),
      staleNotice: body.includes("检测到你的简历有更新"),
      cacheCleared: cleared === "[]" || cleared === null,
    };
    console.log("CASE2 (resume changed A→B):", JSON.stringify(case2), "→",
      case2.cardGone && case2.staleNotice && case2.cacheCleared ? "PASS" : "FAIL");
  } catch (e) {
    console.log("ERR", e.message);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
