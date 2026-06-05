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

/**
 * 审计 §3.5 要求每题挂上四组结构化标签,让 AI-HR 能直接看到 prompt 设计能力:
 *   interviewerStyle = 风格(warm/tough/rigor)反推自 persona,客户端展示
 *   sceneType        = 场景(semi/bq/tech)反推自 type
 *   followUpReason   = 追问/首问的设计动机
 *   whatItTests      = 本题考察候选人的什么能力
 * 全部可选,旧 session 数据 normalize 后照常渲染。
 */
export type InterviewerStyle = "warm" | "tough" | "rigor";
export type SceneType = "semi_structured" | "behavioral" | "technical";

export type InterviewQuestion = {
  id: string;
  text: string;
  intent: string;
  ideal_hints: string[];
  category: QuestionCategory;
  interviewerStyle?: InterviewerStyle;
  sceneType?: SceneType;
  followUpReason?: string;
  whatItTests?: string;
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
  /**
   * 低分示范回答(plan offer-1-sparkling-hippo P1):
   * 维度 score ≤ 2 时,LLM 必须给一段 "如果重新答可以这样组织" 的示范回答,
   * 让用户拿到改进路径而不是只挨打。score ≥ 3 时此字段为 null。
   */
  improvement_example?: string | null;
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

/**
 * 维度证据 + 缺失信号 + 下一步,审计 §3.5 LLM JSON schema 要求字段。
 * 全部可选,旧 debrief 数据回填后 UI 安全 fallback。
 */
export type DimEvidence = {
  logic: string;
  specific: string;
  clarity: string;
  filler: string;
};

export type DebriefResult = {
  /** 全跳过/无 transcript 时 evaluable=false,scores 渲染为 N/A 卡 */
  evaluable: boolean;
  /** evaluable=false 时 scores 仍可能为空数组;旧数据 evaluable 缺失时按 true */
  scores: DebriefScore[];
  /** 实际参与维度统计的题数 / 总题数 — 用来在 UI 上展示「基于 X / Y 题计算」 */
  answeredCount?: number;
  totalCount?: number;
  avg: number;
  highlights: DebriefHighlight[];
  /** 审计字段别名 — 与 highlights 同步写入,UI 优先读 resumeBackfillCandidates */
  resumeBackfillCandidates?: DebriefHighlight[];
  /** 4 维各一句证据,UI 已有 scoreEvidence 显示,这里给结构化 access */
  evidence?: DimEvidence;
  /** transcript 没说但 JD 在意的能力信号 */
  missedSignals?: string[];
  /** 一句话下一步建议 + 单场免责语气 */
  nextPractice?: string;
  /** 一句话总览,N/A 场景下含「本次未完成任何回答」文案 */
  summary?: string;
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
