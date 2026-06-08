/**
 * POST /api/m1/evidence-chat
 *
 * 两种模式:
 *
 * mode: "turn" — 用户刚发了一条消息,AI 回一句简短确认 + 顺势追问要不要再补
 *   输入: { mode: "turn", messages: ChatMessage[], riasecCode?: string }
 *   输出: { reply: string }
 *
 * mode: "finalize" — 用户点「够了」收尾,把整段对话摘成 evidence 给 recommend 用
 *   输入: { mode: "finalize", messages: ChatMessage[], riasecCode?: string }
 *   输出: { summary: string, tags: string[], userNotes: string }
 *
 * 边界: 不挖 STAR、不强制结构化、忠实用户原话。
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

type Role = "assistant" | "user" | "system";
type ChatMessage = { role: Role; content: string };

const MAX_MSG_LEN = 2000;
const MAX_MESSAGES = 12;

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (m): m is { role: unknown; content: unknown } =>
        m !== null && typeof m === "object" && "role" in m && "content" in m
    )
    .map((m) => {
      const role =
        m.role === "user" || m.role === "assistant" || m.role === "system"
          ? m.role
          : "user";
      const content =
        typeof m.content === "string" ? m.content.slice(0, MAX_MSG_LEN) : "";
      return { role, content } as ChatMessage;
    })
    .filter((m) => m.content.length > 0)
    .slice(0, MAX_MESSAGES);
}

function buildTurnSystem(riasecCode: string | null): string {
  const codeHint = riasecCode
    ? `\n\n用户的 RIASEC 编码已经测出来是: ${riasecCode}。可以(但非必须)轻量引用,例如 "嗯,你 E 高确实跟这种方向对得上"。`
    : "";
  return `你是「Offer 捕手」的补充信息助手。用户在测评完后跟你简单聊几句方向倾向 / 忌讳 / 想法,
让推荐 LLM 知道他想要什么、不想要什么。

【你的任务】
- 用户每发一条,你回 **1 句话**(中文,30 字内),做两件事:
  1. 简短确认 / 共情他说的(不要复述,不要评判)
  2. 顺势问要不要再补一句(开放问句,不强制具体方向)

【风格】
- 短句、口语化、温和
- 像朋友聊天,不像在做问卷
- 不要预设话题(eg "你做过什么项目?")—— 让用户自由说
- 不挖 STAR、不分析、不推荐

【硬约束】
- 不输出公司名
- 不诊断(不是心理医生 / 职业咨询师)
- 不夸大用户("你这样太棒了!" 这种不要)
- 不绝对化("一定可以"、"必然成功" 别用)
${codeHint}`;
}

function buildFinalizeSystem(): string {
  return `你是「Offer 捕手」的补充信息摘要助手。用户跟你简单聊了几轮,
现在要把整段对话总结成给推荐 LLM 用的结构化补充信息。

【硬约束 — 必遵】
1. **忠实原话**: userNotes 必须**直接拼接用户说过的话**,不改写、不分析、不预测。最多 200 字。
   **唯一例外:用户原话里有公司名/产品名/学校名,必须脱敏替换**(eg "我想去字节" → "我想去互联网大厂")。
2. **不编造**: 用户没说的方向 / 倾向 / 忌讳别添补。
3. **不输出公司名 / 产品名 / 学校名**(★ 极严格):
   - "字节 / 阿里 / 腾讯 / 百度 / 美团 / 京东" → "互联网大厂"
   - "华为 / 中移动 / 国家电网" → "央国企 / 大型科技公司"
   - "GPT / Claude / OpenAI" → "大语言模型 / AI 厂商"
   - "清华 / 北大 / 麻省理工" → "顶尖高校 / 985 / 海外名校"
   - 创业公司具体名 → "初创公司"
   summary / tags / userNotes 三处全部按此规则脱敏。
4. **关键字必须基于对话**: tags 数组里每个 keyword 都要从用户的话里能找到对应概念,**但 tags 也按上面规则脱敏**。

【字段要求】
- summary: 1-2 段中文,150-300 字。客观描述「用户在这次聊天里表达了什么方向倾向 / 偏好 / 忌讳 / 上下文」。不评价、不推荐。
- tags: 5-12 个关键字(短词)。覆盖方向倾向(eg "硬件方向" / "倾向稳定")、忌讳(eg "不想 996" / "不想销售")、其他上下文。
- userNotes: 用户**原话拼接**,最多 200 字。多句用 / 隔开。例:"我想做硬件 / 不想 996 / 家里希望我考公"。

【输出格式 — 严格 JSON 无 markdown】
{
  "summary": "...",
  "tags": ["...", "..."],
  "userNotes": "..."
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body?.mode === "finalize" ? "finalize" : "turn";
    const messages = sanitizeMessages(body?.messages);
    const riasecCode =
      typeof body?.riasecCode === "string" ? body.riasecCode : null;

    if (messages.length === 0) {
      return NextResponse.json(
        { error: "messages 不能为空" },
        { status: 400 }
      );
    }

    if (mode === "turn") {
      const llmMessages: ChatMessage[] = [
        { role: "system", content: buildTurnSystem(riasecCode) },
        ...messages,
      ];
      const raw = await chat(llmMessages, {
        model: "chat",
        temperature: 0.7,
        max_tokens: 200,
      });
      return NextResponse.json({ reply: raw.trim() });
    }

    // mode: finalize
    const userOnly = messages.filter((m) => m.role === "user");
    if (userOnly.length === 0) {
      return NextResponse.json(
        { error: "用户至少要说一句才能 finalize" },
        { status: 400 }
      );
    }

    const llmMessages: ChatMessage[] = [
      { role: "system", content: buildFinalizeSystem() },
      {
        role: "user",
        content: `下面是整段聊天记录(请基于此输出 JSON 摘要):\n\n${messages
          .map((m) => `${m.role === "user" ? "用户" : "AI"}: ${m.content}`)
          .join("\n")}\n\n请返 JSON。`,
      },
    ];

    const raw = await chat(llmMessages, {
      model: "chat",
      temperature: 0.3,
      max_tokens: 800,
      jsonMode: true,
    });

    type FinResult = {
      summary?: unknown;
      tags?: unknown;
      userNotes?: unknown;
    };

    let parsed: FinResult;
    try {
      parsed = JSON.parse(raw) as FinResult;
    } catch {
      console.error("[evidence-chat finalize] JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim() : "";
    const tagsRaw = Array.isArray(parsed.tags) ? parsed.tags : [];
    const tags = tagsRaw
      .map((t) => (typeof t === "string" ? t.trim() : ""))
      .filter((t) => t.length > 0 && t.length <= 20)
      .slice(0, 12);
    const userNotes =
      typeof parsed.userNotes === "string"
        ? parsed.userNotes.slice(0, 300)
        : userOnly
            .map((m) => m.content)
            .join(" / ")
            .slice(0, 300);

    if (summary.length === 0 || tags.length === 0) {
      return NextResponse.json(
        { error: "LLM 没产出有效摘要,请重试" },
        { status: 502 }
      );
    }

    return NextResponse.json({ summary, tags, userNotes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/evidence-chat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
