/**
 * 模块 5 模拟面试 — 共用类型定义
 *
 * 纯 TypeScript 类型,无运行时依赖,可被 server endpoint / client component 同时 import。
 *
 * 数据流:
 *   配置页 → InterviewSessionConfig (localStorage `interview_session_config`)
 *   prep-questions → InterviewQuestion[]
 *   live 页 → TurnAnswer[] + TurnEvaluation[]
 *   debrief → DebriefResult (写回 localStorage `interview_sessions`,最近 2 场 FIFO)
 *
 * 4 维评分按 PRD §3.6.8(注:plan §F.4 anchor 表 5 维是文档不一致,本项目以 PRD 为准)
 */

export type InterviewType = "semi" | "bq" | "tech";
export type PersonaKey = "gentle" | "strict" | "rigor";
export type InterviewMode = "camera" | "audio_only";

export type InterviewSessionConfig = {
  resume_text: string;
  jd_text: string;
  type: InterviewType;
  persona: PersonaKey;
  num_questions: 5 | 10 | 15;
  mode: InterviewMode;
  record: boolean;
  started_at: string;
};

export type QuestionCategory =
  | "warmup"
  | "behavioral"
  | "project"
  | "technical"
  | "stress"
  | "closing";

export type InterviewQuestion = {
  id: string;
  text: string;
  intent: string;
  ideal_hints: string[];
  category: QuestionCategory;
};

export type SkipKind = "dont_know" | "know_but_skip";

export type TurnAnswer = {
  question_id: string;
  transcript: string;
  audio_duration_sec?: number;
  filler_word_count?: number;
  skipped?: SkipKind;
  answered_at: string;
};

export type DimScores = {
  logic: number;
  specific: number;
  clarity: number;
  filler: number;
};

export type TurnEvaluation = {
  question_id: string;
  scores: DimScores | null;
  brief: string;
};

export type DebriefDim = "逻辑性" | "具体性" | "应答清晰度" | "口水话频次";

export type DebriefScore = {
  dim: DebriefDim;
  score: number;
  evidence: string;
};

export type DebriefHighlight = {
  question: string;
  excerpt: string;
  why: string;
  suggestedBullet: string;
};

export type TranscriptSummaryItem = {
  no: number;
  q: string;
  summary: string;
  score: number;
  hasHighlight: boolean;
};

export type DebriefResult = {
  scores: DebriefScore[];
  avg: number;
  highlights: DebriefHighlight[];
  transcript_summary: TranscriptSummaryItem[];
  finished_at: string;
};

export type InterviewSession = {
  id: string;
  config: InterviewSessionConfig;
  questions: InterviewQuestion[];
  answers: TurnAnswer[];
  turn_evaluations: TurnEvaluation[];
  debrief?: DebriefResult;
};

export type FromDebriefHighlight = {
  source_session_id: string;
  question: string;
  excerpt: string;
  why: string;
  suggestedBullet: string;
  sent_at: string;
};

export const VALID_DIMS: readonly DebriefDim[] = [
  "逻辑性",
  "具体性",
  "应答清晰度",
  "口水话频次",
] as const;

export const VALID_CATEGORIES: readonly QuestionCategory[] = [
  "warmup",
  "behavioral",
  "project",
  "technical",
  "stress",
  "closing",
] as const;

export const M5_STORAGE_KEYS = {
  SESSION_CONFIG: "interview_session_config",
  SESSIONS: "interview_sessions",
  FROM_DEBRIEF_HIGHLIGHT: "from_debrief_highlight",
} as const;

export const SESSIONS_MAX = 2;
