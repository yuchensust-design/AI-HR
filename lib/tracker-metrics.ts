/**
 * 投递追踪指标计算 — 纯函数,无 React、无 LLM、无 storage 依赖。
 *
 * 上游: Application[]
 * 下游: 指标卡 / 诊断 API 输入 / 规则版 fallback
 */

import {
  Application,
  ApplicationStatus,
  DIRECTION_LABELS,
  DirectionMetric,
  Metrics,
  RoleDirection,
} from "./tracker-types";

/**
 * "已投递及之后" 的状态(用作回复率/转化率的分母)。
 * to_apply 没真投出去,不进分母。
 */
const APPLIED_OR_AFTER: ApplicationStatus[] = [
  "applied",
  "written_test",
  "interview",
  "offer",
  "rejected",
  "ghosted",
];

const RESPONDED_STATUSES: ApplicationStatus[] = [
  "written_test",
  "interview",
  "offer",
  "rejected",
];

const INTERVIEWED_STATUSES: ApplicationStatus[] = ["interview", "offer"];

function safeRate(num: number, denom: number): number {
  if (denom <= 0) return 0;
  const r = num / denom;
  if (!Number.isFinite(r)) return 0;
  return Math.max(0, Math.min(1, r));
}

function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(fromISO);
  const b = Date.parse(toISO);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  const ms = b - a;
  if (ms < 0) return 0;
  return ms / (1000 * 60 * 60 * 24);
}

export function computeMetrics(applications: Application[]): Metrics {
  const list = applications ?? [];
  const total = list.length;
  const applied = list.filter((a) => APPLIED_OR_AFTER.includes(a.status)).length;
  const responded = list.filter((a) => RESPONDED_STATUSES.includes(a.status)).length;
  const interviewed = list.filter((a) =>
    INTERVIEWED_STATUSES.includes(a.status),
  ).length;
  const offered = list.filter((a) => a.status === "offer").length;
  const rejected = list.filter((a) => a.status === "rejected").length;
  const ghosted = list.filter((a) => a.status === "ghosted").length;

  const responseRate = safeRate(responded + ghosted > 0 ? responded : 0, applied);
  const interviewRate = safeRate(interviewed, applied);
  const offerRate = safeRate(offered, applied);
  const ghostedRate = safeRate(ghosted, applied);

  // avgWaitDays: 已投递的样本里 appliedAt -> statusUpdatedAt 的平均天数
  const waitSamples = list
    .filter((a) => APPLIED_OR_AFTER.includes(a.status))
    .map((a) => daysBetween(a.appliedAt, a.statusUpdatedAt));
  const avgWaitDays =
    waitSamples.length > 0
      ? waitSamples.reduce((s, d) => s + d, 0) / waitSamples.length
      : 0;

  // 按方向聚合
  const directionSet = new Set<RoleDirection>(list.map((a) => a.direction));
  const byDirection: DirectionMetric[] = Array.from(directionSet)
    .map((dir) => {
      const sub = list.filter((a) => a.direction === dir);
      const subApplied = sub.filter((a) => APPLIED_OR_AFTER.includes(a.status))
        .length;
      const subResponded = sub.filter((a) =>
        RESPONDED_STATUSES.includes(a.status),
      ).length;
      const subInterviewed = sub.filter((a) =>
        INTERVIEWED_STATUSES.includes(a.status),
      ).length;
      const subOffered = sub.filter((a) => a.status === "offer").length;
      return {
        direction: dir,
        label: DIRECTION_LABELS[dir],
        total: sub.length,
        responseRate: safeRate(subResponded, subApplied),
        interviewRate: safeRate(subInterviewed, subApplied),
        offerRate: safeRate(subOffered, subApplied),
      };
    })
    .sort((a, b) => b.total - a.total);

  const sampleCount = list.filter((a) => a.isSample).length;
  const realCount = total - sampleCount;

  return {
    total,
    applied,
    responded,
    interviewed,
    offered,
    rejected,
    ghosted,
    responseRate,
    interviewRate,
    offerRate,
    ghostedRate,
    avgWaitDays,
    byDirection,
    sampleCount,
    realCount,
  };
}

export function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

export function formatDays(days: number): string {
  if (days <= 0) return "—";
  if (days < 1) return "< 1 天";
  return `${days.toFixed(1)} 天`;
}

/**
 * 规则版诊断兜底 — LLM 不可用时使用。
 * 不假装 AI;前端会标 source = rule_fallback。
 */
export function ruleBasedDiagnosis(metrics: Metrics) {
  const evidence: string[] = [];
  let likelyBottleneck:
    | "direction_mismatch"
    | "resume_match"
    | "application_pace"
    | "interview_expression"
    | "insufficient_data" = "insufficient_data";
  const actions: {
    title: string;
    detail: string;
    link?: "m1" | "m3" | "m5" | null;
    basedOn: "metrics" | "sample" | "user_input";
  }[] = [];

  if (metrics.applied < 5) {
    likelyBottleneck = "insufficient_data";
    evidence.push(
      `已投递样本只有 ${metrics.applied} 份,不足以做趋势判断(基础规则建议样本 ≥ 5)。`,
    );
    actions.push({
      title: "先把投递记录补到 5 份以上",
      detail: "样本太少时,所有转化率都会被单条结果带偏,先补够基础样本再看诊断。",
      link: null,
      basedOn: "metrics",
    });
  } else {
    // 信号 1: 回复率低
    if (metrics.responseRate < 0.2) {
      likelyBottleneck = "resume_match";
      evidence.push(
        `回复率 ${formatPct(metrics.responseRate)},低于 20% 的经验线;说明简历在初筛环节就被刷掉。`,
      );
      actions.push({
        title: "去 M3 用 JD 重新对照简历关键词",
        detail:
          "回复率低优先指向简历和 JD 关键词不匹配,而不是面试问题。M3 的 Live Diff 能定位缺哪些关键词。",
        link: "m3",
        basedOn: "metrics",
      });
    }
    // 信号 2: 有面试但 offer 转化低
    else if (metrics.interviewRate >= 0.2 && metrics.offerRate < 0.05) {
      likelyBottleneck = "interview_expression";
      evidence.push(
        `面试转化 ${formatPct(metrics.interviewRate)} 已经及格,但 offer 率仅 ${formatPct(metrics.offerRate)},卡点在面试表达。`,
      );
      actions.push({
        title: "去 M5 做行为面 + 严厉型 HR 复盘",
        detail:
          "回到面试场景里看哪一类问题分低,有针对性地练 STAR 表达和压力追问。",
        link: "m5",
        basedOn: "metrics",
      });
    }
    // 信号 3: 已挂占比高
    else if (metrics.ghostedRate >= 0.4) {
      likelyBottleneck = "application_pace";
      evidence.push(
        `"已挂"占比 ${formatPct(metrics.ghostedRate)},高于 40%;可能是投递节奏过散或方向不集中。`,
      );
      actions.push({
        title: "收窄方向 + 提高每个方向的投递密度",
        detail:
          "已挂率高通常不是简历问题,而是投递分布太散。先选 1-2 个方向集中投,把样本拉到可对比的量级。",
        link: "m1",
        basedOn: "metrics",
      });
    }
    // 信号 4: 方向差距明显
    else if (metrics.byDirection.length >= 2) {
      const best = metrics.byDirection.reduce((a, b) =>
        a.responseRate > b.responseRate ? a : b,
      );
      const worst = metrics.byDirection.reduce((a, b) =>
        a.responseRate < b.responseRate ? a : b,
      );
      if (best.responseRate - worst.responseRate >= 0.3) {
        likelyBottleneck = "direction_mismatch";
        evidence.push(
          `"${best.label}" 回复率 ${formatPct(best.responseRate)},"${worst.label}" 回复率 ${formatPct(worst.responseRate)};方向差距 ≥ 30pp,可能匹配度不同。`,
        );
        actions.push({
          title: `优先投 ${best.label}`,
          detail:
            "在样本里这个方向回复明显更好,继续投同方向是性价比最高的下一步;另一方向暂停或重做简历定制后再投。",
          link: "m1",
          basedOn: "metrics",
        });
      }
    }
  }

  if (evidence.length === 0) {
    evidence.push(
      `回复率 ${formatPct(metrics.responseRate)} / 面试 ${formatPct(metrics.interviewRate)} / offer ${formatPct(metrics.offerRate)} 都在常见区间,暂未发现明显卡点。`,
    );
    actions.push({
      title: "保持节奏 + 投递满一周再看趋势",
      detail:
        "当前数据没有显著瓶颈;继续按现有节奏投,数据量上来后回到这里再看诊断。",
      link: null,
      basedOn: "metrics",
    });
  }

  return { likelyBottleneck, evidence, actions };
}
