/* Click every Nav link via SOFT (client-side) navigation — faithful to real user clicks.
 * Detects: double-jumps, wrong landing, console/pageerror per click, guest-mode flash. */
const { BASE, newBrowser, newGuest, newLoggedIn, getNavLog, snapText } = require("./_lib");

const NAV = [
  { label: "找方向", href: "/m1" },
  { label: "看岗位", href: "/m6/discover" },
  { label: "改简历", href: "/m3" },
  { label: "练面试", href: "/m5" },
  { label: "挖经历", href: "/m2" },
  { label: "补项目", href: "/m4" },
];

async function sweep(page, rec, label) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // hydration before first soft click
  const rows = [];
  for (const n of NAV) {
    // isolate each click from a stable origin (home doesn't auto-redirect)
    await page.goto(BASE + "/", { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    const ceBefore = rec.consoleErrors.length;
    const peBefore = rec.pageErrors.length;
    const softBefore = (await getNavLog(page)).length;
    const link = page.locator(`nav a[href="${n.href}"]`).first();
    await link.waitFor({ state: "visible" }).catch(() => {});
    await link.click().catch((e) => rec.pageErrors.push(`click ${n.label}: ${e.message}`));
    // truth = page.url() (covers soft pushState + hard nav)
    await page.waitForURL((u) => u.toString().includes(n.href), { timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1200);
    const softSeq = (await getNavLog(page)).slice(softBefore).map((e) => `${e.k}:${e.u}`);
    const txt = await snapText(page);
    rows.push({
      nav: n.label,
      finalUrl: page.url().replace(BASE, ""),
      correct: page.url().includes(n.href),
      softSeq,
      // double-jump within this click: >1 history event, or a replace bounce away from target
      doubleJump: softSeq.length > 1,
      guestFlash: txt.includes("游客模式") && label === "LOGGED-IN",
      newConsoleErr: rec.consoleErrors.slice(ceBefore).map((e) => e.split("\n")[0]),
      newPageErr: rec.pageErrors.slice(peBefore),
    });
  }
  console.log(`\n### NAV-CLICK ${label}`);
  for (const r of rows) {
    const flag = (!r.correct ? " ❌WRONG-URL" : "") + (r.doubleJump ? " ⚠️DOUBLE-JUMP" : "") +
      (r.guestFlash ? " 👻GUEST-FLASH" : "") +
      (r.newConsoleErr.length ? ` 🔴CONSOLE(${r.newConsoleErr.length})` : "") +
      (r.newPageErr.length ? ` 💥PAGEERR(${r.newPageErr.length})` : "");
    console.log(`  ${r.nav} → ${r.finalUrl} [hist:${JSON.stringify(r.softSeq)}]${flag || " ✓"}`);
    if (r.newConsoleErr.length) console.log("     console:", r.newConsoleErr.slice(0, 3));
    if (r.newPageErr.length) console.log("     pageerr:", r.newPageErr);
  }
}

(async () => {
  const b = await newBrowser();
  try {
    const g = await newGuest(b);
    await sweep(g.page, g.rec, "GUEST");
    await g.ctx.close();
    const a = await newLoggedIn(b);
    await sweep(a.page, a.rec, "LOGGED-IN");
    await a.ctx.close();
  } catch (e) {
    console.log("FATAL", e.message);
  } finally {
    await b.close();
  }
})();
