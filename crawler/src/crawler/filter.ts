import rules from "./rules.json" with { type: "json" };
import type { Job } from "./adapters/types.js";

const BLACKLIST_KEYWORDS: string[] = rules.blacklist_keywords;
const BLACKLIST_COMPANIES: string[] = rules.blacklist_companies;

export function isBlacklistedJob(job: Job): boolean {
  const haystack = [job.title, job.company, ...job.tags, job.jdText ?? ""].join(" ").toLowerCase();
  for (const kw of BLACKLIST_KEYWORDS) {
    if (haystack.includes(kw.toLowerCase())) return true;
  }
  for (const c of BLACKLIST_COMPANIES) {
    if (job.company.includes(c)) return true;
  }
  return false;
}

export function filterJobs(jobs: Job[]): Job[] {
  return jobs.filter((j) => !isBlacklistedJob(j));
}

/** 解析薪资字符串 "15-25K·14薪" → { min: 15, max: 25 } (单位 K/月) */
export function parseSalary(s: string): { min?: number; max?: number } {
  if (!s) return {};
  const match = s.match(/(\d+(?:\.\d+)?)\s*[-~到]\s*(\d+(?:\.\d+)?)\s*[Kk万千]/);
  if (match) {
    let min = Number(match[1]);
    let max = Number(match[2]);
    if (s.includes("万")) {
      min *= 10;
      max *= 10;
    }
    return { min, max };
  }
  const single = s.match(/(\d+(?:\.\d+)?)\s*[Kk]/);
  if (single) {
    const n = Number(single[1]);
    return { min: n, max: n };
  }
  return {};
}
