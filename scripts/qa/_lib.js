/* QA sweep harness — programmatic Playwright, independent headless contexts.
 * NEVER touches the main session browser. Each run = fresh chromium.
 *
 * Capabilities mapped to the bug classes we hunt:
 *  - nav sequence / double-jump: page.on('framenavigated') accumulates main-frame URLs
 *  - flicker: snapshot key text immediately after a click, then again after settle
 *  - context loss: assert landing URL ?c= present + key copy present
 *  - console/pageerror: every error recorded into the recorder
 */
const { chromium } = require("playwright");

const BASE = process.env.BASE || "http://localhost:3200";
const ACCOUNT = {
  email: process.env.QA_EMAIL || "flytest0610@gmail.com",
  password: process.env.QA_PASS || "Test123456!",
};

function attachRecorder(page, name) {
  const rec = { name, consoleErrors: [], pageErrors: [], navs: [], requests: [] };
  page.on("console", (m) => {
    if (m.type() === "error") rec.consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => rec.pageErrors.push(e.message || String(e)));
  // Hard navigations (full document loads)
  page.on("framenavigated", (f) => {
    try {
      if (f === page.mainFrame()) rec.navs.push(f.url());
    } catch {
      /* ignore */
    }
  });
  // SOFT navigations: Next.js client routing uses history.pushState/replaceState,
  // which does NOT fire framenavigated. Hook the history API so router.replace
  // bounces (the double-jump signature) are actually captured. Resets per document.
  page.addInitScript(() => {
    if (window.__OCNAV) return;
    window.__OCNAV = [];
    const p = history.pushState;
    const r = history.replaceState;
    history.pushState = function (s, t, u) {
      try { window.__OCNAV.push({ k: "push", u: String(u) }); } catch { /* */ }
      return p.apply(this, arguments);
    };
    history.replaceState = function (s, t, u) {
      try { window.__OCNAV.push({ k: "replace", u: String(u) }); } catch { /* */ }
      return r.apply(this, arguments);
    };
    window.addEventListener("popstate", () => {
      try { window.__OCNAV.push({ k: "pop", u: location.pathname + location.search }); } catch { /* */ }
    });
  });
  return rec;
}

/** Read the in-page history-API nav log (soft navs). Returns [] if not present. */
async function getNavLog(page) {
  try {
    return await page.evaluate(() => window.__OCNAV || []);
  } catch {
    return [];
  }
}

async function newBrowser() {
  return chromium.launch({ headless: true });
}

async function newGuest(browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const rec = attachRecorder(page, "guest");
  return { ctx, page, rec };
}

/** Try login; if it errors (account missing), register that account. Returns logged-in {ctx,page,rec}.
 * NOTE: in `next dev` hydration lags; we wait for networkidle + a beat before interacting,
 * then submit and allow a generous wait for the Supabase round-trip + router.push. */
async function submitAuth(page, path, account) {
  await page.goto(BASE + path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200); // let React hydrate so onSubmit is attached
  await page.locator('input[type="email"]').fill(account.email);
  await page.locator('input[type="password"]').fill(account.password);
  for (let i = 0; i < 3; i++) {
    await page.locator('button[type="submit"]').click().catch(() => {});
    try {
      await page.waitForURL((u) => !/\/login|\/register/.test(u.toString()), { timeout: 9000 });
      return true;
    } catch {
      const err = await page.locator("p.text-esther-red").first().innerText().catch(() => "");
      if (/密码|confirm|注册|already|Email|登录/.test(err)) return false; // real auth error
    }
  }
  return !/\/login|\/register/.test(page.url());
}

async function newLoggedIn(browser, account = ACCOUNT) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const rec = attachRecorder(page, "auth");
  let ok = await submitAuth(page, "/login", account);
  if (!ok) ok = await submitAuth(page, "/register", account);
  await page.waitForTimeout(800);
  const cookies = await ctx.cookies();
  const loggedIn = ok && cookies.some((c) => c.name.includes("auth-token"));
  return { ctx, page, rec, loggedIn };
}

/** Mark current nav length so navsSince() returns only navs after this point. */
function navMark(rec) {
  return rec.navs.length;
}
function navsSince(rec, mark) {
  return rec.navs.slice(mark);
}

/** Grab visible text quickly (best-effort, no throw). */
async function snapText(page, selector = "body") {
  try {
    return (await page.locator(selector).first().innerText({ timeout: 1500 })).replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Click something and trace what happens.
 * clickFn: async (page) => {}  — performs the click.
 * Returns { navSeq, finalUrl, immediateText, settledText, doubleJump }.
 * doubleJump = >1 main-frame navigation triggered by a single click (the bug class #1 signature).
 */
async function clickAndTrace(page, rec, clickFn, { settleSelector = "body", settleMs = 2500 } = {}) {
  const hardMark = navMark(rec);
  const softBefore = (await getNavLog(page)).length;
  const urlBefore = page.url();
  await clickFn(page);
  // immediate snapshot (race the hydration)
  const immediateText = await snapText(page, settleSelector);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(settleMs);
  const settledText = await snapText(page, settleSelector);
  // soft navs survive within a document; hard nav resets __OCNAV → fall back to framenavigated
  const softLog = await getNavLog(page);
  const softSeq = softLog.slice(softBefore).map((e) => `${e.k}:${e.u}`);
  const hardSeq = navsSince(rec, hardMark).map((u) => u.replace(BASE, ""));
  // total distinct navigation events triggered by this one click
  const navSeq = softSeq.length ? softSeq : hardSeq;
  return {
    navSeq,
    softSeq,
    hardSeq,
    urlBefore: urlBefore.replace(BASE, ""),
    finalUrl: page.url(),
    immediateText,
    settledText,
    // double-jump = >1 *logical* navigation from one click. A single soft nav fires BOTH a
    // pushState (softSeq) and a framenavigated (hardSeq) — so don't sum them. Prefer the
    // history log (captures push + any replace bounce); fall back to hard nav for full reloads.
    doubleJump: softSeq.length ? softSeq.length > 1 : hardSeq.length > 1,
  };
}

function summarizeRec(rec) {
  return {
    consoleErrors: rec.consoleErrors,
    pageErrors: rec.pageErrors,
    navCount: rec.navs.length,
  };
}

/** structured log line */
function log(tag, obj) {
  console.log(`\n### ${tag}`);
  console.log(JSON.stringify(obj, null, 1));
}

module.exports = {
  BASE,
  ACCOUNT,
  newBrowser,
  newGuest,
  newLoggedIn,
  attachRecorder,
  getNavLog,
  navMark,
  navsSince,
  snapText,
  clickAndTrace,
  summarizeRec,
  log,
};
