/**
 * POST /api/m1/recommend — 模块 1 测评推荐(三段融合)
 *
 * Body: { answers: Record<number, string | string[]> }
 *
 * 三段:
 *   Step 1 计分(规则):computeRIASEC + formatRIASECCode + computeConfidence
 *   Step 2 候选池(规则):generateCandidates(scores, tags) → top 30
 *   Step 3 LLM 综合(deepseek-chat,JSON 模式):5 正向 + 3 反向 + 4-6 chip
 *
 * 返回:
 *   {
 *     scores: [R,I,A,S,E,C],
 *     code: "E9 I8 S6 ...",
 *     confidence: "high" | "mid" | "low" | "none",
 *     positive: [...5 项],
 *     negative: [...3 项],
 *     refine_chips: [...4-6 chip],
 *     disclaimer: "本次推荐基于测评 + 兴趣..."
 *   }
 *
 * plan §8.16 §D-§G lock
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import {
  computeRIASEC,
  formatRIASECCode,
  computeConfidence,
  getSelectedInterests,
} from "@/lib/quiz-data";
import { generateCandidates } from "@/lib/career-pool";

const DISCLAIMER =
  "本次推荐基于测评 + 兴趣 — 没看你的真实经历。投递前请先用『简历整理』模块结合 JD 确认能力对齐。";

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的兴趣岗位顾问。基于用户的 RIASEC 编码 + 兴趣 tag,从候选池里筛选推荐。

【硬约束 — 永远不许违反】
1. 永远不输出任何公司名(只输出"行业 + 职位类型",eg "互联网 / 内容运营")
2. 文案温和,不绝对化,不偏激,不当 black box
3. 反向推荐用"消耗 + 天花板"框架 — 不评判,只描述错配
4. positive 和 negative 都只能从下方"候选池"里选 — 绝不创造新项

【反向 3 个的判定依据(只用这 3 条)】
a) 工作内容与用户 enjoy 信号反向
b) 长期天花板低 — 本科起点 5 年后晋升空间 < 30%
c) 工作模式与用户 RIASEC 类型反向(E 型坐冷板凳 / I 型纯销售 / A 型纯流程)

【chip 设计】
- 4-6 个 chip,每个 ≤ 12 字,中文,口语化
- 用于让用户"修推荐"(eg "去掉销售岗" / "想要更稳定" / "加技术深度")
- 不要重复用户已表达的兴趣,要给"调整方向"的选项

【输出格式 — 严格 JSON,无任何 markdown 包裹】
{
  "positive": [
    {
      "industry": "互联网",
      "role_type": "内容运营",
      "why_fit": "你的 A 高 + 选了音乐兴趣,这类岗位偏向乐感和审美(1-2 句,温和)",
      "match": "高"
    }
  ],
  "negative": [
    {
      "industry": "传统行政",
      "role_type": "档案管理 / 资料录入",
      "why_consuming": "这类岗位 80% 时间在重复处理标准化流程,你的 A+S 表达欲会被压抑(1 句,只描述错配)"
    }
  ],
  "refine_chips": ["去掉销售类岗位", "想要更稳定的方向", "加技术深度", "偏内容创作"]
}

positive 正好 5 个,negative 正好 3 个,refine_chips 正好 4-6 个。`;
}

function buildUserPrompt(
  scores: [number, number, number, number, number, number],
  code: string,
  tagKeys: string[],
  pool: Array<{ industry: string; role_type: string }>
): string {
  const [r, i, a, s, e, c] = scores;
  return `用户测评结果:
RIASEC 编码: ${code}
6 维分数(0-10): R${r} I${i} A${a} S${s} E${e} C${c}
选中兴趣 tag: ${tagKeys.length > 0 ? tagKeys.join(", ") : "(无)"}

候选池(${pool.length} 项,只能从这里选):
${pool.map((p, idx) => `${idx + 1}. ${p.industry} / ${p.role_type}`).join("\n")}

请返 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const answers = body.answers as Record<number, string | string[]>;

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { error: "answers required" },
        { status: 400 }
      );
    }

    // Step 1 计分(规则)
    const scores = computeRIASEC(answers);
    const code = formatRIASECCode(scores);
    const confidence = computeConfidence(answers, scores);
    const tagKeys = getSelectedInterests(answers);

    // 答得太少 — 不调 LLM
    if (confidence === "none") {
      return NextResponse.json({
        scores,
        code,
        confidence,
        positive: [],
        negative: [],
        refine_chips: [],
        disclaimer: "答得太少了,再答几道题才能给你靠谱的推荐 ~",
        completedAt: new Date().toISOString(),
      });
    }

    // Step 2 候选池(规则)
    const candidates = generateCandidates(scores, tagKeys, 30);

    // Step 3 LLM 综合(deepseek-chat,jsonMode)
    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: buildUserPrompt(scores, code, tagKeys, candidates),
        },
      ],
      {
        model: "chat",
        temperature: 0.5,
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

    // Normalize:LLM 偶尔字段错位,兜底救回
    const normalizedNegative = (parsed.negative ?? []).map((n) => ({
      industry: n.industry,
      role_type: n.role_type,
      why_consuming:
        n.why_consuming ?? n.why_bad ?? n.why ?? n.reason ?? "",
    }));

    return NextResponse.json({
      scores,
      code,
      confidence,
      positive: parsed.positive ?? [],
      negative: normalizedNegative,
      refine_chips: parsed.refine_chips ?? [],
      disclaimer: DISCLAIMER,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/recommend error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
