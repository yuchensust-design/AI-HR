/* In-page interaction sweep: m6 tabs + JD modal + 不二 floating widget. Guest (deterministic). */
const { BASE, newBrowser, newGuest, getNavLog, snapText } = require("./_lib");

const job = {
  id: "ip1", title: "前端工程师(模态测试)", company: "测试公司", city: "上海",
  platform: "51job", jdUrl: "https://example.com/ip", salary: "15-25k",
  jdText: "岗位职责:负责Web前端开发。任职要求:熟悉React/TypeScript,有组件库经验。这是用于测试看JD弹窗的完整JD正文内容。",
};

(async () => {
  const b = await newBrowser();
  const { ctx, page, rec } = await newGuest(b);
  const results = [];
  const check = (name, cond, extra) => results.push({ name, pass: !!cond, ...(extra ? { extra } : {}) });
  try {
    await page.goto(BASE + "/m6/discover", { waitUntil: "networkidle" });
    await page.evaluate((j) => {
      localStorage.setItem("discover_search_jobs", JSON.stringify([j]));
      localStorage.setItem("discover_tab", JSON.stringify("search"));
    }, job);
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    // --- tab switching ---
    const navBefore = (await getNavLog(page)).length;
    await page.locator('button:has-text("用我的简历推荐")').click();
    await page.waitForTimeout(700);
    const recTab = await snapText(page);
    check("tab→推荐: shows inline resume uploader", recTab.includes("上传你的简历") || recTab.includes("读取你的简历") || recTab.includes("已检测到"));
    await page.locator('button:has-text("关键词搜索")').click();
    await page.waitForTimeout(500);
    check("tab→搜索: card back", (await snapText(page)).includes("模态测试"));
    check("tab switch caused no navigation", (await getNavLog(page)).length === navBefore);

    // --- JD modal open/close ---
    await page.locator('button:has-text("看 JD")').first().click();
    await page.waitForTimeout(700);
    let modalTxt = await snapText(page);
    check("JD modal opens with JD body", modalTxt.includes("负责Web前端开发") || modalTxt.includes("测试看JD弹窗"));
    // close via ×
    await page.locator('button:has-text("×")').first().click().catch(() => {});
    await page.waitForTimeout(500);
    check("JD modal closes via ×", !(await page.locator('text=负责Web前端开发').count()));
    // re-open + close via backdrop
    await page.locator('button:has-text("看 JD")').first().click();
    await page.waitForTimeout(600);
    await page.mouse.click(8, 8); // top-left = backdrop
    await page.waitForTimeout(500);
    check("JD modal closes via backdrop", !(await page.locator('text=负责Web前端开发').count()));

    // --- 不二 floating widget ---
    const navBefore2 = (await getNavLog(page)).length;
    await page.locator('button[aria-label="找不二聊聊"]').click();
    await page.waitForTimeout(900);
    const panelTxt = await snapText(page);
    check("不二 panel opens", panelTxt.includes("不二") && (panelTxt.includes("情绪") || panelTxt.includes("聊聊") || panelTxt.includes("小窝")));
    const hasInput = await page.locator('textarea, input[type="text"]').count();
    check("不二 panel has input", hasInput > 0);
    await page.locator('button[aria-label="找不二聊聊"]').click(); // toggle close
    await page.waitForTimeout(500);
    check("不二 widget no navigation", (await getNavLog(page)).length === navBefore2);

    console.log("\n### IN-PAGE m6 + 不二 (guest)");
    for (const r of results) console.log(`  ${r.pass ? "✓" : "❌"} ${r.name}${r.extra ? " — " + r.extra : ""}`);
    console.log("  console errors:", rec.consoleErrors.filter((e) => !e.includes("Failed to fetch")).slice(0, 5));
    console.log("  page errors:", rec.pageErrors.slice(0, 5));
  } catch (e) {
    console.log("ERR", e.message, e.stack);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
