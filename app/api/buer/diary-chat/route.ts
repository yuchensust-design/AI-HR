/**
 * POST /api/buer/diary-chat — 「不二」日记小窝引导对话(streaming + 多模态)
 *
 * 跟 /api/buer/chat 的区别:
 *   - /api/buer/chat = 右下角悬浮 → 心理疏导员(emo 支持,纯文本)
 *   - /api/buer/diary-chat = /diary 温馨小窝内嵌 → 日记引导师(温柔引导记录今天的事)
 *
 * v4 §8.22 多模态升级:
 *   - 改用阿里 qwen-vl-plus,支持读用户发的图(单图)
 *   - 消息 content 可以是 string 或 [{type: text}, {type: image_url}]
 *
 * 自伤 / 自杀关键词命中仍 short-circuit 给真实热线(沿用 §8.10 lock)
 * 不输出公司名(沿用 plan §1.5)
 *
 * Body:
 *   { messages: [{ role: "user"|"assistant", content: string | [{type, text|image_url}] }] }
 * 返回:text/plain chunked stream
 *
 * plan §8.21 §C.5 + §8.22 lock
 */
import { NextRequest, NextResponse } from "next/server";
import { chatVisionStream, type VisionMessage } from "@/lib/llm";

const SYSTEM_PROMPT = `你是「不二」,现在用户在「温馨小窝」/diary 页里跟你聊今天的事。

【你这次的角色】
不是心理咨询师 / 不是情绪疏导员。你是 **温柔的日记引导师** — 用户像跟朋友聊天一样讲今天发生的事,你的目的是:
1. 让用户感觉"被听见、被接住"
2. 帮用户把今天值得记下来的事 **聊出来**(后续用户点 ✨ 整理今天,LLM 会把这些对话整理成第一人称日记)

【话术风格】
- 像朋友一样自然
- 不要"亲爱的""我懂"" 你已经很努力了"这种程式化温柔词
- 不主动给建议 / 不评判 / 不教育
- 每轮回复 **1-2 句,不超过 40 字**(短句,不要长段)
- 用 "嗯""哎呀""真的""那" 这种口头语开头自然些
- 多用 "你" 和具体的事,不要泛泛"加油"

【追问规则】
- **偶尔深挖 1 层(最多 2 层)**:用户说事 → 你温柔问一个细节
- 适当场景的追问模板:
  · 用户说做了什么 → "什么时候?""感觉怎么样?""有什么印象特深的吗?"
  · 用户说情绪 → "是什么让你这样?""你现在想怎么处理?"
  · 用户说人物 → "对方是怎么反应的?""你跟 ta 说了什么?"
- 用户的话已经具体 → 不要追问,自然接话(""那挺好的""哎不容易")
- 用户的话很短 → 给个温柔的引子让 ta 说("还有别的想聊的吗?""然后呢?")

【绝对不做(违反 = 严重失误)】
1. 不诊断("你有抑郁症""你是焦虑型人格")
2. 不模拟心理咨询流程(不列"我建议你 1. ... 2. ..." 这种步骤)
3. 不假装真人 — 用户问"你是 AI 吗" → "是的,我是 AI 陪你的暖心小助手"
4. **永远不输出任何公司名**(只到"行业 + 职位类型")
5. 不接极端话题 / 政治敏感 / 医疗法律建议
6. **不要主动建议用户去其他模块**(简历 / 面试 / 测评 等)— 这次专注日记小窝就好,/diary 顶部会自动展示按钮

【用户提到"整理日记""帮我写日记"】
- 回应:"右上角有 ✨ 整理今天 按钮,点一下我就帮你写~"
- 不要试图自己在对话里写日记(让前端 summarize endpoint 做)

【自伤念头检测】
- 触发关键词 → 立即给真实热线(后端会自动 short-circuit 处理,你的 prompt 不用管)
- 真实热线: 全国心理援助 12356(24h,卫健委)/ 北京心理危机研究与干预 010-82951332(WHO 合作中心)

【📷 用户发图(v4 多模态)】
- 你能看到用户发的图片(可能是拍的照片 / 截图 / 自拍)
- 自然回应你看到的:"哎这只小奶猫好可爱!" "诶这个咖啡看起来不错"
- 不要"我看到一张图片显示了 X" 这种 AI 描述式语气
- 跟看到照片的朋友一样自然反应,可以追问"在哪里遇见的?""自己做的吗?"
- 看不清的不强行猜测,可以问"这是 X 吗?"
- 隐私敏感图(eg 用户自拍 + 看起来情绪不好)→ 关心情绪("看起来今天有点累?")不评论外貌

【开场示例 — 仅参考】
用户第一次进 → 用户先发消息触发,你的回应不是开场而是对用户话的反应
所以这个 prompt 不需要"hi 开场" — 用户先说,你才回。`;

// 沿用 /api/buer/chat 的自伤检测 — 复制不抽出来,避免改动过多文件
const SELF_HARM_PATTERNS: RegExp[] = [
  /自杀/, /自残/, /自伤/, /想死/, /不想活/,
  /结束(我|自己)?(的)?(生命|人生)/, /(从|跳)楼/, /割腕/, /烧炭/,
  /安眠药.*(过量|吞)/, /(我|想)一了百了/,
  /活不(了|下去|动)/, /撑不(住|下去|了)/,
  /(没|无)(意思|意义)活/, /消失算了/, /不想(存在|被看见)/,
  /永远(睡着|不醒)/, /(放弃|抛弃)(自己|我)/,
  /如果我(死了|不在了|没了)/,
];

const HOTLINE_RESPONSE = `听到你这样说我很担心。

你可以现在拨 全国心理援助热线 12356(24 小时,国家卫健委),或 北京心理危机研究与干预中心 010-82951332(WHO 合作中心,2002 年起)。

你愿意先告诉我现在身边有谁吗?`;

function detectSelfHarm(text: string): boolean {
  return SELF_HARM_PATTERNS.some((re) => re.test(text));
}

function makeOneShotStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function streamHeaders() {
  return {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "X-Accel-Buffering": "no",
  } as const;
}

/**
 * 提取一条 message 的纯文本部分(给 self-harm 检测用)
 * content 是 string → 直接返;是 array → 拼 text type 的 .text 字段
 */
function extractText(content: VisionMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join(" ");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const raw = Array.isArray(body?.messages) ? body.messages : [];

    // v4 §8.22 — content 可以是 string 或 [{type, text|image_url}]
    const messages: VisionMessage[] = raw
      .filter(
        (m: unknown): m is { role: string; content: unknown } =>
          typeof m === "object" &&
          m !== null &&
          typeof (m as { role: unknown }).role === "string" &&
          (m as { content: unknown }).content !== undefined
      )
      .map((m: { role: string; content: unknown }): VisionMessage => {
        const role = m.role === "assistant" ? "assistant" : "user";
        // content 可以是 string 或 数组(多模态)
        if (typeof m.content === "string") {
          return { role, content: m.content };
        }
        if (Array.isArray(m.content)) {
          // 过滤合法 part(text or image_url)
          const parts = m.content
            .filter(
              (p): p is { type: string; text?: string; image_url?: { url: string } } =>
                typeof p === "object" && p !== null && typeof (p as { type: unknown }).type === "string"
            )
            .map((p) => {
              if (p.type === "text" && typeof p.text === "string") {
                return { type: "text" as const, text: p.text };
              }
              if (p.type === "image_url" && p.image_url && typeof p.image_url.url === "string") {
                return { type: "image_url" as const, image_url: { url: p.image_url.url } };
              }
              return null;
            })
            .filter((p): p is NonNullable<typeof p> => p !== null);
          return { role, content: parts.length > 0 ? parts : "" };
        }
        return { role, content: "" };
      });

    if (messages.length === 0) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const last = messages[messages.length - 1];
    if (last.role !== "user") {
      return NextResponse.json(
        { error: "last message must be from user" },
        { status: 400 }
      );
    }

    // self-harm 检测只看文本部分(图片不检测)
    if (detectSelfHarm(extractText(last.content))) {
      return new Response(makeOneShotStream(HOTLINE_RESPONSE), {
        headers: streamHeaders(),
      });
    }

    // v4 §8.22 — 改用 vision 流式 endpoint
    const stream = await chatVisionStream(
      [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      { temperature: 0.7 }
    );

    return new Response(stream, { headers: streamHeaders() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/buer/diary-chat error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/buer/diary-chat",
    method: "POST",
    keyConfigured: !!process.env.QWEN_VL_API_KEY,
    model: "qwen-vl-plus",
  });
}
