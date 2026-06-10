/* Generic SAFE in-page button sweep. Clicks non-destructive, non-AI buttons (tabs, toggles,
 * expanders, sample banners) and records: unexpected navigation, console/pageerror, flicker.
 * Guest mode = deterministic, no network dependence. */
const { BASE, newBrowser, newGuest, getNavLog } = require("./_lib");

const ROUTES = ["/tracker", "/diary", "/m4", "/m2", "/m1"];
// deny destructive / AI-triggering / form-submitting / auth / navigating-away labels
const DENY = /(删除|删|清空|重置|提交|保存|发送|送出|导出|下载|生成|分析|诊断|开始测评|开始评|登录|注册|退出|确认删|聊聊|问不二|找不二|AI 帮|让 AI|×|关闭账号|重新生成|清除)/;
const MAXCLICKS = 18;

async function sweepRoute(page, rec, route) {
  await page.goto(BASE + route, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const findings = [];
  // collect candidate buttons (visible, enabled)
  const buttons = await page.locator("button").all();
  let clicks = 0;
  for (let i = 0; i < buttons.length && clicks < MAXCLICKS; i++) {
    const btn = buttons[i];
    let label = "";
    try {
      if (!(await btn.isVisible()) || !(await btn.isEnabled())) continue;
      label = (await btn.innerText({ timeout: 800 })).replace(/\s+/g, " ").trim();
    } catch {
      continue;
    }
    if (!label || label.length > 24) continue;
    if (DENY.test(label)) continue;
    clicks++;
    const urlBefore = page.url();
    const softBefore = (await getNavLog(page)).length;
    const ceBefore = rec.consoleErrors.length;
    const peBefore = rec.pageErrors.length;
    try {
      await btn.click({ timeout: 2500 });
    } catch (e) {
      continue;
    }
    await page.waitForTimeout(600);
    const navigatedAway = !page.url().includes(route) && page.url() !== urlBefore;
    const softSeq = (await getNavLog(page)).slice(softBefore).map((x) => `${x.k}:${x.u}`);
    const newCE = rec.consoleErrors.slice(ceBefore).filter((e) => !e.includes("Failed to fetch"));
    const newPE = rec.pageErrors.slice(peBefore);
    if (navigatedAway || softSeq.length > 1 || newCE.length || newPE.length) {
      findings.push({
        label,
        navigatedAway: navigatedAway ? page.url().replace(BASE, "") : false,
        doubleJump: softSeq.length > 1 ? softSeq : false,
        consoleErr: newCE.map((e) => e.split("\n")[0]),
        pageErr: newPE,
      });
    }
    // if navigated away, go back to keep sweeping this route
    if (!page.url().includes(route)) {
      await page.goto(BASE + route, { waitUntil: "networkidle" }).catch(() => {});
      await page.waitForTimeout(800);
      // re-fetch button list invalidated; break to keep it simple
      break;
    }
  }
  return { route, clicks, findings };
}

(async () => {
  const b = await newBrowser();
  const { ctx, page, rec } = await newGuest(b);
  try {
    console.log("### GENERIC IN-PAGE SAFE BUTTON SWEEP (guest)");
    for (const r of ROUTES) {
      const res = await sweepRoute(page, rec, r);
      if (res.findings.length === 0) {
        console.log(`  ${r}: clicked ${res.clicks} buttons — ✓ no nav/console/page errors`);
      } else {
        console.log(`  ${r}: clicked ${res.clicks} buttons — ${res.findings.length} FINDINGS:`);
        for (const f of res.findings) console.log("     ⚠️", JSON.stringify(f));
      }
    }
  } catch (e) {
    console.log("FATAL", e.message, e.stack);
  } finally {
    await ctx.close();
    await b.close();
  }
})();
