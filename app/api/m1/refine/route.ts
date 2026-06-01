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
  computeRIASEC,
  formatRIASECCode,
  getSelectedInterests,
} from "@/lib/quiz-data";
import { generateCandidates } from "@/lib/career-pool";

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

【硬约束 — 永远不许违反】
1. 永远不输出任何公司名(只输出"行业 + 职位类型")
2. 文案温和,不绝对化,不偏激
3. 反向推荐用"消耗 + 天花板"框架
4. positive 和 negative 都只能从下方"候选池"里选 — 绝不创造新项
5. **必须真正响应用户反馈** — 上次推荐里跟反馈冲突的项,要换掉

【反向 3 个的判定依据(只用这 3 条)】
a) 工作内容与用户 enjoy 信号反向
b) 长期天花板低 — 本科起点 5 年后晋升空间 < 30%
c) 工作模式与用户 RIASEC 类型反向(E 型坐冷板凳 / I 型纯销售 / A 型纯流程)

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
  "refine_chips": ["...", "..."]
}

positive 正好 5 个,negative 正好 3 个,refine_chips 正好 4-6 个,每 chip ≤ 12 字。
**字段名必须用 why_fit / why_consuming(不要写成 why_bad / why)**`;
}

function buildUserPrompt(
  scores: [number, number, number, number, number, number],
  code: string,
  tagKeys: string[],
  pool: Array<{ industry: string; role_type: string }>,
  previous: unknown,
  chip: string
): string {
  const [r, i, a, s, e, c] = scores;
  return `用户测评结果:
RIASEC 编码: ${code}
6 维分数: R${r} I${i} A${a} S${s} E${e} C${c}
选中兴趣 tag: ${tagKeys.length > 0 ? tagKeys.join(", ") : "(无)"}

候选池(${pool.length} 项):
${pool.map((p, idx) => `${idx + 1}. ${p.industry} / ${p.role_type}`).join("\n")}

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
    // 18REST-2: RIASEC 题答案是 Likert 1-5 数字,兴趣 tag 是 string[]
    const { answers, previous, chip } = body as {
      answers: Record<number, number | string[]>;
      previous: unknown;
      chip: string;
    };

    if (!answers || !chip) {
      return NextResponse.json(
        { error: "answers + chip required" },
        { status: 400 }
      );
    }

    // 重算 Step 1+2
    const scores = computeRIASEC(answers);
    const code = formatRIASECCode(scores);
    const tagKeys = getSelectedInterests(answers);
    const candidates = generateCandidates(scores, tagKeys, 30);

    // Step 3 LLM
    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(
            scores,
            code,
            tagKeys,
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
      positive: Array<Record<string, unknown>>;
      negative: Array<Record<string, unknown>>;
      refine_chips: string[];
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

    return NextResponse.json({
      positive: parsed.positive ?? [],
      negative: normalizedNegative,
      refine_chips: parsed.refine_chips ?? [],
      rateLimit: { remaining, limit: RATE_LIMIT },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/refine error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
