/**
 * 猎聘 (liepin.com) adapter
 *
 * 搜索 URL: https://www.liepin.com/zhaopin/?key={role}&dqs={cityCode}
 *
 * 关键 selector(2026-06 探查):
 *   .job-card-pc-container          - 卡片容器
 *   a[data-nick="job-detail-job-info"]   - 标题 / 城市 / 薪资 / 经验学历(href 含 jobId)
 *   [data-nick="job-detail-company-info"] - 公司块
 *
 * 字段提取主要用 text + regex(hash class 不稳)
 *
 * 反爬:免登录可访问搜索结果(2026-06 验证),比 BOSS 友好。
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

const LIEPIN_CITY_CODES: Record<string, string> = (cityCodes as { liepin?: Record<string, string> }).liepin ?? {};

function resolveCityCode(city?: string): string {
  if (!city) return LIEPIN_CITY_CODES["全国"] ?? "000";
  return LIEPIN_CITY_CODES[city] ?? LIEPIN_CITY_CODES["全国"] ?? "000";
}

function buildSearchUrl(role: string, city: string | undefined, page: number): string {
  const cityCode = resolveCityCode(city);
  const params = new URLSearchParams({
    key: role,
    dqs: cityCode,
    currentPage: String(Math.max(0, page - 1)),
  });
  return `https://www.liepin.com/zhaopin/?${params}`;
}

async function detectBlocked(page: import("playwright").Page): Promise<{ blocked: boolean; reason: string }> {
  const url = page.url();
  if (url.includes("/verify") || url.includes("captcha")) {
    return { blocked: true, reason: `captcha url: ${url}` };
  }
  if (url.includes("/login") || url.includes("passport.liepin.com")) {
    return { blocked: true, reason: `login redirect: ${url}` };
  }
  // 检查标题(被风控页通常是 "验证" / "登录")
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

    await tab
      .waitForSelector(".job-card-pc-container", { timeout: 15_000 })
      .catch(() => null);

    const blockCheck = await detectBlocked(tab);
    if (blockCheck.blocked) {
      throw new Error(`liepin blocked: ${blockCheck.reason}`);
    }

    await humanSleep();

    const rawJobs = await tab.evaluate(() => {
      const cards = document.querySelectorAll(".job-card-pc-container");
      const out: Array<Record<string, string>> = [];

      cards.forEach((card) => {
        const link = card.querySelector(
          'a[data-nick="job-detail-job-info"]'
        ) as HTMLAnchorElement | null;
        if (!link) return;

        const href = link.getAttribute("href") || "";

        // 标题在 a 内 [title] 属性的 div(去掉前缀"招聘")
        const titleEl = link.querySelector("[title]") as HTMLElement | null;
        const titleAttr = titleEl?.getAttribute("title") || "";
        const titleText = titleEl?.textContent?.trim() || "";
        const title = (titleAttr || titleText).replace(/^招聘/, "").trim();

        // 链接的全部文本(含城市、薪资、经验、学历)
        const linkText = (link.textContent || "").trim();

        // 城市【...】
        const cityMatch = linkText.match(/【([^】]+)】/);
        const cityArea = cityMatch?.[1]?.trim() || "";

        // 薪资:xx-xxk[·N薪] 或 xx-xx万[·N薪](严格停在"薪",防止吃后面的"3年以上")
        const salaryMatch = linkText.match(
          /(\d+(?:\.\d+)?\s*[-~]\s*\d+(?:\.\d+)?\s*[Kk万](?:[·•]\d+薪)?)/
        );
        const salary = salaryMatch?.[1]?.trim() || "";

        // 经验
        const expMatch = linkText.match(
          /(\d+年(?:以上|以下)?|应届生|实习生|经验不限|不限经验)/
        );
        const experience = expMatch?.[1] || "";

        // 学历
        const eduMatch = linkText.match(
          /(统招本科|本科|硕士|博士|大专|高中|中专|不限学历|学历不限)/
        );
        const education = eduMatch?.[1] || "";

        // 公司块
        const companyBox = card.querySelector(
          '[data-nick="job-detail-company-info"]'
        ) as HTMLElement | null;
        let company = "";
        const companyTags: string[] = [];
        if (companyBox) {
          // 公司名:第一个 ellipsis-1 child(直接 inline,不含子 span)
          const allEllipsis = companyBox.querySelectorAll(".ellipsis-1");
          for (const el of Array.from(allEllipsis)) {
            const t = (el as HTMLElement).textContent?.trim() || "";
            // 公司名通常较短且不含数字人数关键词
            if (t && t.length < 30 && !/[\d]+[-~][\d]+\s*人/.test(t)) {
              company = t;
              break;
            }
          }
          // 公司标签(行业 / 阶段 / 规模)
          companyBox
            .querySelectorAll("span")
            .forEach((s) => {
              const t = (s as HTMLElement).textContent?.trim() || "";
              if (t && t.length < 30 && t !== company && !companyTags.includes(t)) {
                companyTags.push(t);
              }
            });
        }

        if (!title || !company) return;

        out.push({
          title,
          company,
          salary,
          cityArea,
          experience,
          education,
          tagsJoined: companyTags.slice(0, 6).join("|"),
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
        const [cityPart, districtPart] = cityArea.split(/[·•\-\s]/).filter(Boolean);

        const href = String(raw.href || "");
        const jobIdMatch = href.match(/\/job\/(\d+)\.shtml/);
        const platformJobId = jobIdMatch?.[1] ?? href;
        const jdUrl = href.startsWith("http") ? href : `https://www.liepin.com${href}`;

        const tags = String(raw.tagsJoined || "")
          .split("|")
          .filter(Boolean);

        return {
          id: `liepin_${platformJobId}`,
          platform: "liepin" as const,
          title,
          company,
          city: cityPart || input.city || "",
          district: districtPart,
          salary,
          salaryMin: min,
          salaryMax: max,
          experience: raw.experience || undefined,
          education: raw.education || undefined,
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
  const platformId = input.jobId.replace(/^liepin_/, "");
  const url = platformId.startsWith("http")
    ? platformId
    : `https://www.liepin.com/job/${platformId}.shtml`;
  const context = await newStealthContext(browser);
  const tab = await context.newPage();

  try {
    await tab.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: config.scrapeTimeoutMs,
    });

    await tab
      .waitForSelector(
        ".job-detail-content, .job-intro-content, [class*='job-intro']",
        { timeout: 15_000 }
      )
      .catch(() => null);

    const blockCheck = await detectBlocked(tab);
    if (blockCheck.blocked) {
      throw new Error(`liepin blocked: ${blockCheck.reason}`);
    }

    await humanSleep();

    const data = await tab.evaluate(() => {
      const text = (sel: string) =>
        (document.querySelector(sel)?.textContent ?? "").trim();
      return {
        title: text("h1") || text("[class*='job-title-text']"),
        company: text("[class*='company-name']") || text("a[data-nick='job-detail-company-name']"),
        salary: text("[class*='salary']") || text("[class*='job-salary']"),
        jdText:
          text(".job-detail-content") ||
          text(".job-intro-content") ||
          text("[class*='job-intro']") ||
          text("[class*='describe']"),
      };
    });

    const { min, max } = parseSalary(data.salary);
    const job: Job = {
      id: input.jobId,
      platform: "liepin" as const,
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

export const liepinAdapter: PlatformAdapter = {
  platform: "liepin" as const,
  async search(input) {
    const browser = await getBrowser();
    return searchInternal(input, browser);
  },
  async detail(input) {
    const browser = await getBrowser();
    return detailInternal(input, browser);
  },
};
