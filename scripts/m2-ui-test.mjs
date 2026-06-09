import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { chromium } = require("/Users/hyc/.npm/_npx/86170c4cd1c5da32/node_modules/playwright-core");
const EXE = "/Users/hyc/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell";
const shot = (p, n) => p.screenshot({ path: `pw/${n}.png`, fullPage: true });
const log = (...a) => console.log(...a);

const browser = await chromium.launch({ headless: true, executablePath: EXE });
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 } });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });

async function waitChat(fn) {
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/m2/chat"), { timeout: 30000 }),
    fn(),
  ]);
  await page.waitForTimeout(900); // 给 render + 多消息节奏一点时间
  return resp.status();
}

try {
  await page.goto("http://localhost:3009/m2", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await shot(page, "01-entry");
  log("entry 开始挖 count:", await page.getByText("开始挖").count(), "| 直接开聊:", await page.getByText("直接开聊").count());

  // 选 2 类
  await page.locator("button", { hasText: "助教 / 教学" }).first().click();
  await page.locator("button", { hasText: "校园活动" }).first().click();
  await shot(page, "02-cats-picked");

  // 开始挖
  const st1 = await waitChat(() => page.getByRole("button", { name: /开始挖/ }).click());
  log("turn1 /api status:", st1);
  await shot(page, "03-first-card");
  // 认领卡是否出现(multi_select 选项)
  const hasClaim = await page.getByRole("button", { name: /认领这些/ }).count();
  log("认领这些 button count:", hasClaim);

  // 点 2 个认领项(教学类动作)
  for (const t of ["答疑解惑", "出题 / 备课 / 做讲义"]) {
    const b = page.locator("button", { hasText: t }).first();
    if (await b.count()) await b.click();
  }
  await shot(page, "04-options-picked");

  // 认领这些
  if (hasClaim) {
    const st2 = await waitChat(() => page.getByRole("button", { name: /认领这些/ }).click());
    log("turn2 /api status:", st2);
  }
  await shot(page, "05-after-claim");

  // 素材台是否长出 bullet
  log("素材台 '复制' 按钮数(≈bullet 数):", await page.getByRole("button", { name: "复制" }).count());
  log("分组标题 助教/教学:", await page.getByText("助教 / 教学").count(), "| 内联输入框数:", await page.locator("input[placeholder]").count());

  // 在对话框回答量化
  const ta = page.locator("textarea").first();
  await ta.fill("大概 30 个学生,物理课");
  const st3 = await waitChat(() => page.getByRole("button", { name: "发送" }).click());
  log("turn3 /api status:", st3);
  await shot(page, "06-after-quant");

  log("最终 console errors:", errs.length, errs.slice(0, 3));
} catch (e) {
  log("TEST ERROR:", e.message.split("\n")[0]);
  await shot(page, "99-error");
} finally {
  await browser.close();
}
