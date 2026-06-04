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

/** v4 §8.22 — content 可以是 string 或 vision parts */
type IncomingMessage = {
  role: "user" | "assistant";
  content: string | VisionContentPart[];
};

type SummaryResponse = {
  title: string;
  content: string;
  eligible: boolean;
  reason?: string;
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
  return `你是「Offer 捕手」的日记整理助手「不二」。用户跟你聊了一些今天的碎片,请把这些对话整理成 **用户第一人称视角** 的日记。

【硬约束 — 严守】
1. **只重组用户原话,绝不加新信息**
   - 用户没提的数字 / 名字 / 细节 → 严禁编造(比如用户说"很多人"不能写"30 人")
   - 用户说"挺累的"就写"挺累的",别脑补成"身心俱疲"
2. **第一人称"我"**,温柔自然,300-500 字
3. **如果用户的对话纯情绪宣泄 + 无具体事件**(eg 5 条都在说"今天好难过 / 压力大"但没说做了什么)→ **拒绝整理**(eligible=false + reason 解释)
4. **拒绝整理的场景**:
   - 用户只说感受没说事(我整理也只是把抽象情绪改写一遍,没意义)
   - 用户对话 < 50 字(素材太少)
   - 全部是问 AI 的问题(eg "你叫什么名字" "你怎么样")
5. 标题:5-15 字,概括今天主旋律(eg "主持文艺晚会 + 写代码到凌晨")
6. 正文结构:开头(背景)→ 事情经过 → 我的感受 → 也许一句小总结(可选,不强求)

【话术风格】
- 像在日记本上自言自语,不要"今天我做了 3 件事:一是..."这种条目列举
- 不要"亲爱的日记本",不要"嗨大家"
- 自然口语化,不要 ChatGPT 风格的工整段落
- 可以用"...""嗯""不知道为什么"等口头语

【📷 用户发的图(v4 多模态)】
- 用户聊天里发的图,你看得到 — 自然描述进日记
- "今天看到一只三色小猫"(看到猫)/ "做了一杯拿铁"(看到咖啡)/ "去了那家新开的书店"(看到店面)
- 描述基于你真实看到的,不要瞎编("小猫戴着粉色项圈" — 必须图里真的有)
- 隐私敏感图(自拍 / 私人物品) → 只提你能记的事,不评论外貌或物品具体细节

【输出 JSON 严格格式,无 markdown 包裹】
若可整理:
{
  "title": "5-15 字标题",
  "content": "300-500 字第一人称日记正文",
  "eligible": true
}

若不可整理(纯情绪 / 素材太少):
{
  "title": "",
  "content": "",
  "eligible": false,
  "reason": "温和告诉用户为什么不整理(eg '今天的对话主要在表达感受,没特别具体的事可以记下来;直接保留原始对话本身就挺好的~')"
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

    return NextResponse.json({
      title: parsed.title || "",
      content: parsed.content || "",
      eligible: !!parsed.eligible,
      reason: parsed.reason,
      // 给前端的"原始对话精简"— 只 user 的 text,图片不回传(localStorage 友好 + 隐私)
      rawDialog: userBlocks.map((b) => b.line),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/buer/summarize-diary error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
