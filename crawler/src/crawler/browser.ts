/**
 * Playwright Browser Pool
 *
 * 全局复用单个 chromium 实例;每次抓取借一个 context,用完即关。
 * 进程退出时优雅关闭 browser。
 */

import type { Browser } from "playwright";
import { chromium } from "./stealth.js";
import { config } from "../config.js";

let _browser: Browser | null = null;
let _booting: Promise<Browser> | null = null;

export async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  if (_booting) return _booting;

  _booting = chromium.launch({
    headless: config.headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  try {
    _browser = await _booting;
    _browser.on("disconnected", () => {
      _browser = null;
      _booting = null;
    });
    return _browser;
  } finally {
    _booting = null;
  }
}

export async function closeBrowser(): Promise<void> {
  if (_browser) {
    try {
      await _browser.close();
    } catch {
      /* ignore */
    }
    _browser = null;
  }
}

// 优雅退出
process.on("SIGINT", async () => {
  await closeBrowser();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
