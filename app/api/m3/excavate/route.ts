/**
 * POST /api/m3/excavate — Phase 3 隐藏经验挖掘
 *
 * Body:
 *   {
 *     action: "next-question" | "answer" | "finalize",
 *     parsedResume,
 *     jdContext,
 *     history: [{ question, options[], user_answers: [{option_letter, fill_text?}], skipped }],
 *     userAnswer?: { option_letters: string[], fill_text?: string }  // 仅 action=answer
 *   }
 *
 * 流程:
 *   action=next-question → LLM 出 1 道选择题(4 选项 + 1 填空 + "都没有"6 选项),基于 gaps[当前轮] 设计
 *   action=answer        → 用户答完 → LLM 把答案转 STAR,append 到 hidden_experiences
 *   action=finalize      → 收集 hero stories → Skeptical Recruiter R1 提 3 个 weak spot 写 skeptical_flags
 *
 * 退出条件(UI 层判定):
 *   - 连续 3 次"都没有" 或
 *   - 用户点"够了" 或
 *   - hidden_experiences.length >= 5
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

// 缓存 Phase 3 + multiple-choice-design 段
let phase3PromptCache: string | null = null;
let mcDesignCache: string | null = null;

async function loadPhase3Prompt(): Promise<string> {
  if (phase3PromptCache) return phase3PromptCache;
  try {
    const full = await fs.readFile(
      path.join(process.cwd(), "lib/prompts/skill-matching-refs/question-batteries.md"),
      "utf-8"
    );
    const match = full.match(
      /## Phase 3: 信息挖掘增强[\s\S]*?(?=\n## Phase 4:|\n---)/
    );
    phase3PromptCache = match ? match[0] : "";
    return phase3PromptCache;
  } catch {
    return "";
  }
}

async function loadMcDesign(): Promise<string> {
  if (mcDesignCache) return mcDesignCache;
  try {
    mcDesignCache = await fs.readFile(
      path.join(process.cwd(), "lib/prompts/skill-matching-refs/multiple-choice-design.md"),
      "utf-8"
    );
    return mcDesignCache;
  } catch {
    return "";
  }
}

// ============ Question schema ============
type Question = {
  id: string;
  topic_name: string;     // eg "用户研究 / 用户访谈"
  context_intro: string;  // eg "AI PM 岗位常会做用户访谈来验证产品方向。"
  options: { letter: "A" | "B" | "C" | "D"; text: string }[];
  fill_prompt: string;    // eg "其他相关经验(填空)"
  none_label: string;     // eg "都没有"
};

// ============ Build prompts ============

async function buildNextQuestionPrompt(
  parsedResume: unknown,
  jdContext: unknown,
  history: unknown[]
): Promise<{ system: string; user: string }> {
  const phase3 = await loadPhase3Prompt();
  const mcDesign = await loadMcDesign();

  const system = `你是「Offer 捕手」模块 3 简历整理 skill 的 Phase 3 隐藏经验挖掘引擎。

【任务】
基于用户简历 + JD context.gaps,出**下一道选择题**,帮用户回忆"隐藏经验"。

【参考主框架 Phase 3 选择题原则】
${phase3}

【参考 multiple-choice-design.md 5 条原则】
${mcDesign}

【硬约束】
- 一 turn 一问(non-negotiable)
- 沾边都算,不审判
- 4 选项 + 1 填空 + "都没有"第 6 选项
- 选项要紧扣 JD context 的 gaps,但用"沾边"语言降低门槛
  (eg 不是"你做过用户访谈吗?" 而是 "下面哪些跟用户接触的经验你有过?")
- JD : 公司业务 = 80 : 20
- **不重复**前几轮已问过的话题(看 history.topic_name 列表,新的 topic_name 不能跟里面任何一个相似或同义)
- **公司名脱敏**:options 文本里如有公司名,替换"某互联网大厂"

【输出 JSON,无 markdown — 不要输出 id 字段,服务端会注入唯一 id】
{
  "topic_name": "1-3 字主题 eg 用户研究 / Python 编程 / 跨背景沟通",
  "context_intro": "1 句引子,说明这跟 JD 哪条要求挂钩(用'JD 提到的 XX' 不要说公司名)",
  "options": [
    { "letter": "A", "text": "选项 A 文本(沾边语言)" },
    { "letter": "B", "text": "..." },
    { "letter": "C", "text": "..." },
    { "letter": "D", "text": "..." }
  ],
  "fill_prompt": "其他相关经验(填空):",
  "none_label": "都没有"
}`;

  const user = `用户简历:
${JSON.stringify(parsedResume, null, 2)}

JD context(含 gaps):
${JSON.stringify(jdContext, null, 2)}

已问过的轮数(避免重复):
${JSON.stringify(history, null, 2)}

请出下一道选择题。返 JSON。`;

  return { system, user };
}

// ============ Answer → STAR ============

function buildAnswerToStarPrompt(
  question: Question,
  userAnswer: { option_letters: string[]; fill_text?: string },
  parsedResume: unknown,
  jdContext: unknown
): { system: string; user: string } {
  const system = `你是「Offer 捕手」隐藏经验挖掘 - STAR 转换器。

【任务】
用户答了 1 道选择题,选了若干选项 + 可能填了 fill。请你**用 STAR 格式**整理这条隐藏经验,1-2 个 candidate bullet 草稿。

【硬约束】
- Anti-fabrication:**只整理用户答案里有的素材,不编造数字 / 公司**
- 如果用户答"都没有",输出 { "skipped": true } 不写 candidate
- 如果用户只填空没选项,也整理(填空可能是最深的素材)
- candidate bullet 风格:STAR / X-Y-Z,30-60 字,中文
- 公司名脱敏(用户答案里的真实公司名保留;但 candidate bullet 输出里替换"某互联网大厂"如适用)
- 给每条 candidate 打 ⚠️ 如果是"未完成 / 未验证"(eg "正在进行的项目")

【输出 JSON】
{
  "skipped": false,
  "topic_name": "...",
  "raw_user_material": "用户原始答案的提炼(2-3 句)",
  "star_breakdown": { "situation": "...", "task": "...", "action": "...", "result": "..." },
  "candidate_bullets": [
    { "text": "1 句 STAR bullet 草稿", "anti_fab_note": null | "⚠️ ..." }
  ]
}`;

  const user = `刚问的题:
${JSON.stringify(question, null, 2)}

用户答案:
${JSON.stringify(userAnswer, null, 2)}

简历背景:
${JSON.stringify((parsedResume as { basic?: unknown }).basic, null, 2)}

JD must_have(用于评估这条经验价值):
${JSON.stringify((jdContext as { must_have?: unknown }).must_have, null, 2)}

返 JSON。`;

  return { system, user };
}

// ============ Skeptical Recruiter(finalize 时调) ============

function buildSkepticalPrompt(
  hiddenExperiences: unknown,
  jdContext: unknown
): { system: string; user: string } {
  const system = `你是资深 HR / 怀疑型面试官。

【任务】
学生在 Phase 3 挖到了 N 个隐藏经验(STAR 形态)。请你**扮演怀疑面试官**,对每个 hero story 提 2-3 个**最尖锐的追问 / weak spot**。

【目的】
学生面试前看到这些 weak spot,可以提前准备答案 / 决定是否写进简历(避免雷点)。

【纪律】
- 每个 weak spot 要具体到「面试官最可能追问的细节」
- 不空洞("你这条不够好"❌ → "用户访谈 30 人,你怎么联系到的?对照组怎么设的?" ✓)
- 不否定用户("你这是假的"❌ → "面试官会问 ..." 的中立框架)
- 数量:每个 hero story 配 2-3 个 weak spot,不超过 3 个

【输出 JSON】
{
  "skeptical_flags_by_topic": {
    "{topic_name 1}": ["weak spot 1", "weak spot 2"],
    "{topic_name 2}": ["..."],
    ...
  },
  "summary": "1 句总评(温和,不挫败用户)"
}`;

  const user = `挖到的隐藏经验:
${JSON.stringify(hiddenExperiences, null, 2)}

JD must_have(让 weak spot 更聚焦):
${JSON.stringify((jdContext as { must_have?: unknown }).must_have, null, 2)}

返 JSON。`;

  return { system, user };
}

// ============ POST ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string;

    if (action === "next-question") {
      const { parsedResume, jdContext, history } = body;
      if (!parsedResume) {
        return NextResponse.json({ error: "parsedResume required" }, { status: 400 });
      }
      const { system, user } = await buildNextQuestionPrompt(
        parsedResume,
        jdContext ?? {},
        history ?? []
      );
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { model: "chat", temperature: 0.6, max_tokens: 1500, jsonMode: true }
      );
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(raw); }
      catch {
        return NextResponse.json({ error: "LLM JSON parse failed", raw: raw.slice(0, 500) }, { status: 502 });
      }
      // Normalize — 服务端始终生成唯一 id,忽略 LLM 输出避免 "q-1" 冲突(plan offer-1)
      const round = Array.isArray(history) ? history.length + 1 : 1;
      const id = `q-r${round}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const opts = Array.isArray(parsed.options) ? parsed.options : [];
      const options = ["A", "B", "C", "D"].map((letter, i) => {
        const o = (opts[i] ?? {}) as { text?: unknown };
        return { letter: letter as "A" | "B" | "C" | "D", text: String(o.text ?? `选项 ${letter}`) };
      });
      return NextResponse.json({
        id,
        topic_name: String(parsed.topic_name ?? "相关经验"),
        context_intro: String(parsed.context_intro ?? ""),
        options,
        fill_prompt: String(parsed.fill_prompt ?? "其他相关经验(填空):"),
        none_label: String(parsed.none_label ?? "都没有"),
      });
    }

    if (action === "answer") {
      const { question, userAnswer, parsedResume, jdContext } = body;
      if (!question || !userAnswer) {
        return NextResponse.json({ error: "question + userAnswer required" }, { status: 400 });
      }
      // 用户选"都没有" → skip 不调 LLM
      if (userAnswer.option_letters?.includes("NONE") && !userAnswer.fill_text?.trim()) {
        return NextResponse.json({
          skipped: true,
          topic_name: question.topic_name,
          candidate_bullets: [],
        });
      }
      const { system, user } = buildAnswerToStarPrompt(
        question as Question,
        userAnswer as { option_letters: string[]; fill_text?: string },
        parsedResume,
        jdContext ?? {}
      );
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { model: "chat", temperature: 0.4, max_tokens: 1200, jsonMode: true }
      );
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(raw); }
      catch {
        return NextResponse.json({ error: "LLM JSON parse failed", raw: raw.slice(0, 500) }, { status: 502 });
      }
      const bullets = Array.isArray(parsed.candidate_bullets)
        ? parsed.candidate_bullets.map((b: unknown) => {
            const bl = b as { text?: unknown; anti_fab_note?: unknown };
            return {
              text: String(bl.text ?? ""),
              anti_fab_note: bl.anti_fab_note ? String(bl.anti_fab_note) : null,
            };
          }).filter((b: { text: string }) => b.text)
        : [];
      return NextResponse.json({
        skipped: Boolean(parsed.skipped),
        topic_name: String(parsed.topic_name ?? question.topic_name),
        raw_user_material: String(parsed.raw_user_material ?? ""),
        star_breakdown: parsed.star_breakdown ?? null,
        candidate_bullets: bullets,
      });
    }

    if (action === "finalize") {
      const { hiddenExperiences, jdContext } = body;
      if (!Array.isArray(hiddenExperiences) || hiddenExperiences.length === 0) {
        return NextResponse.json({
          skeptical_flags_by_topic: {},
          summary: "暂无可评估的隐藏经验",
        });
      }
      const { system, user } = buildSkepticalPrompt(hiddenExperiences, jdContext ?? {});
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Skeptical Recruiter 用 R1(plan §A.1 + Step 0.5 lock)
        { model: "reasoner", temperature: 0.3, max_tokens: 2000, jsonMode: true }
      );
      let parsed: Record<string, unknown>;
      try { parsed = JSON.parse(raw); }
      catch {
        // R1 时 JSON mode 有时不稳,fallback 返空
        return NextResponse.json({
          skeptical_flags_by_topic: {},
          summary: "怀疑型评估暂时无法生成,可继续到 Phase 5",
          _parse_error: true,
        });
      }
      return NextResponse.json({
        skeptical_flags_by_topic: parsed.skeptical_flags_by_topic ?? {},
        summary: String(parsed.summary ?? ""),
      });
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/excavate error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
