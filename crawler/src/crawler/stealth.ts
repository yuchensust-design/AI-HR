/**
 * Stealth 反爬配置封装
 *
 * 策略:
 * 1. playwright-extra + puppeteer-extra-plugin-stealth — 自动清除 WebDriver / chrome / Plugin / Permissions 特征
 * 2. UA / Viewport / 语言 / 时区 在 newContext 时随机化
 * 3. 每次请求间随机 sleep 1-3s
 *
 * 不做的:
 * - 鼠标轨迹伪装(列表抓取不需要,详情页 v2 再加)
 * - 代理池(MVP 阶段单 IP 低频先撑)
 */

import { chromium as _chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import type { Browser, BrowserContext } from "playwright";

// 注册 stealth plugin(全局一次)
_chromium.use(stealth());
export const chromium = _chromium;

const UA_POOL = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
];

const VIEWPORT_POOL = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1366, height: 768 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

export interface StealthContextOptions {
  /** 复用 cookie 时传入(暂未启用,留待登录模式扩展) */
  storageState?: BrowserContext["storageState"] extends () => Promise<infer S> ? S : never;
}

export async function newStealthContext(
  browser: Browser,
  _opts: StealthContextOptions = {}
): Promise<BrowserContext> {
  const ua = pick(UA_POOL);
  const viewport = pick(VIEWPORT_POOL);

  const context = await browser.newContext({
    userAgent: ua,
    viewport,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    extraHTTPHeaders: {
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    // 模拟真实设备
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
  });

  // 注入额外反爬补丁(plugin 没覆盖的边角)
  await context.addInitScript(() => {
    // tsx/esbuild 编译产物在 page.evaluate 内会引用 __name(fn, name),
    // 浏览器环境没有,注入兜底防止 ReferenceError
    // @ts-ignore
    if (typeof (window as any).__name === "undefined") {
      // @ts-ignore
      (window as any).__name = (fn: any) => fn;
    }
    // 一些站点会查 chrome.runtime
    // @ts-ignore
    if (!window.chrome) {
      // @ts-ignore
      window.chrome = { runtime: {} };
    }
    // Permissions API
    const orig = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (params: PermissionDescriptor) =>
      params.name === "notifications"
        ? Promise.resolve({ state: "default" } as unknown as PermissionStatus)
        : orig(params);
  });

  return context;
}

/** 随机 sleep 1-3 秒,模拟人类节奏 */
export function humanSleep(): Promise<void> {
  const ms = 1000 + Math.random() * 2000;
  return new Promise((r) => setTimeout(r, ms));
}
