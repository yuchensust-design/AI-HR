/**
 * POST /api/m5/prep-questions — 模块 5 一次性生成题库
 *
 * Body: { resume_text, jd_text, type, persona, num_questions }
 * 返回: { questions: InterviewQuestion[], session_id }
 *
 * deepseek-chat (V3.1) + jsonMode + temperature 0.8
 * 公司名 scrub server-side 兜底 + LLM 字段错位 normalize
 *
 * 思辨纪律内化:
 *   - Anti-fabrication:简历没的不能编
 *   - Skeptical Recruiter:tech 类型至少 1 压力题
 *   - 反 rationalization:每性格的 forbidden_phrases 不许出现
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { scrubCompanyNames } from "@/lib/scrub-company";
import { buildPersonaBlock, PERSONA_SPECS } from "@/lib/interviewer-personas";
import { buildTypeBlock, TYPE_SPECS } from "@/lib/interview-type-prompts";
import {
  VALID_CATEGORIES,
  type InterviewerStyle,
  type InterviewQuestion,
  type InterviewType,
  type PersonaKey,
  type QuestionCategory,
  type SceneType,
} from "@/lib/interview-types";

// 线上必须显式声明，否则 Vercel 默认 10s 超时静默退化（本地正常、线上坏）
export const maxDuration = 60;

const SCENE_BY_TYPE: Record<InterviewType, SceneType> = {
  semi: "semi_structured",
  bq: "behavioral",
  tech: "technical",
};

const STYLE_BY_PERSONA: Record<PersonaKey, InterviewerStyle> = {
  gentle: "warm",
  strict: "tough",
  rigor: "rigor",
};

const VALID_TYPES: readonly InterviewType[] = ["semi", "bq", "tech"] as const;
const VALID_PERSONAS: readonly PersonaKey[] = [
  "gentle",
  "strict",
  "rigor",
] as const;
const VALID_COUNTS: readonly number[] = [5, 10, 15] as const;

function buildSkepticalLine(persona: PersonaKey): string {
  if (persona === "strict") {
    return "本场严厉性格,至少 2 题压力题(追细节 / 反问数字)";
  }
  if (persona === "rigor") {
    return "本场严谨技术性格,至少 1 题压力题(trade-off / benchmark 反问)";
  }
  return "本场亲切性格,1 题压力题足够(温和反问「你能举个例子吗」)";
}

function buildSystemPrompt(
  type: InterviewType,
  persona: PersonaKey,
  numQuestions: number
): string {
  const personaBlock = buildPersonaBlock(persona);
  const typeBlock = buildTypeBlock(type);
  const personaSpec = PERSONA_SPECS[persona];
  const typeSpec = TYPE_SPECS[type];

  return `你是「Offer 捕手」的 AI 面试出题助手。本次任务:为学生用户生成一场模拟面试的全部题目(共 ${numQuestions} 题)。

【★ 决策优先级 ★】
- 性格 + 类型 = 出题风格(语气 / 追问深度 / 类别配比)
- 简历 + JD = 出题素材(具体追问点 / 技术栈)
- 两者结合后输出严格 JSON 题库

${typeBlock}

${personaBlock}

【硬约束 — 永远不许违反】
1. **永远不输出公司名**:简历 / JD 含"字节跳动 / 阿里 / 腾讯 / 美团 / 百度 / 华为 / 京东 / 拼多多 / 网易 / 小米 / Google / Microsoft / Meta / Amazon / Apple"等大厂 → 题目里抽象到"某互联网大厂 / 某科技公司 / 某高校实验室"。直接 echo 公司名 = 违反。
2. **一题一字段**:text 字段是 1 个问题,不能塞 2 个问题用"以及""还有""另外"串
3. **intent 必须挂钩 4 维评分某一项**(逻辑性 / 具体性 / 应答清晰度 / 口水话频次),示例:"考察 STAR 完整 + 数字"
4. **题目数量精确 = ${numQuestions}**,不多不少
5. **ideal_hints ≤ 4 条**,每条 ≤ 25 字,STAR / 数字 / own 决策 / 反思 4 个维度提醒,**不给直接答案**
6. **空洞夸赞禁止**:${personaSpec.forbidden_phrases.join(" / ")} 等不许出现在 text / intent / ideal_hints 里
7. **category 严格 enum**:warmup / behavioral / project / technical / stress / closing 之一
8. **追问 ≠ 羞辱**:即便 strict / rigor 性格,追细节是为让候选人讲清价值,题目不许出现"你是不是不会"/"你确定你做过吗"等贬低式措辞

【4 套思辨纪律(内化到出题里)】
- **Anti-fabrication**:简历里没的细节(eg DAU / 数字 / 公司名)不要假设。问「你能讲讲项目的指标吗」而不是「你做的 DAU 提升了多少%?」
- **Skeptical Recruiter**:${buildSkepticalLine(persona)}
- **Gap → Project**:能力缺口在题目里暴露(但不指责),让用户自己回答时意识到
- **反 rationalization**:不让"放水让用户开心"得逞,出题保持挑战性

【题目分布要求 — ${typeSpec.display_name} × ${personaSpec.display_name} = ${numQuestions} 题】
${typeSpec.category_mix.replace(/N/g, String(numQuestions))}

【输出格式 — 严格 JSON,无 markdown 代码块包裹】
{
  "questions": [
    {
      "id": "Q1",
      "text": "完整问题(中文,15-50 字,口语化 — 像真人面试官说话,准备给 TTS 念)",
      "intent": "本题考察什么(1 句,挂钩 4 维某项)",
      "ideal_hints": ["→ STAR 结构提示", "→ 数字提示", "→ own 决策提示", "→ 反思提示"],
      "category": "warmup | behavioral | project | technical | stress | closing",
      "interviewerStyle": "warm | tough | rigor",
      "sceneType": "semi_structured | behavioral | technical",
      "followUpReason": "opener / 追问 X 段经历的具体动作 / 压力测试候选人 trade-off 意识 …(1 句话,首问统一写 opener)",
      "whatItTests": "本题考察候选人的什么具体能力(1 句,挂钩岗位能力链,比 intent 更细)"
    }
  ]
}

【新增字段填法】
- interviewerStyle 一定填 "${STYLE_BY_PERSONA[persona]}"(由 persona 反推),不要乱给
- sceneType 一定填 "${SCENE_BY_TYPE[type]}"(由 type 反推),不要乱给
- followUpReason 必填,体现追问设计意图。首问(category=warmup 或 closing 的第 1 题)写 "opener"
- whatItTests 跟 intent 配合,whatItTests 写"考察候选人的什么能力"(候选人视角),intent 写"4 维评分挂钩点"(评分视角)

正好 ${numQuestions} 题。请返 JSON。`;
}

function buildUserPrompt(resumeText: string, jdText: string): string {
  const trimmedResume = resumeText.slice(0, 3500);
  const trimmedJd = jdText.slice(0, 2000);
  return `用户简历(已 trim 到 ≤ 3500 字符):
${trimmedResume}

目标岗位 JD(已 trim 到 ≤ 2000 字符):
${trimmedJd}

按上面规则输出题库 JSON。请返 JSON。`;
}

function normalizeCategory(raw: unknown): QuestionCategory {
  if (typeof raw === "string" && VALID_CATEGORIES.includes(raw as QuestionCategory)) {
    return raw as QuestionCategory;
  }
  return "behavioral";
}

function normalizeStyle(
  raw: unknown,
  fallback: InterviewerStyle
): InterviewerStyle {
  if (raw === "warm" || raw === "tough" || raw === "rigor") return raw;
  return fallback;
}

function normalizeScene(raw: unknown, fallback: SceneType): SceneType {
  if (
    raw === "semi_structured" ||
    raw === "behavioral" ||
    raw === "technical"
  ) {
    return raw;
  }
  return fallback;
}

function normalizeQuestion(
  q: Record<string, unknown>,
  idx: number,
  defaults: { style: InterviewerStyle; scene: SceneType }
): InterviewQuestion | null {
  const text =
    (q.text as string) ??
    (q.question as string) ??
    (q.q as string) ??
    (q.content as string) ??
    "";
  if (typeof text !== "string" || text.trim().length < 3) return null;
  const intent =
    (q.intent as string) ??
    (q.examine as string) ??
    (q.focus as string) ??
    (q.purpose as string) ??
    "";
  const hintsRaw =
    (q.ideal_hints as unknown) ??
    (q.hints as unknown) ??
    (q.tips as unknown) ??
    [];
  const ideal_hints = Array.isArray(hintsRaw)
    ? (hintsRaw as unknown[])
        .filter((h): h is string => typeof h === "string")
        .slice(0, 4)
    : [];
  const followUpReasonRaw =
    (q.followUpReason as string) ??
    (q.follow_up_reason as string) ??
    (q.followup as string) ??
    "";
  const whatItTestsRaw =
    (q.whatItTests as string) ??
    (q.what_it_tests as string) ??
    (q.tests as string) ??
    "";
  return {
    id: (q.id as string) ?? `Q${idx + 1}`,
    text: scrubCompanyNames(text.trim()),
    intent: scrubCompanyNames(intent.trim()),
    ideal_hints: ideal_hints.map((h) => scrubCompanyNames(h)),
    category: normalizeCategory(q.category ?? q.type),
    interviewerStyle: normalizeStyle(
      q.interviewerStyle ?? q.style,
      defaults.style
    ),
    sceneType: normalizeScene(q.sceneType ?? q.scene, defaults.scene),
    followUpReason: scrubCompanyNames(
      (followUpReasonRaw || (idx === 0 ? "opener" : "未标注")).trim()
    ),
    whatItTests: scrubCompanyNames(
      (whatItTestsRaw || intent || "未标注").trim()
    ),
  };
}

function generateSessionId(): string {
  const ts = Date.now().toString(36);
  const rand = Array.from({ length: 5 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join("");
  return `m5_${ts}_${rand}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      resume_text?: string;
      jd_text?: string;
      type?: string;
      persona?: string;
      num_questions?: number;
    };

    const resume_text = (body.resume_text ?? "").toString().trim();
    const jd_text = (body.jd_text ?? "").toString().trim();
    const typeRaw = (body.type ?? "") as InterviewType;
    const personaRaw = (body.persona ?? "") as PersonaKey;
    const num_questions = Number(body.num_questions);

    if (resume_text.length < 20) {
      return NextResponse.json(
        { error: "简历内容太短(≥ 20 字)" },
        { status: 400 }
      );
    }
    if (jd_text.length < 20) {
      return NextResponse.json(
        { error: "JD 内容太短(≥ 20 字)" },
        { status: 400 }
      );
    }
    if (!VALID_TYPES.includes(typeRaw)) {
      return NextResponse.json(
        { error: `type 必须是 ${VALID_TYPES.join("/")} 之一` },
        { status: 400 }
      );
    }
    if (!VALID_PERSONAS.includes(personaRaw)) {
      return NextResponse.json(
        { error: `persona 必须是 ${VALID_PERSONAS.join("/")} 之一` },
        { status: 400 }
      );
    }
    if (!VALID_COUNTS.includes(num_questions)) {
      return NextResponse.json(
        { error: `num_questions 必须是 ${VALID_COUNTS.join("/")} 之一` },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(
      typeRaw,
      personaRaw,
      num_questions
    );
    const userPrompt = buildUserPrompt(resume_text, jd_text);

    const raw = await chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat",
        temperature: 0.8,
        max_tokens: 2500,
        jsonMode: true,
      }
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("/api/m5/prep-questions JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    const rawList =
      (parsed.questions as unknown) ??
      (parsed.list as unknown) ??
      (parsed.items as unknown) ??
      [];
    if (!Array.isArray(rawList)) {
      return NextResponse.json(
        { error: "LLM 没返回 questions 数组" },
        { status: 502 }
      );
    }

    const defaults = {
      style: STYLE_BY_PERSONA[personaRaw],
      scene: SCENE_BY_TYPE[typeRaw],
    };
    const questions = (rawList as Array<Record<string, unknown>>)
      .map((q, i) => normalizeQuestion(q, i, defaults))
      .filter((q): q is InterviewQuestion => q !== null)
      .slice(0, num_questions);

    if (questions.length < Math.ceil(num_questions / 2)) {
      return NextResponse.json(
        {
          error: `题目生成不足(只拿到 ${questions.length}/${num_questions} 题),请重试`,
          raw_count: questions.length,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      questions,
      session_id: generateSessionId(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m5/prep-questions error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
