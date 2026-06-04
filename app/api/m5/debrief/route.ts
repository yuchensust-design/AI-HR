/**
 * POST /api/m5/debrief — 整场复盘 + highlight(最关键 endpoint)
 *
 * Body: { session: InterviewSession }
 * 返回: { debrief: DebriefResult }
 *
 * deepseek-reasoner (R1) / temp 0.4 / max_tokens 4000 / jsonMode
 * R1 超时 → retry 1 次后回 V3.1 兜底
 *
 * 4 维 anchor 嵌入 PRD §3.6.8(不是 5 维)。highlight 触发:某维 = 5 分。
 *
 * 4 套思辨纪律:
 *   - Skeptical Recruiter:evidence 必须能扛"你怎么知道"反问
 *   - Anti-fabrication:transcript 没说过的数字不能编进 suggestedBullet
 *   - 反 rationalization:不让态度/长度=高分
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { scrubCompanyNames } from "@/lib/scrub-company";
import {
  VALID_DIMS,
  type DebriefDim,
  type DebriefHighlight,
  type DebriefResult,
  type DebriefScore,
  type InterviewSession,
  type TranscriptSummaryItem,
} from "@/lib/interview-types";

const SYSTEM_PROMPT = `你是「Offer 捕手」的面试复盘评分师。整场面试(N 题)→ 给 4 维评分 + 找 highlight + 10 题摘要。

【★ 决策优先级 — PRD §3.6.8 4 维 lock(不是 5 维)★】
本项目 4 维等权,不含"逻辑流畅度"(plan §F.4 anchor 表写过 5 维是文档不一致,以 PRD 为准)。

【4 维 anchor】
- **逻辑性**:5 = STAR 4 要素完整 + 结尾呼应 / 3 = 主题明确 + 1-2 论据 / 1 = 跑题或无论据
- **具体性**:5 = ≥2 数字 + ≥2 动词 + ≥1 真实事例名 / 3 = 1 数字或事例 / 1 = 全程"很多""挺好"
- **应答清晰度**:5 = 句子完整层次分明 / 3 = 偶尔卡顿 / 1 = 多次卡顿反复重启
- **口水话频次**:5 = <10 次/答 / 3 = 10-20 次/答 / 1 = >20 次/答

【硬约束】
1. **永远不输出公司名** — evidence / highlight excerpt 引用 transcript 必须抽象掉公司名(字节/阿里/腾讯/美团/百度/华为/京东/拼多多/网易/小米/Google/Meta/Amazon 等 → "某互联网大厂"/"某科技公司")
2. **STT 误识别允许 ±20% 误差** — 明显错别字不扣分(eg "Claude" 识别成"克劳德" 按 Claude 算)
3. **不显示总分排名** — avg 给出但不说"超过 X% 的人"
4. **evidence 必须引 transcript 原句**(写"Q3 你说过『...』")
5. **跳过题不计分**(skipped 非 null 的题略过维度统计)
6. **空洞夸赞禁止**(no "great", "amazing", "perfect", "good job")

【Highlight 识别规则 — plan §决议 Y 双向闭环】
某维 ≥ 5 分(单题视角)→ 该题进 highlight 候选池:
- 候选池 > 3 → 选 ★ 3 个(优先 specific=5 的,因量化最适合反哺简历)
- 候选池 = 0 → 返 highlights:[] (允许空)

每 highlight 字段:
- question: "Q3 — <原问题前 20 字>..."
- excerpt: transcript 里直接抠的 1-2 句原话(必须真实存在,不能编)
- why: 1-2 句解释"为啥值得加进简历"(强调 transcript 有但简历没的细节)
- suggestedBullet: STAR / X-Y-Z 体的简历句 (eg "AI 学习助手:基于 Claude API 开发,通过 10 个真实 case 对比 GPT-4 验证选型,选 Claude 节省 60% 成本")

【4 套思辨纪律(每 highlight / score 自检)】
- **Skeptical Recruiter**:evidence 必须能扛"你怎么知道"反问 — 不引原话不算证据
- **Anti-fabrication**:用户没说过的数字不能编(transcript 里没"60% 成本" → 不能 suggestedBullet 写"节省 60%")
- **反 rationalization**:不让"用户态度好就 5 分" / "答得长就高"

【输出格式 — 严格 JSON,无 markdown 包裹】
{
  "scores": [
    { "dim": "逻辑性", "score": 4, "evidence": "Q3 你说过『...』,STAR 4 要素完整,但缺 trade-off 解释" },
    { "dim": "具体性", "score": 3, "evidence": "..." },
    { "dim": "应答清晰度", "score": 4, "evidence": "..." },
    { "dim": "口水话频次", "score": 3, "evidence": "..." }
  ],
  "highlights": [
    {
      "question": "Q3 — 讲讲你做过的 AI 学习助手项目...",
      "excerpt": "...",
      "why": "...",
      "suggestedBullet": "..."
    }
  ],
  "transcript_summary": [
    { "no": 1, "q": "...", "summary": "...", "score": 4, "hasHighlight": false }
  ]
}

scores 正好 4 条(按上面顺序),highlights 0-3 条,transcript_summary 跟题目数一致。请返 JSON。`;

function clamp1to5(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 3;
  return Math.max(1, Math.min(5, Math.round(x)));
}

function normalizeScores(raw: unknown): DebriefScore[] {
  const arr = Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: DebriefScore[] = [];
  for (let i = 0; i < VALID_DIMS.length; i++) {
    const dim = VALID_DIMS[i] as DebriefDim;
    const item = arr[i] as Record<string, unknown> | undefined;
    if (!item) {
      out.push({ dim, score: 3, evidence: "本场未触发该维度评分" });
      continue;
    }
    const incomingDim =
      typeof item.dim === "string" &&
      VALID_DIMS.includes(item.dim as DebriefDim)
        ? (item.dim as DebriefDim)
        : dim;
    out.push({
      dim: incomingDim,
      score: clamp1to5(item.score ?? item.rating ?? 3),
      evidence: scrubCompanyNames(
        ((item.evidence as string) ?? (item.reason as string) ?? "").trim()
      ),
    });
  }
  // 顺序按 VALID_DIMS 排
  return VALID_DIMS.map(
    (d) => out.find((s) => s.dim === d) ?? { dim: d, score: 3, evidence: "" }
  );
}

function normalizeHighlights(raw: unknown): DebriefHighlight[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map((h) => ({
      question: scrubCompanyNames(
        ((h.question as string) ??
          (h.from_question as string) ??
          (h.q as string) ??
          "").trim()
      ),
      excerpt: scrubCompanyNames(
        ((h.excerpt as string) ??
          (h.quote as string) ??
          (h.text as string) ??
          "").trim()
      ),
      why: scrubCompanyNames(
        ((h.why as string) ?? (h.reason as string) ?? "").trim()
      ),
      suggestedBullet: scrubCompanyNames(
        ((h.suggestedBullet as string) ??
          (h.suggested_bullet as string) ??
          (h.bullet as string) ??
          "").trim()
      ),
    }))
    .filter((h) => h.excerpt && h.suggestedBullet)
    .slice(0, 3);
}

function normalizeTranscriptSummary(
  raw: unknown
): TranscriptSummaryItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((t, i) => ({
    no: Number(t.no ?? i + 1),
    q: scrubCompanyNames(
      ((t.q as string) ?? (t.question as string) ?? "").trim()
    ),
    summary: scrubCompanyNames(
      ((t.summary as string) ?? (t.brief as string) ?? "").trim()
    ),
    score: clamp1to5(t.score ?? t.rating ?? 3),
    hasHighlight: Boolean(t.hasHighlight ?? t.has_highlight ?? false),
  }));
}

function buildUserPrompt(session: InterviewSession): string {
  const qaPairs = session.questions.map((q, i) => {
    const a = session.answers.find((x) => x.question_id === q.id);
    if (!a) {
      return `[${i + 1}] Q: ${q.text}\n   A: (未答)`;
    }
    if (a.skipped === "dont_know") {
      return `[${i + 1}] Q: ${q.text}\n   A: (用户标"不会答",评分跳过)`;
    }
    if (a.skipped === "know_but_skip") {
      return `[${i + 1}] Q: ${q.text}\n   A: (用户标"会但跳过",评分跳过)`;
    }
    return `[${i + 1}] Q: ${q.text}\n   A: ${a.transcript || "(空)"}\n   填充词数: ${a.filler_word_count ?? 0}`;
  });

  return `面试类型:${session.config.type} / 性格:${session.config.persona} / 题数:${session.config.num_questions}

完整 transcript:
${qaPairs.join("\n\n")}

按规则输出 JSON。请返 JSON。`;
}

async function callDebriefLLM(
  systemPrompt: string,
  userPrompt: string,
  model: "chat" | "reasoner"
): Promise<string> {
  return chat(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    {
      model,
      temperature: 0.4,
      max_tokens: model === "reasoner" ? 4000 : 3000,
      jsonMode: true,
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { session?: InterviewSession };
    const session = body.session;

    if (!session || !session.questions?.length || !session.answers) {
      return NextResponse.json(
        { error: "session 不完整" },
        { status: 400 }
      );
    }

    const userPrompt = buildUserPrompt(session);

    // V3.1 (deepseek-chat) 优先 — 速度 5-10s,demo 可接受
    // R1 (reasoner) 留作 P3 升级:深度更好但 30s+,演示太慢
    const raw = await callDebriefLLM(SYSTEM_PROMPT, userPrompt, "chat");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("/api/m5/debrief JSON parse failed:", raw);
      return NextResponse.json(
        { error: "复盘 LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    const scores = normalizeScores(parsed.scores);
    const validScored = scores.filter((s) => s.score > 0);
    const avg =
      validScored.length > 0
        ? Number(
            (
              validScored.reduce((acc, s) => acc + s.score, 0) /
              validScored.length
            ).toFixed(1)
          )
        : 0;
    const highlights = normalizeHighlights(parsed.highlights);
    const transcript_summary = normalizeTranscriptSummary(
      parsed.transcript_summary
    );

    const debrief: DebriefResult = {
      scores,
      avg,
      highlights,
      transcript_summary,
      finished_at: new Date().toISOString(),
    };

    return NextResponse.json({ debrief });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m5/debrief error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
