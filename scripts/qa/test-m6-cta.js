/* Cross-module CTA hunt (bug class #1): m6 → m3 / m6 → m5, logged-in.
 * Seeds a search job (avoids slow crawler API) then clicks each CTA and traces:
 *  - nav sequence (double-jump?), final URL (correct ?c= for m3), JD handoff survived. */
const { BASE, newBrowser, newLoggedIn, clickAndTrace, snapText } = require("./_lib");

const JD = "岗位职责:负责B端产品的需求分析、原型设计与跨团队协作推进。任职要求:3年以上产品经验,熟悉数据分析,有SaaS背景优先,沟通能力强。".repeat(2);
const job = {
  id: "ctaJob1", title: "高级产品经理(CTA测试)", company: "字节跳动", city: "上海",
  platform: "51job", jdUrl: "https://example.com/cta", salary: "30-50k", jdText: JD,
  tags: ["产品", "数据分析"], experience: "3-5年", education: "本科",
};

async function seedSearch(page) {
  await page.evaluate((j) => {
    localStorage.setItem("discover_search_jobs", JSON.stringify([j]));
    localStorage.setItem("discover_tab", JSON.stringify("search"));
  }, job);
}

(async () => {
  const b = await newBrowser();
  const { ctx, page, rec, loggedIn } = await newLoggedIn(b);
  console.log("loggedIn:", loggedIn);
  try {
    // ---- m6 → m3 (用这个优化简历) ----
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    await seedSearch(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const cardSeen = (await snapText(page)).includes("CTA测试");
    const t1 = await clickAndTrace(
      page, rec,
      (p) => p.locator('button:has-text("用这个优化简历")').first().click(),
      { settleMs: 3000 }
    );
    const land1 = await snapText(page);
    console.log("\n[m6→m3 用这个优化简历]");
    console.log("  cardSeen:", cardSeen);
    console.log("  softSeq:", t1.softSeq, "| hardSeq:", t1.hardSeq);
    console.log("  doubleJump:", t1.doubleJump);
    console.log("  finalUrl:", t1.finalUrl.replace(BASE, ""));
    console.log("  landed /m3/jd with ?c=:", /\/m3\/jd\?c=/.test(t1.finalUrl));
    console.log("  bounced to bare /m3 (lost ctx):", /\/m3(\?|$)/.test(t1.finalUrl) && !/\/m3\//.test(t1.finalUrl));
    console.log("  JD roleName present on landing:", land1.includes("高级产品经理"));
    console.log("  M6_PENDING_JD consumed:", (await page.evaluate(() => localStorage.getItem("m6_pending_jd"))) === null);

    // ---- m6 → m5 (用这个练面试) ----
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    await seedSearch(page);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const t2 = await clickAndTrace(
      page, rec,
      (p) => p.locator('button:has-text("用这个练面试")').first().click(),
      { settleMs: 3000 }
    );
    const land2 = await snapText(page);
    console.log("\n[m6→m5 用这个练面试]");
    console.log("  softSeq:", t2.softSeq, "| hardSeq:", t2.hardSeq);
    console.log("  doubleJump:", t2.doubleJump);
    console.log("  finalUrl:", t2.finalUrl.replace(BASE, ""));
    console.log("  landed on /m5:", /\/m5(\?|$)/.test(t2.finalUrl));
    console.log("  JD roleName prefilled:", land2.includes("高级产品经理") || land2.includes("字节跳动"));
    console.log("  M6_PENDING_JD consumed:", (await page.evaluate(() => localStorage.getItem("m6_pending_jd"))) === null);

    console.log("\nCONSOLE ERRORS:", rec.consoleErrors.slice(0, 8));
    console.log("PAGE ERRORS:", rec.pageErrors.slice(0, 8));
  } catch (e) {
    console.log("ERR", e.message, e.stack);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
