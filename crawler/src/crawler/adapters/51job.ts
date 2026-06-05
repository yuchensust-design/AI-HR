/**
 * 51job 前程无忧 adapter
 *
 * 搜索 URL:
 *   https://we.51job.com/pc/search?jobArea={cityCode}&keyword={role}&pageNum={page}
 *
 * 反爬强度比 BOSS 低,免登录可用性较好,主要承担"BOSS 挂时撑场"角色。
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

const C51_CITY_CODES: Record<string, string> = cityCodes["51job"];

function resolveCityCode(city?: string): string {
  if (!city) return C51_CITY_CODES["全国"]!;
  return C51_CITY_CODES[city] ?? C51_CITY_CODES["全国"]!;
}

function buildSearchUrl(role: string, city: string | undefined, page: number): string {
  const cityCode = resolveCityCode(city);
  const params = new URLSearchParams({
    jobArea: cityCode,
    keyword: role,
    searchType: "2",
    sortType: "0",
    pageNum: String(page),
  });
  return `https://we.51job.com/pc/search?${params}`;
}

async function detectBlocked(page: import("playwright").Page): Promise<boolean> {
  const url = page.url();
  if (url.includes("/verify") || url.includes("captcha") || url.includes("checkcode")) return true;
  const text = await page.locator("body").textContent().catch(() => "");
  if (text && /验证|访问受限|频繁访问/.test(text)) return true;
  return false;
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

    await tab
      .waitForSelector(".joblist-item, .j_joblist .e, [class*='joblist-item']", {
        timeout: 15_000,
      })
      .catch(() => null);

    if (await detectBlocked(tab)) {
      throw new Error("51job blocked by anti-bot");
    }

    await humanSleep();

    const rawJobs = await tab.evaluate(() => {
      const cards = document.querySelectorAll(
        ".joblist-item, .j_joblist .e, [class*='joblist-item']"
      );
      const out: Array<Record<string, string | string[]>> = [];

      cards.forEach((card) => {
        const text = (sel: string) =>
          (card.querySelector(sel)?.textContent ?? "").trim();
        const attr = (sel: string, name: string) =>
          card.querySelector(sel)?.getAttribute(name) ?? "";

        const title =
          text(".jname") || text(".job-name") || text("[class*='jname']") || text("a.el");
        const company =
          text(".cname") || text(".company-name") || text("[class*='cname']");
        const salary =
          text(".sal") || text(".salary") || text("[class*='sal']");
        const area = text(".d.at") || text(".area") || text("[class*='area']");
        const infoItems: string[] = [];
        card.querySelectorAll(".tags span, .el-tag, [class*='tags'] span").forEach((el) => {
          const t = (el.textContent ?? "").trim();
          if (t) infoItems.push(t);
        });

        const href =
          attr("a.el", "href") ||
          attr("a.jname", "href") ||
          attr("a", "href");

        if (!title && !company) return;
        out.push({ title, company, salary, area, infoItems, href });
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
        const area = String(raw.area || "");
        const [cityPart, districtPart] = area.split(/[·•\s]/).filter(Boolean);

        const infoItems = (raw.infoItems as string[]) || [];
        const experience = infoItems.find((s) => /年|应届/.test(s));
        const education = infoItems.find((s) =>
          /本科|硕士|博士|大专|学历|不限/.test(s)
        );

        const href = String(raw.href || "");
        // 51job URL 模式: /all/{id}.html 或完整 URL
        // ID 可能是 base64-like (大小写字母+数字) 或纯数字
        const jobIdMatch = href.match(/\/([A-Za-z0-9_-]+)\.html/);
        const platformJobId = jobIdMatch?.[1] ?? href;
        const jdUrl = href.startsWith("http")
          ? href
          : `https://jobs.51job.com${href}`;

        return {
          id: `51job_${platformJobId}`,
          platform: "51job",
          title,
          company,
          city: cityPart || input.city || "",
          district: districtPart,
          salary,
          salaryMin: min,
          salaryMax: max,
          experience,
          education,
          tags: infoItems.filter((s) => !/^\d+年|应届|本科|硕士|博士|大专|不限$/.test(s)),
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
  const platformId = input.jobId.replace(/^51job_/, "");
  // 兼容历史脏数据:如果 platformId 是完整 URL 直接用
  const url = platformId.startsWith("http")
    ? platformId
    : `https://jobs.51job.com/all/${platformId}.html`;
  const context = await newStealthContext(browser);
  const tab = await context.newPage();

  try {
    await tab.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    await tab
      .waitForSelector(".bmsg, .job-msg, .tBorderTop_box", { timeout: 15_000 })
      .catch(() => null);

    if (await detectBlocked(tab)) {
      throw new Error("51job blocked by anti-bot");
    }

    await humanSleep();

    const data = await tab.evaluate(() => {
      const text = (sel: string) =>
        (document.querySelector(sel)?.textContent ?? "").trim();
      return {
        title: text("h1") || text(".tHeader h1"),
        company: text(".cname") || text("a.catn"),
        salary: text(".cn .salary") || text("strong"),
        jdText:
          text(".bmsg.job_msg.inbox") ||
          text(".job-msg") ||
          text(".bmsg"),
      };
    });

    const { min, max } = parseSalary(data.salary);

    const job: Job = {
      id: input.jobId,
      platform: "51job",
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

export const c51jobAdapter: PlatformAdapter = {
  platform: "51job",
  async search(input) {
    const browser = await getBrowser();
    return searchInternal(input, browser);
  },
  async detail(input) {
    const browser = await getBrowser();
    return detailInternal(input, browser);
  },
};
