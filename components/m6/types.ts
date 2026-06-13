/**
 * M6 共享类型 — 与 job-crawler-service 的 Job schema 对齐
 */

export type Platform = "51job" | "liepin" | "zhilian";

export interface Job {
  id: string;
  platform: Platform;
  title: string;
  company: string;
  city: string;
  district?: string;
  salary: string;
  salaryMin?: number;
  salaryMax?: number;
  experience?: string;
  education?: string;
  tags: string[];
  jdText?: string;
  jdUrl: string;
  publishedAt?: string;
  scrapedAt: string;

  // Next.js 端 LLM 填充
  matchScore?: number;
  matchHighlights?: string[];
  matchGaps?: string[];
  matchBreakdown?: {
    skills: number;
    experience: number;
    education: number;
    industry: number;
    target_alignment: number;
    employability: number;
    city: number;
  };
}

export interface SearchResponse {
  jobs: Job[];
  blockedPlatforms?: Platform[];
  total: number;
  hasNext: boolean;
  cached: boolean;
  /** 爬虫不可达时走本地 mock 兜底 → true。前端据此显示「演示数据」banner */
  isMock?: boolean;
  mockReason?: string;
}

export interface MatchResumeResponse {
  keywords: string[];
  city: string;
  reasoning: string;
  jobs: Job[];
  stats: {
    scraped: number;
    scored: number;
    recommended: number;
    blockedPlatforms: Platform[];
  };
  warning?: string;
}

export type AgentStep = "splitter" | "scraper" | "scorer" | "formatter";

export interface AgentStepState {
  step: AgentStep;
  status: "pending" | "running" | "done" | "error";
  label: string;
  detail?: string;
}
