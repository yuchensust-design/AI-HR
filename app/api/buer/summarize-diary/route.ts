/**
 * POST /api/buer/summarize-diary — chat 多轮对话 → AI 整理成第一人称日记
 *
 * 客户端流程(plan §8.20 §C.3):
 *   1. 用户在「不二」chat panel 聊 ≥ 3 条 user 消息
 *   2. 顶部"✨ 把今天的对话整理成日记"按钮出现
 *   3. 点 → POST 本 endpoint with messages[]
 *   4. LLM 返 { title, content, eligible, reason? }
 *   5. 前端 modal 预览 → 用户确认 → addEntry({ source: "ai-summary", rawDialog })
 *
 * Anti-fab 4 层防护(plan §C.4):
 *   1. system prompt 硬约束:只重组用户原话 / 不加新信息 / 不编数字 / 拒绝纯情绪宣泄
 *   2. UI 永久 chip "🤖 AI 整理"(/diary 渲染)
 *   3. rawDialog 字段存 user 原话(用户可一键看原始对话对照)
 *   4. m3 挖素材时来源透传 "(AI 整理自对话)"
 *
 * 隐私:
 *   - 只把 user 的话发给 LLM(assistant 回复不传,减少敏感信息暴露)
 *   - 后端零持久化 / DeepSeek API 默认不留存
 */

import { NextRequest, NextResponse } from "next/server";
import { chatVision, type VisionMessage, type VisionContentPart } from "@/lib/llm";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

/** v4 §8.22 — content 可以是 string 或 vision parts */
type IncomingMessage = {
  role: "user" | "assistant";
  content: string | VisionContentPart[];
};

/** v5 §8.23 — 仪式感日记本格式 */
type SummaryResponse = {
  title: string;
  content: string;
  eligible: boolean;
  reason?: string;
  highlights?: string[];
  meta?: {
    weather?: string | null;
    mood?: string | null;
    place?: string | null;
  };
};

/** 从一条消息抽出 text + 图片 URL */
function splitContent(content: IncomingMessage["content"]): {
  text: string;
  images: string[];
} {
  if (typeof content === "string") return { text: content, images: [] };
  const text = content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
  const images = content
    .filter(
      (p): p is { type: "image_url"; image_url: { url: string } } =>
        p.type === "image_url"
    )
    .map((p) => p.image_url.url);
  return { text, images };
}

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的日记整理助手「不二」。用户跟你聊了一些今天的碎片,请整理成 **仪式感日记本格式 (v5)** — 第一人称视角。

【硬约束 — 严守】
1. **只重组用户原话,绝不加新信息**
   - 用户没提的数字 / 名字 / 细节 → 严禁编造(比如用户说"很多人"不能写"30 人")
   - 用户说"挺累的"就写"挺累的",别脑补成"身心俱疲"
2. **第一人称"我"**,温馨自然
3. **拒绝整理**(eligible=false)的场景:
   - 用户只说感受没说事(我整理也只是把抽象情绪改写一遍)
   - 用户对话总文字 < 50 字
   - 全部是问 AI 的问题

【日记本格式 — v5 仪式感(关键升级)】
1. **不要流水账**("我先 X 然后 Y 最后 Z"),要 **概括**("今天的关键词是 X")
2. **标题诗意**:"第一次主持" 而非 "主持文艺晚会";"被点名了" 而非 "今天上课"
3. **highlights 数组 3-5 个亮点小句**:
   - 每句 10-25 字,捕捉一个瞬间 / 感觉 / 细节
   - 例:["第一次站台,腿都软了", "300+ 双眼睛看着我", "走下台时,有人喊我名字"]
   - 必须基于用户原话,**不能编**
4. **content 200-350 字**(短了!不要超),温馨自语:
   - 用"...""嗯""不知道为什么"等口头语
   - 一句小感受总结("今天大概会记很久")
   - **不要 ChatGPT 工整段落**,不要"亲爱的日记本"
   - **不要复述 highlights** — content 是更长的内心独白,highlights 是亮点提取
5. **meta 推断**(全部可选,推不出留 null **严禁瞎编**):
   - **weather**:基于对话提到的天气("外面下雨"→🌧️ / "晒得不行"→☀️);没提就 null
   - **mood**:基于对话语气("好累但很爽"→🙂 / "今天好闷"→😐 / "超开心"→✨)
   - **place**:仅当用户明确说("学校" "教室" "咖啡馆" "家里")

【📷 用户发的图(多模态)】
- 你看得到图 — 自然描述进 highlights 或 content
- 必须基于真实图像,不要瞎编细节
- 隐私敏感图 → 只提能记的事,不评论外貌或物品

【输出 JSON 严格格式,无 markdown 包裹】

若 eligible=true:
{
  "eligible": true,
  "title": "5-15 字诗意标题",
  "highlights": ["亮点1", "亮点2", "亮点3"],
  "content": "200-350 字温馨自语",
  "meta": {
    "weather": "☀️" 或 null,
    "mood": "🙂" 或 null,
    "place": "学校" 或 null
  }
}

若 eligible=false:
{
  "eligible": false,
  "reason": "温和告诉用户为什么(eg '今天的对话主要在表达感受,没特别具体的事可记')",
  "title": "",
  "highlights": [],
  "content": "",
  "meta": {}
}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const messages = body.messages as IncomingMessage[] | undefined;

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages required (non-empty array)" },
        { status: 400 }
      );
    }

    // 只取 user 的话(隐私 + 不让 assistant 的话污染整理逻辑)
    const userMessages = messages.filter((m) => m.role === "user");

    if (userMessages.length < 2) {
      return NextResponse.json(
        {
          title: "",
          content: "",
          eligible: false,
          reason: "对话太少啦,再多聊一会再来整理吧~",
        },
        { status: 200 }
      );
    }

    // v4 §8.22 — 抽取每条 user message 的文本 + 图片
    const userBlocks = userMessages.map((m, idx) => {
      const split = splitContent(m.content);
      const imgMark =
        split.images.length > 0 ? ` [+${split.images.length} 张图]` : "";
      return {
        idx: idx + 1,
        text: split.text.trim() || "(没文字,只发了图)",
        images: split.images,
        line: `(${idx + 1}) ${split.text.trim() || "(没文字,只发了图)"}${imgMark}`,
      };
    });

    const userBlock = userBlocks.map((b) => b.line).join("\n\n");
    const allImages = userBlocks.flatMap((b) => b.images);

    const userPromptText = `用户跟你聊了 ${userMessages.length} 条今天的事,请整理成第一人称日记:

【用户原话】
${userBlock}
${allImages.length > 0 ? `\n【📷 用户共发了 ${allImages.length} 张图,请看图后融进日记的相应位置】` : ""}

请返 JSON。记住:只重组原话 / 看图描述真实内容,不加新信息,不编数字 / 名字 / 细节。`;

    // v4 §8.22 — vision message:user content = [text, image1, image2, ...]
    const userContent: VisionContentPart[] = [
      { type: "text", text: userPromptText },
      ...allImages.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
    ];

    const visionMessages: VisionMessage[] = [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userContent },
    ];

    const raw = await chatVision(visionMessages, {
      temperature: 0.5,
      max_tokens: 1500,
      jsonMode: true,
    });

    let parsed: SummaryResponse;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("[summarize-diary] JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试" },
        { status: 502 }
      );
    }

    // v5 §8.23 — 仪式感日记本字段透传(highlights / meta)
    const highlights = Array.isArray(parsed.highlights)
      ? parsed.highlights.filter((h): h is string => typeof h === "string" && h.length > 0).slice(0, 5)
      : [];
    const meta = parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {};

    return NextResponse.json({
      title: parsed.title || "",
      content: parsed.content || "",
      eligible: !!parsed.eligible,
      reason: parsed.reason,
      highlights,
      meta: {
        weather: meta.weather || null,
        mood: meta.mood || null,
        place: meta.place || null,
      },
      // 给前端的"原始对话精简"— 只 user 的 text,图片不回传(localStorage 友好 + 隐私)
      rawDialog: userBlocks.map((b) => b.line),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/buer/summarize-diary error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
