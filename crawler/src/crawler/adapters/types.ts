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
}

export interface SearchInput {
  role: string;
  city?: string;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  jobs: Job[];
  hasNext: boolean;
}

export interface DetailInput {
  jobId: string;
}

export interface DetailResult {
  jdText: string;
  job: Job;
}

export interface PlatformAdapter {
  platform: Platform;
  search(input: SearchInput): Promise<SearchResult>;
  detail(input: DetailInput): Promise<DetailResult>;
}
