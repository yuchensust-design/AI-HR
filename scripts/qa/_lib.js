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
  page.on("framenavigated", (f) => {
    try {
      if (f === page.mainFrame()) rec.navs.push(f.url());
    } catch {
      /* ignore */
    }
  });
  return rec;
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
  const mark = navMark(rec);
  await clickFn(page);
  // immediate snapshot (race the hydration)
  const immediateText = await snapText(page, settleSelector);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(settleMs);
  const settledText = await snapText(page, settleSelector);
  const navSeq = navsSince(rec, mark);
  return {
    navSeq,
    finalUrl: page.url(),
    immediateText,
    settledText,
    doubleJump: navSeq.length > 1,
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
  navMark,
  navsSince,
  snapText,
  clickAndTrace,
  summarizeRec,
  log,
};
