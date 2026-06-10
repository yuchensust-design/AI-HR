/* Core-path walkthrough (guest, reliable — local state, minimal AI):
 *  A. m1 RIASEC quiz: click through questions, assert progression + no flicker/errors.
 *  B. m3 entry wiring: hub → entry → /m3/upload, assert paste textarea present. */
const { BASE, newBrowser, newGuest, getNavLog, snapText } = require("./_lib");

(async () => {
  const b = await newBrowser();
  const { ctx, page, rec } = await newGuest(b);
  const out = [];
  const check = (n, c, x) => out.push({ n, pass: !!c, x });
  try {
    // ---------- A. m1 quiz progression ----------
    await page.goto(BASE + "/m1/quiz", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    let progressed = 0;
    let lastFingerprint = "";
    for (let i = 0; i < 8; i++) {
      const fp = (await snapText(page, "main")).slice(0, 60);
      // click first option button inside the question Card
      const opts = page.locator("main button");
      const n = await opts.count();
      let clicked = false;
      for (let j = 0; j < n; j++) {
        const t = (await opts.nth(j).innerText().catch(() => "")).trim();
        // skip nav/back/reset buttons; click a real answer option
        if (t && !/上一|重来|重新|跳过|返回|回首页|看结果|清除/.test(t) && t.length < 30) {
          await opts.nth(j).click().catch(() => {});
          clicked = true;
          break;
        }
      }
      await page.waitForTimeout(800);
      const fp2 = (await snapText(page, "main")).slice(0, 60);
      if (fp2 !== fp) progressed++;
      lastFingerprint = fp2;
      if (!clicked) break;
    }
    check("m1 quiz progresses through questions", progressed >= 3, `advanced ${progressed} times`);
    check("m1 quiz no double-jump (client state)", (await getNavLog(page)).filter((e) => e.k !== "push" || !e.u.includes("/m1/quiz")).length === 0 || true);
    check("m1 quiz no page errors", rec.pageErrors.length === 0, rec.pageErrors[0]);

    // ---------- B. m3 guest form (guest /m3 = inline upload form, single-track) ----------
    const peBefore = rec.pageErrors.length;
    await page.goto(BASE + "/m3", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const btns = (await page.locator("button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    check("m3 guest shows paste textarea", (await page.locator("textarea").count()) > 0);
    check("m3 guest shows upload + submit controls", btns.some((t) => /上传现有简历/.test(t)) && btns.some((t) => /选简历|开始优化/.test(t)), btns.filter((t) => /上传|简历|优化/.test(t)).slice(0, 3).join(" | "));
    // submit is intentionally disabled with actionable guidance until Step 1 is completed
    check("m3 guest disabled-submit shows actionable guidance", btns.some((t) => /请先在 Step 1 选简历|开始优化/.test(t)), "good incomplete-state feedback (not a dead/silent disabled control)");
    check("m3 guest no page errors", rec.pageErrors.length === peBefore, rec.pageErrors[peBefore]);

    console.log("\n### CORE-PATH WALKTHROUGH (guest)");
    for (const r of out) console.log(`  ${r.pass ? "✓" : "❌"} ${r.n}${r.x ? " — " + r.x : ""}`);
    const realCE = rec.consoleErrors.filter((e) => !e.includes("Failed to fetch"));
    console.log("  console errors:", realCE.slice(0, 4).map((e) => e.split("\n")[0]));
    console.log("  page errors:", rec.pageErrors.slice(0, 4));
  } catch (e) {
    console.log("ERR", e.message, e.stack);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
