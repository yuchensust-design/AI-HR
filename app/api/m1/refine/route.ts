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
import { createClient } from "@/lib/supabase/server";

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


function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。用户对上次推荐有反馈,请基于反馈调整推荐。

【★ 决策优先级 — 测评主 / 兴趣辅 ★】
- **主信号 (70%) = RIASEC 6 维分数**(基于霍兰德经典理论)
- **辅助信号 (30%) = 兴趣 tag**(消费爱好,辅助微调,不能反向决定 RIASEC)
- 冲突时(eg A 低但兴趣多 A 类)**以 RIASEC 测评为准**

【★ 响应用户反馈 — 核心任务 ★】
1. 先解读反馈的核心诉求（方向偏好 / 行业限定 / 忌讳）
2. 识别上次推荐中与该诉求冲突的项，**至少替换 2 个**
3. why_fit 必须明确体现如何响应了该反馈

【硬约束 — 永远不许违反】
1. 永远不输出任何公司名(只输出"行业 + 职位类型")
2. 文案温和,不绝对化,不偏激
3. 反向推荐用"消耗 + 天花板"框架
4. positive 和 negative 都只能从下方"候选池"里选 — 绝不创造新项
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

function buildSystemPromptWithEvidence(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。用户对上次推荐有反馈，你的任务是基于反馈做出**明显不同**的新推荐。

【两个信号 — 必须同时使用】
- 信号 A (RIASEC 测评)：决定推荐"方向"
- 信号 B (简历)：决定推荐"时机"（now / needs_project / long_term）

【三段分层定义】
- now：简历有直接技能/经历对口，现在就能投（Job Zone 1-3 + 简历强匹配）
- needs_project：方向对但差一段经历，补项目/实习后可投（Job Zone 2-4）
- long_term 有两种合理形式：
  A. 晋升路径：now/needs_project 方向的高阶职位（如产品经理→产品总监），RIASEC契合但需1-2年经验积累
  B. 转型路径：RIASEC强烈指向但简历无相关经验的全新方向，需系统转型
  优先考虑 A（更贴近用户当前起点，更可信）

【★ 响应用户反馈 — 这是本次调整的核心 ★】
处理步骤（必须按顺序执行）：
1. 解读反馈：用户的反馈说明了什么核心诉求？（方向偏好 / 行业限定 / 工作方式偏好 / 忌讳）
2. 识别冲突：上次推荐中哪些职位与该诉求冲突？列出来。
3. 替换冲突项：**至少替换 2 个**冲突项，从候选池中选更匹配该诉求的职位。
4. 写 why_fit：每个 positive 的 why_fit **必须明确体现**如何响应了用户的这个偏好，不能只说 RIASEC 匹配。

【领域相干性 — 硬约束】
- needs_project 和 long_term 必须与简历核心领域有现实可及的转型路径
- 【高校教职硬禁止】任何学科的「教授/副教授/讲师（高校）」需要博士学位，简历无博士学历或在读博士则一律禁推，包括「艺术教授/数字艺术教授/AI教授」等任何变体
- 禁止跨越专业执照壁垒：简历无建筑/医学/法律/教育科班背景，不推「建筑学教授/外科医生/律师/注册会计师」等
- 判断依据：用户通过 1-2 年努力真实可及？需重读学位/拿执照才能入行的，禁推

【其他硬约束】
- 永远不输出任何公司名
- positive 和 negative 只能从候选池里选，不创造新项
- 三段各至少 1 个
- needs_project 的 why_fit 必须同时引用简历具体经历 + RIASEC 方向
- why_fit 提"X 维度高/低"必须基于真实分数：高 ≥12 / 中 9-11 / 低 ≤8

【输出格式 — 严格 JSON，无 markdown 包裹】
{
  "positive": {
    "now": [{ "industry": "...", "role_type": "...", "why_fit": "...", "match": "高|中" }],
    "needs_project": [{ "industry": "...", "role_type": "...", "why_fit": "...", "match": "高|中" }],
    "long_term": [{ "industry": "...", "role_type": "...", "why_fit": "...", "match": "高|中" }]
  },
  "negative": [{ "industry": "...", "role_type": "...", "why_consuming": "..." }],
  "refine_chips": ["...", "..."]
}

negative 正好 3 个，refine_chips 正好 4-6 个，每 chip ≤ 12 字。`;
}

type EvidenceBody = {
  source: "resume" | "chat" | "skip";
  summary?: string;
  tags?: string[];
} | null;

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
  chip: string,
  evidence: EvidenceBody
): string {
  const [r, i, a, s, e, c] = scores;
  const interestStr =
    interests.length > 0
      ? interests.map((t) => `${t.key}(强度 ${t.strength}/5)`).join(", ")
      : "(无)";

  const evidenceBlock =
    evidence && evidence.source !== "skip" && evidence.summary
      ? `\n[信号 B：简历/补充信息]\n来源: ${evidence.source}\n摘要: ${evidence.summary}${
          evidence.tags && evidence.tags.length > 0
            ? `\n标签: ${evidence.tags.join(", ")}`
            : ""
        }\n`
      : "";

  return `[信号 A：RIASEC 测评结果]
RIASEC 编码: ${code}
6 维分数: R${r} I${i} A${a} S${s} E${e} C${c}
选中兴趣 tag(带喜欢程度): ${interestStr}
${evidenceBlock}
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

执行步骤：
1. 分析「${chip}」的核心诉求是什么
2. 找出上次推荐中与该诉求冲突的职位（至少 2 个）
3. 从候选池中选符合该诉求的替换项
4. 每个 why_fit 必须明确提到如何响应了「${chip}」这个偏好
返回 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const body = await request.json();
    const { previous, chip } = body as { previous: unknown; chip: string };
    const evidence = (body?.evidence ?? null) as EvidenceBody;
    const answers = migrateAnswersSchema(body?.answers);
    const hasEvidence = !!(evidence && evidence.source !== "skip" && evidence.summary);

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

    // Step 3 LLM — 有简历用三段 prompt，无简历用 flat prompt
    const raw = await chat(
      [
        {
          role: "system",
          content: hasEvidence ? buildSystemPromptWithEvidence() : buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt(scores, code, interests, candidates, previous, chip, evidence),
        },
      ],
      {
        model: "chat",
        temperature: 0.75,
        max_tokens: 1800,
        jsonMode: true,
      }
    );

    let parsed: {
      positive?: Array<Record<string, unknown>> | {
        now?: Array<Record<string, unknown>>;
        needs_project?: Array<Record<string, unknown>>;
        long_term?: Array<Record<string, unknown>>;
      };
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

    // 解析 positive — 有简历时是 tiered 嵌套格式，无简历时是 flat array
    let normalizedPositive: Array<Record<string, unknown>>;
    if (hasEvidence && parsed.positive && !Array.isArray(parsed.positive)) {
      const tiered = parsed.positive as {
        now?: Array<Record<string, unknown>>;
        needs_project?: Array<Record<string, unknown>>;
        long_term?: Array<Record<string, unknown>>;
      };
      normalizedPositive = [
        ...(tiered.now ?? []).map((p) => ({ ...p, employability_level: "now" })),
        ...(tiered.needs_project ?? []).map((p) => ({ ...p, employability_level: "needs_project" })),
        ...(tiered.long_term ?? []).map((p) => ({ ...p, employability_level: "long_term" })),
      ];
    } else {
      // flat array（无简历）— 用 job_zone 推断 tier
      const VALID_EMPLOY = ["now", "needs_project", "long_term"] as const;
      type ValidEmploy = (typeof VALID_EMPLOY)[number];
      function inferEmployability(role_type: string, llmRaw: unknown): ValidEmploy {
        const candidate = candidates.find(
          (p) => p.title_cn === role_type || role_type.includes(p.title_cn) || p.title_cn.includes(role_type),
        );
        if (candidate) {
          const z = (candidate as { job_zone?: number }).job_zone ?? 3;
          return z <= 2 ? "now" : z === 3 ? "needs_project" : "long_term";
        }
        if (typeof llmRaw === "string" && (VALID_EMPLOY as readonly string[]).includes(llmRaw)) {
          return llmRaw as ValidEmploy;
        }
        return "needs_project";
      }
      normalizedPositive = (Array.isArray(parsed.positive) ? parsed.positive : []).map((p) => ({
        ...p,
        employability_level: inferEmployability(String(p.role_type ?? ""), p.employability_level),
      }));
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

    const rationale = normalizeRationale(parsed.rationale ?? null, confidence, scores);

    // 登录用户 → 更新 m1_assessments.recommendation_json（保留 riasec_json 不动）
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("m1_assessments")
          .update({
            recommendation_json: {
              positive: normalizedPositive,
              negative: normalizedNegative,
              refine_chips: normalizedChips,
              rationale,
            },
          })
          .eq("user_id", user.id);
      }
    } catch (dbErr) {
      console.warn("[m1/refine] db update failed:", dbErr);
    }

    return NextResponse.json({
      positive: normalizedPositive,
      negative: normalizedNegative,
      refine_chips: normalizedChips,
      rationale,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/refine error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
