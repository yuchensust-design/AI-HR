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

import { NextRequest, NextResponse, after } from "next/server";
import { chat } from "@/lib/llm";
import { recordTrace } from "@/lib/m5/trace";
import { scrubCompanyNames } from "@/lib/scrub-company";
import {
  VALID_DIMS,
  type DebriefDim,
  type DebriefHighlight,
  type DebriefResult,
  type DebriefScore,
  type DimEvidence,
  type InterviewSession,
  type TranscriptSummaryItem,
} from "@/lib/interview-types";

// 线上必须显式声明，否则 Vercel 默认 10s 超时静默退化（本地正常、线上坏）
export const maxDuration = 60;

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
5. **跳过题不计分**(skipped 非 null 或 transcript 为空的题略过 logic/specific/clarity/filler 任一维度的统计;**不能用 0 或 1 分填充**,否则会拉低平均分误伤用户)
6. **空洞夸赞禁止**(no "great", "amazing", "perfect", "good job")
7. **不羞辱候选人**:即便严厉风格,evidence / nextPractice 措辞为"下次试试..."而非"你太差"
8. **单场练习免责**:summary 末尾用 1 句承认"本评估基于单场练习 transcript,不预测真实录用,建议看趋势不看单次绝对分"
9. **N/A 短路**:如果传给你的 transcript 里 N 题全部标 (用户标"不会答" / "会但跳过" / 未答) → 你必须返 evaluable:false + scores:[] + summary 含"本次未完成任何回答,无法评估" + highlights:[] + transcript_summary 照常出但 score=0,**不要为没答的内容编造评分**

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

【★ 顶端校准 — 5 分要克制(避免人人满分)★】
- 5 分代表"整场该维度几乎无瑕疵";只要全场**有任何一道**回答在该维度明显偏弱(eg 含糊、缺数字、回避、跑题、未讲个人贡献),该维度**最高给 4 分**,并在 evidence 里点出是哪道拖了后腿。
- 不要因为大部分答得好就把一两道弱答案抹平成满分 — 区分度比好看更重要。
- 一场里若各维度都接近满分,优先用 4 分而非 5 分,把 5 分留给真正无可挑剔的表现。

【输出格式 — 严格 JSON,无 markdown 包裹】
{
  "evaluable": true,
  "scores": [
    { "dim": "逻辑性", "score": 4, "evidence": "Q3 你说过『...』,STAR 4 要素完整,但缺 trade-off 解释", "improvement_example": null },
    { "dim": "具体性", "score": 3, "evidence": "...", "improvement_example": null },
    { "dim": "应答清晰度", "score": 4, "evidence": "...", "improvement_example": null },
    { "dim": "口水话频次", "score": 3, "evidence": "...", "improvement_example": null }
  ],
  // ★ (plan offer-1-sparkling-hippo P1)improvement_example 规则:
  //   - score ≥ 3 → improvement_example = null
  //   - score ≤ 2 → improvement_example = 一段示范回答(120-200 字),展示"如果重新答,可以这样组织"
  //     · 必须基于用户 transcript 里真实出现过的内容做改写,不编造经历
  //     · 写得自然,不要写"如下..."这种生硬开头,直接给一段完整的口语化改进示范
  "evidence": {
    "logic": "(同 scores[0].evidence,1 句话不重复总分维度信息)",
    "specific": "...",
    "clarity": "...",
    "filler": "..."
  },
  "missedSignals": [
    "JD 在意 X 能力但 transcript 没出现",
    "..."
  ],
  "highlights": [
    {
      "question": "Q3 — 讲讲你做过的 AI 学习助手项目...",
      "excerpt": "...",
      "why": "...",
      "suggestedBullet": "..."
    }
  ],
  "resumeBackfillCandidates": [
    "(与 highlights 等价,字段名按审计 §3.5 要求 — 至少其中 1 个必填,另一个写空数组也行)"
  ],
  "transcript_summary": [
    { "no": 1, "q": "...", "summary": "...", "score": 4, "hasHighlight": false }
  ],
  "nextPractice": "1 句话:下次重点改 1-2 条 + 推荐再练一场什么类型/性格",
  "summary": "1-2 句整体观感(N/A 场景写「本次未完成任何回答,无法评估」)+ 单场练习免责语"
}

N/A 短路时(全部题跳过)输出:
{
  "evaluable": false,
  "scores": [],
  "evidence": null,
  "missedSignals": [],
  "highlights": [],
  "resumeBackfillCandidates": [],
  "transcript_summary": [/* 仍按题目顺序列出,score 全 0,summary 写「未作答」 */],
  "nextPractice": "建议重新开始一场,认真答完至少 3 题再看复盘",
  "summary": "本次未完成任何回答,无法评估。模拟面试仅供练习参考,不预测真实录用。"
}

scores 正好 4 条(按上面顺序),highlights / resumeBackfillCandidates 0-3 条,transcript_summary 跟题目数一致。请返 JSON。`;

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
    const finalScore = clamp1to5(item.score ?? item.rating ?? 3);
    const rawImprov =
      typeof item.improvement_example === "string"
        ? scrubCompanyNames(item.improvement_example.trim())
        : null;
    out.push({
      dim: incomingDim,
      score: finalScore,
      evidence: scrubCompanyNames(
        ((item.evidence as string) ?? (item.reason as string) ?? "").trim()
      ),
      // 仅 score ≤ 2 时保留示范回答;score ≥ 3 时强制 null(避免 LLM 漏掉规则)
      improvement_example: finalScore <= 2 ? rawImprov || null : null,
    });
  }
  // 顺序按 VALID_DIMS 排
  return VALID_DIMS.map(
    (d) =>
      out.find((s) => s.dim === d) ?? {
        dim: d,
        score: 3,
        evidence: "",
        improvement_example: null,
      },
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

function normalizeEvidence(raw: unknown): DimEvidence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: DimEvidence = {
    logic: scrubCompanyNames(
      ((o.logic as string) ?? (o["逻辑性"] as string) ?? "").toString().trim()
    ),
    specific: scrubCompanyNames(
      ((o.specific as string) ?? (o["具体性"] as string) ?? "")
        .toString()
        .trim()
    ),
    clarity: scrubCompanyNames(
      ((o.clarity as string) ?? (o["应答清晰度"] as string) ?? "")
        .toString()
        .trim()
    ),
    filler: scrubCompanyNames(
      ((o.filler as string) ?? (o["口水话频次"] as string) ?? "")
        .toString()
        .trim()
    ),
  };
  if (!out.logic && !out.specific && !out.clarity && !out.filler)
    return undefined;
  return out;
}

function normalizeStringArray(raw: unknown, max = 5): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => scrubCompanyNames(s.trim()))
    .slice(0, max);
}

/**
 * 跳过/未答题在 transcript_summary 里的 score 必须为 0,UI 渲染成 N/A 而不是 1/5。
 * server 二次过滤防 LLM 用 1 分填充(违反 prompt 5 号约束)。
 */
function normalizeTranscriptSummary(
  raw: unknown,
  answeredFlags: boolean[]
): TranscriptSummaryItem[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>).map((t, i) => {
    const isAnswered = answeredFlags[i] ?? false;
    const rawScore = isAnswered
      ? clamp1to5(t.score ?? t.rating ?? 3)
      : 0; // skipped / unanswered → 0 = N/A
    return {
      no: Number(t.no ?? i + 1),
      q: scrubCompanyNames(
        ((t.q as string) ?? (t.question as string) ?? "").trim()
      ),
      summary: scrubCompanyNames(
        ((t.summary as string) ?? (t.brief as string) ?? "").trim()
      ),
      score: rawScore,
      hasHighlight: isAnswered
        ? Boolean(t.hasHighlight ?? t.has_highlight ?? false)
        : false,
    };
  });
}

function buildUserPrompt(
  session: InterviewSession,
  answeredCount: number,
  totalCount: number,
): string {
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

本场 ${totalCount} 题中**已作答 ${answeredCount} 题**。只要 answeredCount ≥ 1,就**必须**基于已作答的题给出 evaluable=true 的真实评分(逻辑/具体/清晰/口水话四维),N/A 短路(evaluable=false + "本次未完成任何回答")**仅当 answeredCount=0(全部未答)时才用**。用户答了几题就提前结束,是正常的,不要因为还有题没答就判全场未完成。未作答/跳过的题在 transcript_summary 里 score=0、不参与维度平均即可。

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
      // v5：动态追问后题数可显著增多(本测 5→8)，复盘输出(每题 transcript_summary
      // + 4 维 evidence + highlights)随之变长。3000 易截断→JSON 解析失败→整页 502。
      // 提到 6000/8000(deepseek 上限 8192)给足余量。
      max_tokens: model === "reasoner" ? 8000 : 6000,
      jsonMode: true,
    }
  );
}

/**
 * 一题是否参与维度评分:有 transcript 且未被跳过。
 * server 二次过滤,避免 LLM 漏 N/A 处理时仍给 4 维评分误伤用户。
 */
function isAnsweredTurn(session: InterviewSession): boolean[] {
  return session.questions.map((q) => {
    const a = session.answers.find((x) => x.question_id === q.id);
    if (!a) return false;
    if (a.skipped === "dont_know" || a.skipped === "know_but_skip")
      return false;
    return (a.transcript ?? "").trim().length > 0;
  });
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

    const answeredFlags = isAnsweredTurn(session);
    const answeredCount = answeredFlags.filter(Boolean).length;
    const totalCount = session.questions.length;

    // 全部未答 → 短路,不调 LLM(节约 quota,且 LLM 即便照规则做也可能出错)
    if (answeredCount === 0) {
      const empty_transcript_summary: TranscriptSummaryItem[] =
        session.questions.map((q, i) => ({
          no: i + 1,
          q: scrubCompanyNames(q.text),
          summary: "未作答",
          score: 0,
          hasHighlight: false,
        }));
      const debrief: DebriefResult = {
        evaluable: false,
        scores: [],
        answeredCount: 0,
        totalCount,
        avg: 0,
        highlights: [],
        resumeBackfillCandidates: [],
        transcript_summary: empty_transcript_summary,
        nextPractice:
          "建议重新开始一场,认真答完至少 3 题后再看复盘 — 这样我才能给你有意义的评分。",
        summary:
          "本次未完成任何回答,无法评估。模拟面试仅供练习参考,不预测真实录用。",
        finished_at: new Date().toISOString(),
      };
      return NextResponse.json({ debrief });
    }

    const userPrompt = buildUserPrompt(session, answeredCount, totalCount);

    // V3.1 (deepseek-chat) 优先 — 速度 5-10s,demo 可接受
    // R1 (reasoner) 留作 P3 升级:深度更好但 30s+,演示太慢
    const t0 = Date.now();
    const raw = await callDebriefLLM(SYSTEM_PROMPT, userPrompt, "chat");
    const llmMs = Date.now() - t0;
    // v5-O1 可观测性：fire-and-forget 记 trace
    after(() =>
      recordTrace({
        session_id: session.id,
        route: "debrief",
        methodology_id: session.config?.target_role,
        model: "chat",
        input_snapshot: userPrompt,
        output_snapshot: raw,
        latency_ms: llmMs,
        ok: true,
      }),
    );

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

    // evaluable 由确定性 answeredCount 决定,不让 LLM 因"部分题未答"误判全场未完成
    // (评委常答几题就提前结束看复盘 → 之前会丢已答内容显示"无评估")。
    const evaluable = answeredCount > 0;
    const scores = evaluable ? normalizeScores(parsed.scores) : [];
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
    const highlights = normalizeHighlights(
      parsed.highlights ?? parsed.resumeBackfillCandidates
    );
    const transcript_summary = normalizeTranscriptSummary(
      parsed.transcript_summary,
      answeredFlags
    );
    const evidence = normalizeEvidence(parsed.evidence);
    const missedSignals = normalizeStringArray(parsed.missedSignals, 5);
    const nextPractice = scrubCompanyNames(
      ((parsed.nextPractice as string) ??
        (parsed.next_practice as string) ??
        "").trim()
    );
    const summary = scrubCompanyNames(
      ((parsed.summary as string) ?? (parsed.overall as string) ?? "").trim()
    );

    const debrief: DebriefResult = {
      evaluable,
      scores,
      answeredCount,
      totalCount,
      avg,
      highlights,
      resumeBackfillCandidates: highlights,
      evidence,
      missedSignals: missedSignals.length > 0 ? missedSignals : undefined,
      nextPractice: nextPractice || undefined,
      summary: summary || undefined,
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
