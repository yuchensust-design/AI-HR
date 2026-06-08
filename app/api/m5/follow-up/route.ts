/**
 * POST /api/m5/follow-up — m5 v5 动态追问（门 + 生成 二合一）
 *
 * Body: {
 *   main_question: InterviewQuestion,  // 含 whatItTests / digHint
 *   answer_transcript: string,
 *   filler_count?: number,
 *   methodology_id?: string,
 *   persona: PersonaKey,
 *   follow_ups_used?: number,
 *   follow_up_budget?: number,
 *   asked_texts?: string[],            // 本场已问题面（含主题+已生成追问），用于判重
 * }
 * 返回: { follow_up: InterviewQuestion | null, reason: string }
 *
 * 模型钉死 V3.1(chat)，禁用 R1 —— 语音热路径，客户端 10-12s abort（F2/B3）。
 * 任何失败 → { follow_up: null }（status 200，优雅降级，客户端进下一题）。
 * 客户端超时 abort 后的迟到响应由 live 页幂等守卫处理（spec §5 B1）。
 */

import { NextRequest, NextResponse, after } from "next/server";
import { chat } from "@/lib/llm";
import { recordTrace } from "@/lib/m5/trace";
import { scrubCompanyNames } from "@/lib/scrub-company";
import { PERSONA_SPECS } from "@/lib/interviewer-personas";
import type { InterviewQuestion, PersonaKey } from "@/lib/interview-types";
import { METHODOLOGY_BY_ID } from "@/lib/m5/methodology/specs";
import { buildFollowUpContext } from "@/lib/m5/context";
import { verifyFollowUp } from "@/lib/m5/verify";
import type { FollowUpDecision } from "@/lib/m5/follow-up";

// 线上必须显式声明，否则 Vercel 默认 10s 超时静默退化
export const maxDuration = 60;

const NO_FOLLOW_UP = (reason: string): FollowUpDecision => ({
  follow_up: null,
  reason,
});

function genId(): string {
  const ts = Date.now().toString(36);
  const rand = Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join("");
  return `fu_${ts}_${rand}`;
}

function buildSystemPrompt(
  persona: PersonaKey,
  methodologyId: string | undefined,
): string {
  const personaSpec = PERSONA_SPECS[persona] ?? PERSONA_SPECS.gentle;
  const methodology = methodologyId
    ? METHODOLOGY_BY_ID[methodologyId]
    : undefined;
  const methodologyBlock = methodology
    ? buildFollowUpContext(methodology)
    : "";

  return `你是「Offer 捕手」的 AI 面试官，正在一场模拟面试中。刚才候选人回答了一道题，你要决定：**是否就这道题追问一个更深的问题**。

【你的性格：${personaSpec.display_name}】
追问深度：${personaSpec.follow_up_depth}
风格：${personaSpec.style_rules.split("\n")[0]}
${methodologyBlock ? `\n${methodologyBlock}\n` : ""}
【决策规则】
- 回答含糊 / 缺数字 / 命中红旗信号 / 没答到预设挖掘点 → 追问 1 个（按追问树选最该挖的 1 个方向）。
- 回答已经具体、完整、有数字、讲清了取舍 → 不追问。
- 只追 1 个，问最关键的那点。追问要短、口语化（像真人面试官说话，准备给 TTS 念），≤ 40 字。

【硬约束】
1. 永远不输出公司名（大厂名抽象成"某互联网大厂/某科技公司"）。
2. 追问 ≠ 羞辱：追细节是为让候选人讲清价值，不出现"你是不是不会"等贬低措辞。
3. 不空洞夸赞：${personaSpec.forbidden_phrases.join(" / ")} 等不许出现。
4. 追问必须和母题 + 候选人这次的回答相关，不能换个话题另起炉灶。
5. Anti-fabrication：不要假设候选人没说过的数字/事实。

【输出格式 — 严格 JSON，无 markdown】
{
  "should_follow_up": true | false,
  "follow_up": "追问题面（should_follow_up=false 时给空串）",
  "reason": "1 句话：为什么追问/为什么不追（评分视角）"
}
请返 JSON。`;
}

function buildUserPrompt(
  mainQuestion: InterviewQuestion,
  transcript: string,
  fillerCount: number,
): string {
  return `【母题】${mainQuestion.text}
【母题考察点】${mainQuestion.whatItTests || mainQuestion.intent || "(未标注)"}
【预设挖掘点 digHint】${mainQuestion.digHint || "(无)"}

【候选人回答 transcript（可能含 STT 误识别，明显错别字按正确词理解，不据此追问）】
${transcript || "(空)"}
【口水话词数】${fillerCount}

按规则判断是否追问，返 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      main_question?: InterviewQuestion;
      answer_transcript?: string;
      filler_count?: number;
      methodology_id?: string;
      persona?: PersonaKey;
      follow_ups_used?: number;
      follow_up_budget?: number;
      asked_texts?: string[];
      session_id?: string;
    };

    const mainQuestion = body.main_question;
    const transcript = (body.answer_transcript ?? "").toString();
    const persona = (body.persona ?? "gentle") as PersonaKey;
    const fillerCount = Number(body.filler_count ?? 0);
    const followUpsUsed = Number(body.follow_ups_used ?? 0);
    const budget = Number(body.follow_up_budget ?? 0);
    const askedTexts = Array.isArray(body.asked_texts)
      ? body.asked_texts.filter((t): t is string => typeof t === "string")
      : [];

    // 基本校验：缺母题 / 空回答 → 不追问
    if (!mainQuestion || !mainQuestion.id || !mainQuestion.text) {
      return NextResponse.json(NO_FOLLOW_UP("missing_main_question"));
    }
    if (transcript.trim().length < 2) {
      return NextResponse.json(NO_FOLLOW_UP("empty_answer"));
    }
    // 服务端预算兜底（客户端也会判，防御性双保险）
    if (budget > 0 && followUpsUsed >= budget) {
      return NextResponse.json(NO_FOLLOW_UP("budget_exhausted"));
    }
    // 不对追问再追问（每主题≤1, C5）
    if (mainQuestion.source === "follow_up") {
      return NextResponse.json(NO_FOLLOW_UP("parent_is_follow_up"));
    }

    const systemPrompt = buildSystemPrompt(persona, body.methodology_id);
    const userPrompt = buildUserPrompt(mainQuestion, transcript, fillerCount);

    const t0 = Date.now();
    const raw = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat", // 钉死 V3.1，禁用 R1（语音热路径）
        temperature: 0.6,
        max_tokens: 300,
        jsonMode: true,
      },
    );
    const llmMs = Date.now() - t0;
    after(() =>
      recordTrace({
        session_id: body.session_id,
        route: "follow-up",
        methodology_id: body.methodology_id,
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
      return NextResponse.json(NO_FOLLOW_UP("parse_failed"));
    }

    const shouldFollowUp = parsed.should_follow_up === true;
    const candidateRaw =
      (parsed.follow_up as string) ??
      (parsed.followUp as string) ??
      (parsed.question as string) ??
      "";
    const reason = scrubCompanyNames(
      ((parsed.reason as string) ?? "").toString().trim(),
    );

    if (!shouldFollowUp) {
      return NextResponse.json(NO_FOLLOW_UP(reason || "no_follow_up_needed"));
    }

    const candidate = scrubCompanyNames((candidateRaw || "").toString().trim());
    // 纯函数校验门：空/超长/重复 → 丢弃，进下一题
    const verdict = verifyFollowUp(candidate, askedTexts);
    if (!verdict.ok) {
      return NextResponse.json(NO_FOLLOW_UP(`verify_${verdict.reason}`));
    }

    const followUpQuestion: InterviewQuestion = {
      id: genId(),
      text: candidate,
      intent: reason || "动态追问：深挖上一题",
      ideal_hints: [],
      category: mainQuestion.category,
      interviewerStyle: mainQuestion.interviewerStyle,
      sceneType: mainQuestion.sceneType,
      followUpReason: reason || "动态追问",
      whatItTests: mainQuestion.whatItTests,
      source: "follow_up",
      parent_id: mainQuestion.id,
    };

    return NextResponse.json({
      follow_up: followUpQuestion,
      reason: reason || "ok",
    } satisfies FollowUpDecision);
  } catch (err) {
    // 任何异常 → 不阻塞面试，进下一题
    console.warn("/api/m5/follow-up error (silent):", err);
    return NextResponse.json(NO_FOLLOW_UP("error"));
  }
}
