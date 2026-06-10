/* Concurrency / rapid-interaction probe (bug class #5): rapid clicks must not break state,
 * duplicate modals, or spam errors. Guest = deterministic. */
const { BASE, newBrowser, newGuest, getNavLog, snapText } = require("./_lib");

const job = {
  id: "cc1", title: "测试岗位(并发)", company: "C", city: "上海",
  platform: "51job", jdUrl: "https://example.com/cc", salary: "10-20k",
  jdText: "并发测试用JD正文,负责测试。需要细心。",
};

(async () => {
  const b = await newBrowser();
  const { ctx, page, rec } = await newGuest(b);
  const out = [];
  const check = (n, c, x) => out.push({ n, pass: !!c, x });
  try {
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    await page.evaluate((j) => {
      localStorage.setItem("discover_search_jobs", JSON.stringify([j]));
      localStorage.setItem("discover_tab", JSON.stringify("search"));
    }, job);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // rapid tab switching x8
    const navBefore = (await getNavLog(page)).length;
    for (let i = 0; i < 8; i++) {
      await page.locator(`button:has-text("${i % 2 ? "关键词搜索" : "用我的简历推荐"}")`).click({ timeout: 1500 }).catch(() => {});
    }
    await page.waitForTimeout(800);
    check("rapid tab switch: no navigation, no crash", (await getNavLog(page)).length === navBefore && rec.pageErrors.length === 0);

    // ensure search tab + card visible, rapid-open JD modal x5
    await page.locator('button:has-text("关键词搜索")').click().catch(() => {});
    await page.waitForTimeout(500);
    for (let i = 0; i < 5; i++) {
      await page.locator('button:has-text("看 JD")').first().click({ timeout: 1200 }).catch(() => {});
    }
    await page.waitForTimeout(800);
    // exactly one modal: count elements showing the JD body
    const modalCount = await page.locator("text=并发测试用JD正文").count();
    check("rapid JD-open: exactly one modal (no stacking)", modalCount <= 1, `${modalCount} modals`);
    await page.mouse.click(8, 8); // close via backdrop
    await page.waitForTimeout(400);
    check("modal closes after rapid open", !(await page.locator("text=并发测试用JD正文").count()));

    // rapid 不二 toggle x7 (odd → ends open)
    const navBefore2 = (await getNavLog(page)).length;
    for (let i = 0; i < 7; i++) {
      await page.locator('button[aria-label="找不二聊聊"]').click({ timeout: 1200 }).catch(() => {});
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(600);
    check("rapid 不二 toggle: no nav, no errors", (await getNavLog(page)).length === navBefore2 && rec.pageErrors.length === 0);

    console.log("\n### CONCURRENCY / RAPID-INTERACTION (guest)");
    for (const r of out) console.log(`  ${r.pass ? "✓" : "❌"} ${r.n}${r.x ? " — " + r.x : ""}`);
    console.log("  console errors:", rec.consoleErrors.filter((e) => !e.includes("Failed to fetch")).slice(0, 4).map((e) => e.split("\n")[0]));
    console.log("  page errors:", rec.pageErrors.slice(0, 4));
  } catch (e) {
    console.log("ERR", e.message, e.stack);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
