/**
 * POST /api/tracker/diagnose
 *
 * 输入投递记录 + 指标快照,返回 JSON 诊断。
 *
 * Body: { applications: Application[], metrics: Metrics, role?: string }
 *
 * 返回: Diagnosis(见 lib/tracker-types.ts)
 *
 * 硬约束:
 *  - 不预测求职结果("你大概能拿到 offer" 之类禁止)
 *  - 不输出公司名
 *  - 所有 evidence 必须引用具体指标
 *  - 样本 < 5 时 confidence 强制 ≤ 0.4
 *  - LLM 失败时 -> ruleBasedDiagnosis(本地纯函数兜底),source = rule_fallback
 */

import { NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import {
  Application,
  Diagnosis,
  DIRECTION_LABELS,
  Metrics,
  RecommendedAction,
  STATUS_LABELS,
} from "@/lib/tracker-types";
import {
  computeMetrics,
  formatPct,
  ruleBasedDiagnosis,
} from "@/lib/tracker-metrics";

const ALLOWED_BOTTLENECKS = new Set([
  "direction_mismatch",
  "resume_match",
  "application_pace",
  "interview_expression",
  "insufficient_data",
]);

const ALLOWED_LINKS = new Set(["m1", "m3", "m5"]);
const ALLOWED_BASED_ON = new Set(["metrics", "sample", "user_input"]);

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的求职数据诊断助理。你的工作是根据用户的投递记录和指标快照,给出 1 段精炼诊断 + 2-4 条可执行建议。

你的能力定位:辅助判断,不是求职结果预测。

【硬约束】
1. 永远不输出具体公司名,只能用"行业 + 职位类型"。
2. 不预测概率("你大概率能拿到 offer" 之类禁止);只对**已有数据**做判断。
3. 每条 evidence 必须明确引用一个指标(eg "回复率 23%"、"已挂占比 50%"、"已投递 3 份"),禁止空话。
4. 如果数据里包含 sample 记录(isSample = true),诊断里要明确指出"样本含示例数据,真实样本不足"。
5. 若样本 < 5 份已投递,直接选 likelyBottleneck = "insufficient_data",confidence ≤ 0.4。
6. 不评判用户能力,只描述现象 + 给下一步操作。
7. 不夸大、不绝对化、不写"一定/必然/肯定"等词。

【likelyBottleneck 五选一】
- direction_mismatch: 方向之间回复率差距明显 → 建议聚焦回复更好的方向。
- resume_match: 回复率(已投递→任何反馈)显著偏低 → 建议去 M3 重做简历 + JD 关键词对齐。
- application_pace: 已挂率高 或 投递太散 → 建议收窄方向、提高密度。
- interview_expression: 进面率正常但 offer 率明显偏低 → 建议去 M5 练面试表达。
- insufficient_data: 样本不足。

【recommendedActions】
- 2-4 条,每条:title(一句)、detail(两三句话内)、link("m1"/"m3"/"m5"/null)、basedOn("metrics" | "sample" | "user_input")
- 至少 1 条 link != null,把用户引导回 5 大模块。
- 每条 detail 里至少出现一个具体指标数字或方向标签。

【返回 JSON schema — 严格】
{
  "summary": string,              // 1-2 句总结
  "likelyBottleneck": "direction_mismatch" | "resume_match" | "application_pace" | "interview_expression" | "insufficient_data",
  "evidence": string[],           // 2-4 条,每条引用具体指标数字
  "recommendedActions": [
    { "title": string, "detail": string, "link": "m1"|"m3"|"m5"|null, "basedOn": "metrics"|"sample"|"user_input" }
  ],
  "confidence": number,           // 0-1
  "caution": string               // 一句话提醒:辅助判断不是结果预测
}

直接返回 JSON,不要 markdown 代码块。`;
}

function buildUserPrompt(metrics: Metrics, applications: Application[]): string {
  const directionsBlock = metrics.byDirection
    .map(
      (d) =>
        `- ${d.label}: 共 ${d.total} 份 / 回复率 ${formatPct(d.responseRate)} / 面试率 ${formatPct(d.interviewRate)} / offer 率 ${formatPct(d.offerRate)}`,
    )
    .join("\n");

  // 给 LLM 看脱敏的简表(只到行业 + 职位 + 状态 + 方向 + 投递日)
  const applicationsBlock = applications
    .slice(0, 30)
    .map(
      (a, i) =>
        `${i + 1}. [${a.isSample ? "示例" : "真实"}] ${a.industry} | ${a.role} | 方向=${DIRECTION_LABELS[a.direction]} | 投递=${a.appliedAt} | 状态=${STATUS_LABELS[a.status]}@${a.statusUpdatedAt}`,
    )
    .join("\n");

  return `# 当前投递指标快照
- 总投递: ${metrics.total}(其中示例 ${metrics.sampleCount} / 真实 ${metrics.realCount})
- 已投递(分母): ${metrics.applied}
- 回复率: ${formatPct(metrics.responseRate)}
- 面试转化率: ${formatPct(metrics.interviewRate)}
- offer 率: ${formatPct(metrics.offerRate)}
- 已挂占比: ${formatPct(metrics.ghostedRate)}
- 平均等待: ${metrics.avgWaitDays.toFixed(1)} 天

# 按方向汇总
${directionsBlock || "(暂无数据)"}

# 投递明细(脱敏,无公司名)
${applicationsBlock || "(暂无记录)"}

请按上面 schema 严格返回 JSON。`;
}

/**
 * Normalize LLM 输出 — 防字段缺失、类型错位。
 * 任何字段缺失/非法都用默认值 + 兜底。
 */
function normalizeDiagnosis(
  raw: unknown,
  metrics: Metrics,
  containsSample: boolean,
  source: "ai" | "rule_fallback",
): Diagnosis {
  const r =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const bottleneck =
    typeof r.likelyBottleneck === "string" &&
    ALLOWED_BOTTLENECKS.has(r.likelyBottleneck)
      ? (r.likelyBottleneck as Diagnosis["likelyBottleneck"])
      : "insufficient_data";

  const evidence = Array.isArray(r.evidence)
    ? r.evidence
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .slice(0, 6)
    : [];

  const actionsRaw = Array.isArray(r.recommendedActions)
    ? r.recommendedActions
    : [];
  const actions: RecommendedAction[] = actionsRaw
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : {}))
    .map((a) => {
      const link =
        typeof a.link === "string" && ALLOWED_LINKS.has(a.link)
          ? (a.link as "m1" | "m3" | "m5")
          : null;
      const basedOn =
        typeof a.basedOn === "string" && ALLOWED_BASED_ON.has(a.basedOn)
          ? (a.basedOn as RecommendedAction["basedOn"])
          : "metrics";
      return {
        title:
          typeof a.title === "string" && a.title.trim()
            ? a.title.trim()
            : "下一步建议",
        detail:
          typeof a.detail === "string" && a.detail.trim()
            ? a.detail.trim()
            : "(建议详情缺失)",
        link,
        basedOn,
      };
    })
    .slice(0, 5);

  let confidence =
    typeof r.confidence === "number" && Number.isFinite(r.confidence)
      ? r.confidence
      : 0.4;
  confidence = Math.max(0, Math.min(1, confidence));
  if (metrics.applied < 5 && confidence > 0.4) confidence = 0.4;

  const summary =
    typeof r.summary === "string" && r.summary.trim()
      ? r.summary.trim()
      : "样本量偏少,先把投递补到 5 份以上再看趋势。";
  const caution =
    typeof r.caution === "string" && r.caution.trim()
      ? r.caution.trim()
      : "诊断是辅助判断,不是求职结果预测。";

  return {
    summary,
    metrics: {
      total: metrics.total,
      responseRate: metrics.responseRate,
      interviewRate: metrics.interviewRate,
      offerRate: metrics.offerRate,
      ghostedRate: metrics.ghostedRate,
      avgWaitDays: metrics.avgWaitDays,
    },
    likelyBottleneck: bottleneck,
    evidence:
      evidence.length > 0
        ? evidence
        : [`已投递 ${metrics.applied} 份,样本不足,建议先补充数据。`],
    recommendedActions:
      actions.length > 0
        ? actions
        : [
            {
              title: "补充投递记录到 5 份以上再看诊断",
              detail: "现有样本不足以给出可靠判断。",
              link: null,
              basedOn: "metrics",
            },
          ],
    confidence,
    caution,
    containsSample,
    generatedAt: new Date().toISOString(),
    source,
  };
}

function fallbackDiagnosis(
  metrics: Metrics,
  containsSample: boolean,
): Diagnosis {
  const r = ruleBasedDiagnosis(metrics);
  const summaryPart =
    metrics.applied < 5
      ? `已投递 ${metrics.applied} 份,样本不足以给出趋势判断,建议继续投递后再回来看。`
      : `共 ${metrics.applied} 份已投递,回复率 ${formatPct(metrics.responseRate)},卡点偏向"${labelForBottleneck(r.likelyBottleneck)}"。`;
  return normalizeDiagnosis(
    {
      summary: summaryPart,
      likelyBottleneck: r.likelyBottleneck,
      evidence: r.evidence,
      recommendedActions: r.actions,
      confidence: metrics.applied < 5 ? 0.2 : 0.55,
      caution: "本次诊断基于本地规则;AI 服务不可用或被跳过,请把它当一个参考。",
    },
    metrics,
    containsSample,
    "rule_fallback",
  );
}

function labelForBottleneck(b: Diagnosis["likelyBottleneck"]): string {
  switch (b) {
    case "direction_mismatch":
      return "方向不匹配";
    case "resume_match":
      return "简历对 JD 不对齐";
    case "application_pace":
      return "投递节奏 / 方向太散";
    case "interview_expression":
      return "面试表达";
    case "insufficient_data":
      return "样本不足";
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const applications: Application[] = Array.isArray(body?.applications)
      ? body.applications
      : [];

    if (applications.length === 0) {
      return NextResponse.json(
        {
          error: "applications 为空,无法生成诊断。",
        },
        { status: 400 },
      );
    }

    const metrics = computeMetrics(applications);
    const containsSample = applications.some((a) => a.isSample);

    // 样本太少直接走规则版,不浪费 LLM 调用
    if (metrics.applied < 5) {
      return NextResponse.json(fallbackDiagnosis(metrics, containsSample));
    }

    let raw: string;
    try {
      raw = await chat(
        [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildUserPrompt(metrics, applications) },
        ],
        { model: "chat", temperature: 0.3, jsonMode: true, max_tokens: 1200 },
      );
    } catch (e) {
      console.warn("[tracker/diagnose] LLM call failed", e);
      return NextResponse.json(fallbackDiagnosis(metrics, containsSample));
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn("[tracker/diagnose] JSON parse failed", e, "raw=", raw);
      return NextResponse.json(fallbackDiagnosis(metrics, containsSample));
    }

    const diagnosis = normalizeDiagnosis(parsed, metrics, containsSample, "ai");
    return NextResponse.json(diagnosis);
  } catch (err) {
    console.error("[tracker/diagnose] unexpected error", err);
    return NextResponse.json(
      {
        error: "diagnose 内部错误,稍后再试。",
      },
      { status: 500 },
    );
  }
}
