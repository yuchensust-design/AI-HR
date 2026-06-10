/* Smoke: visit every top-level route as guest + logged-in, record console/pageerrors,
 * final URL (catches unexpected redirects), and a settled-text fingerprint. */
const { BASE, newBrowser, newGuest, newLoggedIn, snapText, log } = require("./_lib");

const ROUTES = [
  "/",
  "/m1",
  "/m6/discover",
  "/m3",
  "/m5",
  "/tracker",
  "/m2",
  "/m4",
  "/diary",
  "/profile",
];

async function visitAll(page, rec, label) {
  const out = [];
  for (const r of ROUTES) {
    const before = { ce: rec.consoleErrors.length, pe: rec.pageErrors.length };
    await page.goto(BASE + r, { waitUntil: "domcontentloaded" }).catch((e) => {
      rec.pageErrors.push(`GOTO ${r}: ${e.message}`);
    });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    const txt = await snapText(page);
    out.push({
      route: r,
      finalUrl: page.url().replace(BASE, ""),
      redirected: !page.url().replace(BASE, "").startsWith(r),
      newConsoleErrors: rec.consoleErrors.slice(before.ce),
      newPageErrors: rec.pageErrors.slice(before.pe),
      textHead: txt.slice(0, 90),
    });
  }
  log(`SMOKE ${label}`, out);
}

(async () => {
  const browser = await newBrowser();
  try {
    const guest = await newGuest(browser);
    await visitAll(guest.page, guest.rec, "GUEST");
    await guest.ctx.close();

    const auth = await newLoggedIn(browser);
    log("LOGIN RESULT", { loggedIn: auth.loggedIn, url: auth.page.url().replace(BASE, "") });
    await visitAll(auth.page, auth.rec, "LOGGED-IN");
    await auth.ctx.close();
  } catch (e) {
    console.log("FATAL", e.message, e.stack);
  } finally {
    await browser.close();
  }
})();
