/**
 * POST /api/m5/capability — m5 v5 双层评分第二层：岗位能力维度（解耦, G1）
 *
 * Body: { session: InterviewSession }
 * 返回: { capabilityScores: CapabilityScore[], methodology_id: string }
 *
 * 与 debrief 路由**解耦**：debrief 只返 4 维秒出；本路由由客户端在复盘页渲染后
 * 二次懒加载调用，能力雷达后填。失败 → { capabilityScores: [] }，4 维复盘不受影响。
 *
 * 模型用 R1(reasoner)——能力判断需深推理，不在 per-turn 热路径（spec §4）。
 * 方法论由 selectMethodology(config) 确定性再算，无需客户端透传 methodology_id。
 */

import { NextRequest, NextResponse, after } from "next/server";
import { chat } from "@/lib/llm";
import { recordTrace } from "@/lib/m5/trace";
import { scrubCompanyNames } from "@/lib/scrub-company";
import type { CapabilityScore, InterviewSession } from "@/lib/interview-types";
import { selectMethodology } from "@/lib/m5/methodology/registry";
import { buildCapabilityRubric, getCapabilityDimensions } from "@/lib/m5/context";

export const maxDuration = 60;

const EMPTY = (methodologyId = ""): { capabilityScores: CapabilityScore[]; methodology_id: string } => ({
  capabilityScores: [],
  methodology_id: methodologyId,
});

function clamp1to5(n: unknown): number {
  const x = Number(n);
  if (!Number.isFinite(x)) return 3;
  return Math.max(1, Math.min(5, Math.round(x)));
}

function buildTranscript(session: InterviewSession): string {
  return session.questions
    .map((q, i) => {
      const a = session.answers.find((x) => x.question_id === q.id);
      if (!a || a.skipped || !(a.transcript ?? "").trim()) {
        return `[${i + 1}] Q: ${q.text}\n   A: (未作答/跳过)`;
      }
      return `[${i + 1}] Q: ${q.text}\n   A: ${a.transcript}`;
    })
    .join("\n\n");
}

export async function POST(request: NextRequest) {
  let methodologyId = "";
  try {
    const body = (await request.json()) as { session?: InterviewSession };
    const session = body.session;
    if (!session || !session.questions?.length || !session.answers) {
      return NextResponse.json(EMPTY());
    }

    // 至少要有 1 题真实作答，否则能力评分无意义
    const answered = session.answers.some(
      (a) => !a.skipped && (a.transcript ?? "").trim().length > 0,
    );
    if (!answered) return NextResponse.json(EMPTY());

    const methodology = selectMethodology(
      session.config.type,
      session.config.jd_text ?? "",
    );
    methodologyId = methodology.id;
    const dims = getCapabilityDimensions(methodology);
    const rubric = buildCapabilityRubric(methodology);

    const systemPrompt = `你是「Offer 捕手」的面试能力评分师。基于整场 transcript，对候选人在该岗位的**能力维度**打分（1-5），与"表达 4 维"无关，看的是岗位能力强不强。

${rubric}

【硬约束】
1. 永远不输出公司名（evidence 引 transcript 要抽象掉公司名）。
2. evidence 必须引 transcript 里的真实表现（"Q3 你提到…"），不引原话不算。
3. anti-fabrication：候选人没展示的能力按"未充分展示"给中性偏低分，不要编。
4. 反 rationalization：不因态度好/答得长给高分，只看是否体现该维度的"强答案特征"。
5. STT 误识别允许误差，明显错别字按正确词理解。

【输出格式 — 严格 JSON，无 markdown】
{
  "capabilityScores": [
    ${dims.map((d) => `{ "key": "${d.key}", "label": "${d.label}", "score": 1-5, "evidence": "引 transcript 的一句证据" }`).join(",\n    ")}
  ]
}
正好 ${dims.length} 个维度，key 必须用上面给定的。请返 JSON。`;

    const userPrompt = `面试类型:${session.config.type} / 岗位方法论:${methodology.id}

完整 transcript:
${buildTranscript(session)}

按 rubric 对 ${dims.length} 个能力维度打分，返 JSON。`;

    const t0 = Date.now();
    const raw = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { model: "reasoner", temperature: 0.4, max_tokens: 1500, jsonMode: true },
    );
    const llmMs = Date.now() - t0;
    after(() =>
      recordTrace({
        session_id: session.id,
        route: "capability",
        methodology_id: methodology.id,
        model: "reasoner",
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
      return NextResponse.json(EMPTY(methodologyId));
    }

    const rawScores = Array.isArray(parsed.capabilityScores)
      ? (parsed.capabilityScores as Array<Record<string, unknown>>)
      : [];
    const byKey = new Map(rawScores.map((s) => [String(s.key), s]));

    // 以方法论维度为准装配，缺失维度给中性 3 分（保证雷达完整、key 对齐 A3）
    const capabilityScores: CapabilityScore[] = dims.map((d) => {
      const s = byKey.get(d.key);
      return {
        key: d.key,
        label: d.label,
        score: clamp1to5(s?.score ?? 3),
        evidence: scrubCompanyNames(
          (((s?.evidence as string) ?? "") || "").toString().trim(),
        ),
      };
    });

    return NextResponse.json({ capabilityScores, methodology_id: methodology.id });
  } catch (err) {
    console.warn("/api/m5/capability error (silent):", err);
    return NextResponse.json(EMPTY(methodologyId));
  }
}
