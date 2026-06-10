/* Cold deep-link visits: hit subpages directly with NO prerequisite state.
 * Catches white-screens, crashes, unguarded empty states (bug class #7).
 * Asserts: page not blank, no pageerror, records redirect + a content fingerprint. */
const { BASE, newBrowser, newGuest, newLoggedIn, snapText } = require("./_lib");

const LINKS = [
  "/m1/quiz", "/m1/result", "/m1/evidence", "/m1/evidence/upload", "/m1/evidence/chat",
  "/m3/upload", "/m3/jd", "/m3/excavate", "/m3/result",
  "/m3/jd?c=nonexistent-conv-id-123",          // junk ?c=
  "/m5/live", "/m5/debrief",
  "/m6/discover?mode=match-resume", "/m6/discover?role=产品经理&city=上海",
  "/m4?from=m1", "/m2?c=junk",
  "/profile",
];

async function visit(page, rec, label) {
  const rows = [];
  for (const l of LINKS) {
    const peBefore = rec.pageErrors.length;
    const ceBefore = rec.consoleErrors.length;
    await page.goto(BASE + l, { waitUntil: "domcontentloaded" }).catch((e) => rec.pageErrors.push(`goto ${l}: ${e.message}`));
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(1500);
    const txt = await snapText(page);
    const newPE = rec.pageErrors.slice(peBefore);
    const newCE = rec.consoleErrors.slice(ceBefore).filter((e) => !e.includes("Failed to fetch"));
    // strip the nav chrome to gauge real body content
    const bodyLen = txt.replace(/Offer 捕手.*?(注册|爱想的柠檬)/, "").trim().length;
    rows.push({
      link: l,
      finalUrl: page.url().replace(BASE, ""),
      blank: bodyLen < 30,
      bodyLen,
      pageErr: newPE,
      consoleErr: newCE.map((e) => e.split("\n")[0]),
    });
  }
  console.log(`\n### DEEP-LINKS ${label}`);
  for (const r of rows) {
    const flag = (r.blank ? " ❌BLANK" : "") + (r.pageErr.length ? ` 💥PAGEERR(${r.pageErr.length})` : "") +
      (r.consoleErr.length ? ` 🔴CONSOLE(${r.consoleErr.length})` : "");
    console.log(`  ${r.link}  →  ${r.finalUrl}  [body:${r.bodyLen}]${flag || " ✓"}`);
    if (r.pageErr.length) console.log("     pageerr:", r.pageErr);
    if (r.consoleErr.length) console.log("     console:", r.consoleErr);
  }
}

(async () => {
  const b = await newBrowser();
  try {
    const g = await newGuest(b);
    await visit(g.page, g.rec, "GUEST");
    await g.ctx.close();
    const a = await newLoggedIn(b);
    console.log("\n(logged-in:", a.loggedIn, ")");
    await visit(a.page, a.rec, "LOGGED-IN");
    await a.ctx.close();
  } catch (e) {
    console.log("FATAL", e.message);
  } finally {
    await b.close();
  }
})();
