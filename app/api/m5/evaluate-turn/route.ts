/**
 * POST /api/m5/evaluate-turn — 单题评分(fire-and-forget,后台缓存)
 *
 * Body: { question: InterviewQuestion, answer: TurnAnswer }
 * 返回: { evaluation: TurnEvaluation }
 *
 * deepseek-chat (V3.1) / temp 0.3 / max_tokens 400 / jsonMode
 *
 * 这是后台静默调用,不阻塞 UI。失败 → 返 null,debrief 时 LLM 直接从 transcript 重评。
 *
 * 4 维 anchor 嵌入 PRD §3.6.8(不是 5 维 — 文档不一致)。
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { scrubCompanyNames } from "@/lib/scrub-company";
import type {
  DimScores,
  InterviewQuestion,
  TurnAnswer,
  TurnEvaluation,
} from "@/lib/interview-types";

// 线上必须显式声明，否则 Vercel 默认 10s 超时静默退化（本地正常、线上坏）
export const maxDuration = 60;

const SYSTEM_PROMPT = `你是「Offer 捕手」的面试单题评分员。给定一题 + 用户回答 → 输出 4 维(逻辑/具体/清晰/口水话)1-5 分 + 1 句 brief。

【4 维 anchor — PRD §3.6.8(注意是 4 维不是 5 维)】
- **逻辑性(logic)**:5 = STAR 4 要素完整 + 结尾呼应 / 3 = 主题明确 + 1-2 论据 / 1 = 跑题或无论据
- **具体性(specific)**:5 = ≥2 数字 + ≥2 动词 + ≥1 真实事例名 / 3 = 1 数字或事例 / 1 = 全程"很多""挺好"
- **应答清晰度(clarity)**:5 = 句子完整层次分明 / 3 = 偶尔卡顿 / 1 = 多次卡顿反复重启
- **口水话频次(filler)**:5 = <10 次/答 / 3 = 10-20 次/答 / 1 = >20 次/答

【硬约束】
1. 永远不输出公司名(brief 里 echo 用户答的公司名 = 违反,要抽象)
2. STT 误识别允许 ±20% 误差 — 看到明显错别字不扣分(eg "Claude" 识别成"克劳德" 按 Claude 算)
3. 跳过题(skipped="dont_know")4 维全 1,brief = "本题跳过(不会答)"
4. 跳过题(skipped="know_but_skip")4 维 null,brief = "本题主动跳过"
5. **反 rationalization**:不让"用户态度好就高分" / "答案长就高分" — 只看 STAR 完整度 / 数字 / 卡顿,不看辞藻

【输出严格 JSON,无 markdown】
{
  "evaluation": {
    "question_id": "Q1",
    "scores": { "logic": 4, "specific": 3, "clarity": 4, "filler": 3 },
    "brief": "STAR 结构完整但缺一个量化数字"
  }
}

请返 JSON。`;

function clamp1to5(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 3;
  return Math.max(1, Math.min(5, Math.round(x)));
}

function normalizeScores(raw: unknown): DimScores | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    logic: clamp1to5(o.logic ?? o.logical ?? o["逻辑性"] ?? 3),
    specific: clamp1to5(
      o.specific ?? o.specificity ?? o["具体性"] ?? 3
    ),
    clarity: clamp1to5(o.clarity ?? o.clear ?? o["应答清晰度"] ?? 3),
    filler: clamp1to5(o.filler ?? o.fillerWords ?? o["口水话频次"] ?? 3),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      question?: InterviewQuestion;
      answer?: TurnAnswer;
    };
    const q = body.question;
    const a = body.answer;

    if (!q || !a || !q.id || !a.question_id) {
      return NextResponse.json(
        { error: "question/answer 必填" },
        { status: 400 }
      );
    }

    // skipped 短路 — 不调 LLM
    if (a.skipped === "dont_know") {
      const ev: TurnEvaluation = {
        question_id: q.id,
        scores: { logic: 1, specific: 1, clarity: 1, filler: 1 },
        brief: "本题跳过(不会答)",
      };
      return NextResponse.json({ evaluation: ev });
    }
    if (a.skipped === "know_but_skip") {
      const ev: TurnEvaluation = {
        question_id: q.id,
        scores: null,
        brief: "本题主动跳过(已掌握)",
      };
      return NextResponse.json({ evaluation: ev });
    }

    const userPrompt = `面试题:${q.text}
考察点:${q.intent}
用户回答 transcript(可能含 STT 误识别):
${a.transcript || "(空)"}

填充词数(客户端统计 嗯/呃/那个/这样/就是/然后):${a.filler_word_count ?? 0}

按规则输出 JSON。请返 JSON。`;

    const raw = await chat(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat",
        temperature: 0.3,
        max_tokens: 400,
        jsonMode: true,
      }
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { evaluation: null, raw_parse_failed: true },
        { status: 200 } // fire-and-forget 不抛 5xx
      );
    }

    const evRaw =
      (parsed.evaluation as Record<string, unknown>) ?? parsed;
    const scores = normalizeScores(evRaw.scores);
    const brief = scrubCompanyNames(
      ((evRaw.brief as string) ?? (evRaw.summary as string) ?? "").trim()
    );

    const evaluation: TurnEvaluation = {
      question_id: q.id,
      scores,
      brief,
    };

    return NextResponse.json({ evaluation });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m5/evaluate-turn error:", err);
    return NextResponse.json(
      { evaluation: null, error: message },
      { status: 200 } // 不阻塞前端
    );
  }
}
