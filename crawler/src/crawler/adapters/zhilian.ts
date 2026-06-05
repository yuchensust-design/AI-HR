/**
 * 智联招聘 (zhaopin.com) adapter
 *
 * 搜索 URL: https://sou.zhaopin.com/?jl={cityCode}&kw={role}
 * 重定向到 https://www.zhaopin.com/sou/jl{cityCode}/kw{encodedKw}/p{page}
 *
 * 关键 selector(2026-06 探查):
 *   .joblist-box__item         - 卡片容器
 *   a.jobinfo__name            - 标题 + 详情 href
 *   .jobinfo__salary           - 薪资
 *   .jobinfo__tag              - 标签盒
 *   .jobinfo__other-info-item  - 工作地 / 经验 / 学历
 *   a.companyinfo__name        - 公司名
 *   .companyinfo__tag          - 公司属性
 *
 * 反爬:免登录可访问搜索结果(2026-06 验证),BEM 命名很稳。
 */

import type { Browser } from "playwright";
import { getBrowser } from "../browser.js";
import { humanSleep, newStealthContext } from "../stealth.js";
import { parseSalary, filterJobs } from "../filter.js";
import cityCodes from "../city-codes.json" with { type: "json" };
import { config } from "../../config.js";
import type {
  DetailInput,
  DetailResult,
  Job,
  PlatformAdapter,
  SearchInput,
  SearchResult,
} from "./types.js";

const ZHILIAN_CITY_CODES: Record<string, string> = (cityCodes as { zhilian?: Record<string, string> }).zhilian ?? {};

function resolveCityCode(city?: string): string {
  if (!city) return ZHILIAN_CITY_CODES["全国"] ?? "489";
  return ZHILIAN_CITY_CODES[city] ?? ZHILIAN_CITY_CODES["全国"] ?? "489";
}

function buildSearchUrl(role: string, city: string | undefined, page: number): string {
  const cityCode = resolveCityCode(city);
  const params = new URLSearchParams({
    jl: cityCode,
    kw: role,
    p: String(page),
  });
  return `https://sou.zhaopin.com/?${params}`;
}

async function detectBlocked(page: import("playwright").Page): Promise<{ blocked: boolean; reason: string }> {
  const url = page.url();
  if (url.includes("/verify") || url.includes("captcha")) {
    return { blocked: true, reason: `captcha url: ${url}` };
  }
  if (url.includes("/login") || url.includes("passport.zhaopin.com")) {
    return { blocked: true, reason: `login redirect: ${url}` };
  }
  const title = await page.title().catch(() => "");
  if (/验证|登录|注册|风控/.test(title)) {
    return { blocked: true, reason: `blocked title: ${title}` };
  }
  return { blocked: false, reason: "" };
}

async function searchInternal(input: SearchInput, browser: Browser): Promise<SearchResult> {
  const page = input.page ?? 1;
  const url = buildSearchUrl(input.role, input.city, page);
  const context = await newStealthContext(browser);
  const tab = await context.newPage();

  try {
    await tab.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    // 智联可能返回空列表(柔性反爬)→ 等 + 滚动 + 重试
    await tab
      .waitForSelector(".joblist-box__item", { timeout: 12_000 })
      .catch(() => null);

    // 滚动一下,触发 lazy load
    await tab.evaluate(() => window.scrollBy(0, 800)).catch(() => null);
    await tab.waitForTimeout(2000);

    const blockCheck = await detectBlocked(tab);
    if (blockCheck.blocked) {
      throw new Error(`zhilian blocked: ${blockCheck.reason}`);
    }

    const rawJobs = await tab.evaluate(() => {
      const cards = document.querySelectorAll(".joblist-box__item");
      const out: Array<Record<string, string | string[]>> = [];

      cards.forEach((card) => {
        const titleLink = card.querySelector("a.jobinfo__name") as HTMLAnchorElement | null;
        if (!titleLink) return;

        const title = (titleLink.textContent || "").trim();
        const href = titleLink.getAttribute("href") || "";

        const salary = (card.querySelector(".jobinfo__salary")?.textContent || "").trim();

        // 工作地 / 经验 / 学历 — .jobinfo__other-info-item
        const otherItems: string[] = [];
        card.querySelectorAll(".jobinfo__other-info-item").forEach((el) => {
          const t = (el.textContent || "").trim();
          if (t) otherItems.push(t);
        });
        // 第一个通常是城市·区域,第二个经验,第三个学历
        const cityArea = otherItems[0] || "";
        const experience = otherItems.find((s) => /年|应届/.test(s)) || "";
        const education = otherItems.find((s) =>
          /本科|硕士|博士|大专|学历|不限/.test(s)
        ) || "";

        // 公司名
        const company = (card.querySelector("a.companyinfo__name")?.textContent || "").trim();

        // 标签 — 包括 jobinfo__tag 里的技能 + companyinfo__tag 里的公司属性
        const tags: string[] = [];
        card.querySelectorAll(".joblist-box__item-tag").forEach((el) => {
          const t = (el.textContent || "").trim();
          if (t && !tags.includes(t)) tags.push(t);
        });

        if (!title || !company) return;

        out.push({
          title,
          company,
          salary,
          cityArea,
          experience,
          education,
          tags,
          href,
        });
      });

      return out;
    });

    const jobs: Job[] = rawJobs
      .map((raw): Job | null => {
        const title = String(raw.title || "");
        const company = String(raw.company || "");
        if (!title || !company) return null;

        const salary = String(raw.salary || "");
        const { min, max } = parseSalary(salary);
        const cityArea = String(raw.cityArea || "");
        const [cityPart, ...rest] = cityArea.split(/[·•\-\s]/).filter(Boolean);
        const districtPart = rest.join(" ");

        const href = String(raw.href || "");
        // URL: /jobdetail/CC404862610J40841293214.htm
        const jobIdMatch = href.match(/\/jobdetail\/([A-Z0-9]+)\.htm/);
        const platformJobId = jobIdMatch?.[1] ?? href;
        const jdUrl = href.startsWith("http") ? href : `https://www.zhaopin.com${href}`;

        const tags = (raw.tags as string[]) || [];

        return {
          id: `zhilian_${platformJobId}`,
          platform: "zhilian" as const,
          title,
          company,
          city: cityPart || input.city || "",
          district: districtPart || undefined,
          salary,
          salaryMin: min,
          salaryMax: max,
          experience: String(raw.experience || "") || undefined,
          education: String(raw.education || "") || undefined,
          tags,
          jdUrl,
          scrapedAt: new Date().toISOString(),
        };
      })
      .filter((j): j is Job => j !== null);

    const filtered = filterJobs(jobs);
    const limit = input.limit ?? 20;
    return {
      jobs: filtered.slice(0, limit),
      hasNext: filtered.length >= limit,
    };
  } finally {
    await context.close().catch(() => null);
  }
}

async function detailInternal(input: DetailInput, browser: Browser): Promise<DetailResult> {
  const platformId = input.jobId.replace(/^zhilian_/, "");
  const url = platformId.startsWith("http")
    ? platformId
    : `https://www.zhaopin.com/jobdetail/${platformId}.htm`;
  const context = await newStealthContext(browser);
  const tab = await context.newPage();

  try {
    await tab.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    await tab
      .waitForSelector(
        ".describtion__detail-content, .job-detail, [class*='describtion']",
        { timeout: 15_000 }
      )
      .catch(() => null);

    const blockCheck = await detectBlocked(tab);
    if (blockCheck.blocked) {
      throw new Error(`zhilian blocked: ${blockCheck.reason}`);
    }

    await humanSleep();

    const data = await tab.evaluate(() => {
      const text = (sel: string) =>
        (document.querySelector(sel)?.textContent ?? "").trim();
      return {
        title: text("h3.summary-plane__title") || text(".job-name") || text("h1"),
        company: text("a.company-name") || text(".company__name"),
        salary: text(".summary-plane__salary") || text(".job-salary"),
        jdText:
          text(".describtion__detail-content") ||
          text(".job-detail") ||
          text("[class*='describtion']"),
      };
    });

    const { min, max } = parseSalary(data.salary);

    const job: Job = {
      id: input.jobId,
      platform: "zhilian" as const,
      title: data.title,
      company: data.company,
      city: "",
      salary: data.salary,
      salaryMin: min,
      salaryMax: max,
      tags: [],
      jdText: data.jdText,
      jdUrl: url,
      scrapedAt: new Date().toISOString(),
    };

    return { jdText: data.jdText, job };
  } finally {
    await context.close().catch(() => null);
  }
}

export const zhilianAdapter: PlatformAdapter = {
  platform: "zhilian" as const,
  async search(input) {
    const browser = await getBrowser();
    // 第一次 attempt
    const first = await searchInternal(input, browser);
    if (first.jobs.length > 0) return first;
    // 智联在多平台并行时易返回 0 卡片(柔性反爬)→ 等待 4s 后重试一次
    await new Promise((r) => setTimeout(r, 4000));
    const retry = await searchInternal(input, browser);
    return retry;
  },
  async detail(input) {
    const browser = await getBrowser();
    return detailInternal(input, browser);
  },
};
