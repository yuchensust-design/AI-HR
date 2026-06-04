/**
 * POST /api/m1/refine — chip 修推荐
 *
 * Body: {
 *   answers: Record<number, string|string[]>,  // 原始答案,重算 scores + 候选池
 *   previous: { positive, negative, refine_chips },  // 上次推荐
 *   chip: string  // 用户点的 chip 文字
 * }
 *
 * Rate limit: 同 IP 5 次 / 小时(in-memory,v1 简化;Vercel serverless 跨实例可能略宽松)
 *
 * plan §8.16 §H lock
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import {
  computeConfidence,
  computeRIASEC,
  formatRIASECCode,
  getSelectedInterests,
  migrateAnswersSchema,
  type Confidence,
  type InterestWithStrength,
} from "@/lib/quiz-data";
import { generateCandidates } from "@/lib/career-pool";

type LlmRationale = {
  interestEvidence?: unknown;
  experienceEvidence?: unknown;
  preferenceSignals?: unknown;
  confidence?: unknown;
  confidenceWhy?: unknown;
  cautions?: unknown;
  nextStep?: unknown;
  whyNotOther?: unknown;
};

function normString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeRationale(
  raw: LlmRationale | null | undefined,
  confidence: Confidence,
  scores: [number, number, number, number, number, number]
) {
  const r = raw || {};
  const top1 = Math.max(...scores);
  const cautionsRaw = Array.isArray(r.cautions) ? r.cautions : [];
  const cautions = cautionsRaw
    .map((c) => normString(c))
    .filter((c) => c.length > 0)
    .slice(0, 3);

  const allowedConfidence = new Set<Confidence>(["high", "mid", "low", "none"]);
  const conf =
    typeof r.confidence === "string" && allowedConfidence.has(r.confidence as Confidence)
      ? (r.confidence as Confidence)
      : confidence;

  return {
    interestEvidence:
      normString(r.interestEvidence) ||
      "本次调整基于你的反馈,我们重新对齐 Top 3 维度 + 偏好。",
    experienceEvidence:
      r.experienceEvidence === null
        ? null
        : normString(r.experienceEvidence) || null,
    preferenceSignals:
      normString(r.preferenceSignals) ||
      "RIASEC 是主信号,兴趣 tag 在该框架内做微调。",
    confidence: conf,
    confidenceWhy:
      normString(r.confidenceWhy) ||
      `Top1 = ${top1}/15,本次按反馈调整后推荐保留了主要倾向。`,
    cautions:
      cautions.length > 0
        ? cautions
        : [
            "调整后仍是相对契合度,不是结论",
            "投递前请用『简历整理』结合具体 JD 再核对",
          ],
    nextStep:
      normString(r.nextStep) ||
      "可以继续微调,或直接去『简历整理』把现有经历针对方向调一版。",
    whyNotOther:
      normString(r.whyNotOther) ||
      "下面「反向 3 个」段会展开 — 只描述跟你的维度错配,不评判这些方向。",
  };
}

// In-memory rate limit(单实例)
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 小时

function checkRateLimit(ip: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = (rateLimitMap.get(ip) || []).filter(
    (ts) => now - ts < RATE_WINDOW_MS
  );

  if (timestamps.length >= RATE_LIMIT) {
    return { ok: false, remaining: 0 };
  }

  timestamps.push(now);
  rateLimitMap.set(ip, timestamps);
  return { ok: true, remaining: RATE_LIMIT - timestamps.length };
}

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。用户对上次推荐有反馈,请基于反馈调整推荐。

【★ 决策优先级 — 测评主 / 兴趣辅 ★】
- **主信号 (70%) = RIASEC 6 维分数**(基于霍兰德经典理论)
- **辅助信号 (30%) = 兴趣 tag**(消费爱好,辅助微调,不能反向决定 RIASEC)
- 冲突时(eg A 低但兴趣多 A 类)**以 RIASEC 测评为准**

【硬约束 — 永远不许违反】
1. 永远不输出任何公司名(只输出"行业 + 职位类型")
2. 文案温和,不绝对化,不偏激
3. 反向推荐用"消耗 + 天花板"框架
4. positive 和 negative 都只能从下方"候选池"里选 — 绝不创造新项
5. **必须真正响应用户反馈** — 上次推荐里跟反馈冲突的项,要换掉
6. **兴趣 tag ≠ RIASEC 维度分数!** — 兴趣是爱好,不等于用户在该维度高
   - why_fit 提"X 维度高/低"必须基于真实 6 维分数(3-15)
   - 说"X 高" → 该维度 ≥12 / "中" → 9-11 / "低" → ≤8
   - 严禁错误归因(eg 用户 A=7 但说"你的 A 高")
   - 优先用 Top 3 真实高分维度做推荐依据,兴趣是辅助

【反向 3 个的判定依据(只用这 3 条)】
a) 工作内容与用户 enjoy 信号反向
b) 长期天花板低 — 本科起点 5 年后晋升空间 < 30%
c) 工作模式与用户 RIASEC 类型反向(E 型坐冷板凳 / I 型纯销售 / A 型纯流程)

【★ rationale 字段 — 可解释推荐 ★】
- 必须输出顶层 rationale 对象,7 个子字段(experienceEvidence 仅可填 null)
- 温和不绝对化("可能 / 看起来 / 值得探索",避免"一定 / 必然 / 不适合")
- cautions 1-3 条,每条 ≤ 30 字,是温和提醒不是判决
- whyNotOther 必须基于 negative 列表做对比解释,只描述维度错配
- experienceEvidence v1 没接简历输入 → 必须填 null
- 永远不输出公司名

【输出格式 — 严格 JSON,字段名必须精确,无任何 markdown 包裹】
{
  "positive": [
    {
      "industry": "...",
      "role_type": "...",
      "why_fit": "1-2 句温和说明",
      "match": "高" 或 "中"
    }
  ],
  "negative": [
    {
      "industry": "...",
      "role_type": "...",
      "why_consuming": "1 句,只描述错配"
    }
  ],
  "refine_chips": ["...", "..."],
  "rationale": {
    "interestEvidence": "...",
    "experienceEvidence": null,
    "preferenceSignals": "...",
    "confidence": "high",
    "confidenceWhy": "...",
    "cautions": ["...", "..."],
    "nextStep": "...",
    "whyNotOther": "..."
  }
}

positive 正好 5 个,negative 正好 3 个,refine_chips 正好 4-6 个,每 chip ≤ 12 字。
**字段名必须用 why_fit / why_consuming(不要写成 why_bad / why)**`;
}

function buildUserPrompt(
  scores: [number, number, number, number, number, number],
  code: string,
  interests: InterestWithStrength[],
  pool: Array<{
    industry_cn: string;
    title_cn: string;
    title_en: string;
    riasec: Record<string, number>;
  }>,
  previous: unknown,
  chip: string
): string {
  const [r, i, a, s, e, c] = scores;
  const interestStr =
    interests.length > 0
      ? interests.map((t) => `${t.key}(强度 ${t.strength}/5)`).join(", ")
      : "(无)";
  return `用户测评结果:
RIASEC 编码: ${code}
6 维分数: R${r} I${i} A${a} S${s} E${e} C${c}
选中兴趣 tag(带喜欢程度): ${interestStr}

候选池(${pool.length} 项,来自 O*NET 30.3,带真实 RIASEC 1.0-7.0 数值):
${pool
  .map(
    (p, idx) =>
      `${idx + 1}. [${p.industry_cn}] ${p.title_cn} | R${p.riasec.R} I${p.riasec.I} A${p.riasec.A} S${p.riasec.S} E${p.riasec.E} C${p.riasec.C}`
  )
  .join("\n")}

【上次推荐】
${JSON.stringify(previous, null, 2)}

【用户反馈】"${chip}"
请基于这个反馈重新给推荐。返 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const { ok, remaining } = checkRateLimit(ip);
    if (!ok) {
      return NextResponse.json(
        {
          error: "调整次数已达上限(5 次/小时),稍后再试 ~",
          retryAfter: RATE_WINDOW_MS / 1000,
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    // Likert 1-5 + 兴趣 tag Record<label, strength>;migrateAnswersSchema 兜底 v2/坏数据
    const { previous, chip } = body as {
      previous: unknown;
      chip: string;
    };
    const answers = migrateAnswersSchema(body?.answers);

    if (Object.keys(answers).length === 0 || !chip) {
      return NextResponse.json(
        { error: "answers + chip required" },
        { status: 400 }
      );
    }

    // 重算 Step 1+2
    const scores = computeRIASEC(answers);
    const code = formatRIASECCode(scores);
    const confidence = computeConfidence(answers, scores);
    const interests = getSelectedInterests(answers);
    const candidates = generateCandidates(scores, interests, 30);

    // Step 3 LLM
    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(
            scores,
            code,
            interests,
            candidates,
            previous,
            chip
          ),
        },
      ],
      {
        model: "chat",
        temperature: 0.6,
        max_tokens: 1500,
        jsonMode: true,
      }
    );

    let parsed: {
      positive?: Array<Record<string, unknown>>;
      negative?: Array<Record<string, unknown>>;
      refine_chips?: unknown;
      rationale?: LlmRationale | null;
    };
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("LLM JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    // Normalize:LLM 偶尔把 why_consuming 写成 why_bad / why,兜底救回
    const normalizedNegative = (parsed.negative ?? []).map((n) => ({
      industry: n.industry,
      role_type: n.role_type,
      why_consuming:
        n.why_consuming ?? n.why_bad ?? n.why ?? n.reason ?? "",
    }));

    const normalizedChips = Array.isArray(parsed.refine_chips)
      ? parsed.refine_chips.filter((c): c is string => typeof c === "string")
      : [];

    return NextResponse.json({
      positive: parsed.positive ?? [],
      negative: normalizedNegative,
      refine_chips: normalizedChips,
      rationale: normalizeRationale(parsed.rationale ?? null, confidence, scores),
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/refine error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
