/**
 * DATA 模块 — 投递追踪 + 求职诊断
 *
 * 数据流:
 *   sample(默认) -> 用户首次新增/编辑 -> localStorage 持久化
 *   指标计算: lib/tracker-metrics.ts(纯函数)
 *   AI 诊断: app/api/tracker/diagnose POST
 *
 * 不进 lib/use-local-state.ts STORAGE_KEYS(共享文件 lock),
 * 模块内自己用 TRACKER_STORAGE_KEYS 常量。
 */

export type ApplicationStatus =
  | "to_apply"
  | "applied"
  | "written_test"
  | "interview"
  | "offer"
  | "rejected"
  | "ghosted";

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  to_apply: "待投递",
  applied: "已投递",
  written_test: "笔试",
  interview: "面试",
  offer: "Offer",
  rejected: "拒绝",
  ghosted: "已挂",
};

export const STATUS_COLORS: Record<ApplicationStatus, string> = {
  to_apply: "bg-slate-100 text-slate-700 ring-slate-300",
  applied: "bg-sky-100 text-sky-800 ring-sky-300",
  written_test: "bg-violet-100 text-violet-800 ring-violet-300",
  interview: "bg-amber-100 text-amber-800 ring-amber-300",
  offer: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  rejected: "bg-rose-100 text-rose-800 ring-rose-300",
  ghosted: "bg-zinc-200 text-zinc-700 ring-zinc-400",
};

/** 状态在漏斗里的阶段顺序;rejected / ghosted 是终态分支 */
export const FUNNEL_ORDER: ApplicationStatus[] = [
  "to_apply",
  "applied",
  "written_test",
  "interview",
  "offer",
];

export type RoleDirection =
  | "ai_pm"
  | "data_analysis"
  | "ai_research"
  | "psych_counseling"
  | "user_research"
  | "frontend"
  | "backend"
  | "other";

export const DIRECTION_LABELS: Record<RoleDirection, string> = {
  ai_pm: "AI 产品 / 互联网 PM",
  data_analysis: "数据分析 / 增长",
  ai_research: "AI 研究 / 算法",
  psych_counseling: "心理咨询 / EAP / 用户体验心理",
  user_research: "用户研究 / UX 研究",
  frontend: "前端 / Web",
  backend: "后端 / 服务端",
  other: "其它",
};

/** 面试轮次类型 (§8.28 Wave 3 — 投递复盘补完) */
export type InterviewRoundType =
  | "written_test"
  | "first_round"
  | "second_round"
  | "third_round"
  | "hr_round"
  | "final_round";

export const ROUND_TYPE_LABELS: Record<InterviewRoundType, string> = {
  written_test: "笔试",
  first_round: "一面",
  second_round: "二面",
  third_round: "三面",
  hr_round: "HR 面",
  final_round: "终面",
};

export type RoundOutcome = "passed" | "failed" | "pending" | "skipped";

export const OUTCOME_LABELS: Record<RoundOutcome, string> = {
  passed: "通过",
  failed: "挂了",
  pending: "等通知",
  skipped: "跳过",
};

/** 挂的原因 — 用于按原因聚合做 Insights */
export type FailReason =
  | "tech_depth"
  | "project_detail"
  | "jd_mismatch"
  | "expression"
  | "personality_fit"
  | "no_response"
  | "other";

export const FAIL_REASON_LABELS: Record<FailReason, string> = {
  tech_depth: "技术深度不够",
  project_detail: "项目细节答不上",
  jd_mismatch: "JD 与经历错配",
  expression: "表达不清 / 卡顿",
  personality_fit: "性格 / 文化不 fit",
  no_response: "石沉大海",
  other: "其它",
};

export type InterviewRound = {
  /** 唯一 id,前端用 */
  id: string;
  type: InterviewRoundType;
  outcome: RoundOutcome;
  /** outcome = failed 时必填,其它可空 */
  failReason?: FailReason;
  /** 自由文本备注,失败原因细节 */
  note?: string;
  /** 这一轮发生的日期 YYYY-MM-DD */
  date?: string;
};

export type Application = {
  id: string;
  /** 公司名 */
  company: string;
  /** 投递岗位 */
  role: string;
  /** 行业/领域(可选,用于分析分组) */
  industry: string;
  direction: RoleDirection;
  /** ISO date YYYY-MM-DD */
  appliedAt: string;
  /** 当时投递使用的简历版本标签(自由文本,可空) */
  resumeVersion: string;
  status: ApplicationStatus;
  /** 状态最近一次变化的 ISO date */
  statusUpdatedAt: string;
  /** 备注;自由文本 */
  notes: string;
  /** 是否 sample;sample 数据在指标卡和诊断里都会标记来源 */
  isSample?: boolean;
  /** 面试轮次链(§8.28 Wave 3),可空(老数据兼容) */
  rounds?: InterviewRound[];
  /** 最终挂的根因(可选;如果填了 outcome=failed 的某轮 reason 会自动取最后一条) */
  finalFailReason?: FailReason;
};

/** 生成轮次 id */
export function genRoundId(): string {
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export type Metrics = {
  total: number;
  applied: number;
  responded: number;
  interviewed: number;
  offered: number;
  rejected: number;
  ghosted: number;
  /** 已投递(applied+) 中收到任意推进的占比 */
  responseRate: number;
  /** 已投递 -> 面试 转化率 */
  interviewRate: number;
  /** 已投递 -> offer 转化率 */
  offerRate: number;
  /** 已投递 -> 已挂 占比 */
  ghostedRate: number;
  /** 投递到状态最近一次变化的平均天数(已投递的样本) */
  avgWaitDays: number;
  /** 按方向汇总 */
  byDirection: DirectionMetric[];
  /** 数据中 sample 数 */
  sampleCount: number;
  /** 数据中真实(非 sample)数 */
  realCount: number;
  /**
   * 转化率可信度(plan offer-1-sparkling-hippo P1):
   *   "ok"   — 真实样本 ≥ MIN_RELIABLE_SAMPLE,转化率可放心展示
   *   "weak" — 真实样本 < MIN_RELIABLE_SAMPLE,UI 应模糊化展示比率(eg 不显示精确百分比,改"样本不足,建议累计后再看")
   *   "empty"— 还没投出去任何一份
   */
  reliability: "ok" | "weak" | "empty";
  /** 模糊化阈值:真实样本 < 10 → weak;< 1 → empty */
  reliableSampleThreshold: number;
};

/** plan offer-1-sparkling-hippo P1:转化率可信样本阈值 */
export const MIN_RELIABLE_SAMPLE = 10;

export type DirectionMetric = {
  direction: RoleDirection;
  label: string;
  total: number;
  responseRate: number;
  interviewRate: number;
  offerRate: number;
};

/** /api/tracker/diagnose 返回 JSON schema(prompt 强约束) */
export type Diagnosis = {
  summary: string;
  /** 引用的关键指标快照(对照 evidence) */
  metrics: {
    total: number;
    responseRate: number;
    interviewRate: number;
    offerRate: number;
    ghostedRate: number;
    avgWaitDays: number;
  };
  /** 最可能的卡点 */
  likelyBottleneck:
    | "direction_mismatch"
    | "resume_match"
    | "application_pace"
    | "interview_expression"
    | "insufficient_data";
  /** evidence 必须落到具体指标,不允许空话 */
  evidence: string[];
  recommendedActions: RecommendedAction[];
  /** 0-1,基于样本量 + 数据完整度,样本 < 5 时强制 ≤ 0.4 */
  confidence: number;
  caution: string;
  /** 是否包含 sample,前端会展示提示 */
  containsSample: boolean;
  /** 生成时间(ISO) */
  generatedAt: string;
  /** 若 LLM 服务不可用,标记为 rule_fallback 让前端展示 */
  source: "ai" | "rule_fallback";
};

export type RecommendedAction = {
  /** 短文案;一句话 */
  title: string;
  /** 详细说明;两三句话内 */
  detail: string;
  /** 跳哪个模块(纯导航提示,不强改 Nav) */
  link?: "m1" | "m3" | "m5" | null;
  /** 行动来源;sample/ai/user_input 让用户辨识 */
  basedOn: "metrics" | "sample" | "user_input";
};

export const TRACKER_STORAGE_KEYS = {
  /** Application[] — 用户的投递列表 */
  APPLICATIONS: "tracker_applications_v1",
  /** Diagnosis | null — 上次诊断结果缓存(避免每次进页面都掉 LLM) */
  DIAGNOSIS_CACHE: "tracker_diagnosis_cache_v1",
  /** boolean — 用户是否已经选择"用我的数据"(true 后不再回填 sample) */
  USING_REAL_DATA: "tracker_using_real_data_v1",
} as const;
