/**
 * LLM 客户端包装
 *
 * 双 provider:
 * - DeepSeek(默认,text-only)— deepseek-chat (V3.1) / deepseek-reasoner (R1)
 * - 腾讯混元(多模态)— hunyuan-turbo-vision(读图 + 文本)
 *
 * 切换 LLM 提供商时只需改 baseURL + apiKey(模型名按需调整)
 *
 * 多模态使用规则(plan §8.22):
 *   - DiaryChatPanel 的不二聊天 → vision(可读用户发的图)
 *   - /api/buer/summarize-diary 整理日记 → vision(整理时读对话图)
 *   - /api/m3/mine-from-diary 简历素材挖掘 → vision(挖日记图里的素材)
 *   - 其他模块(m1/m2/m3 其他/m5)仍用 DeepSeek text(无需多模态)
 *
 * 混元注意:
 *   - 这里用的是混元 OpenAI 兼容 endpoint,需要"混元 API Key"(以 sk- 开头)
 *   - 不是 CAM 的 SecretId/SecretKey(那对是签名鉴权,不兼容)
 *   - 创建路径:https://console.cloud.tencent.com/hunyuan/api-key
 */

import OpenAI from "openai";

const apiKey = process.env.DEEPSEEK_API_KEY;
const hunyuanKey = process.env.HUNYUAN_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️ DEEPSEEK_API_KEY not set in production. LLM calls will fail."
  );
}

if (!hunyuanKey && process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️ HUNYUAN_API_KEY not set in production. Vision LLM calls will fail."
  );
}

export const llm = new OpenAI({
  apiKey: apiKey || "missing-key",
  baseURL: "https://api.deepseek.com/v1",
});

/** 腾讯混元 vision client(多模态)— OpenAI 兼容 endpoint */
export const llmVision = new OpenAI({
  apiKey: hunyuanKey || "missing-hunyuan-key",
  baseURL: "https://api.hunyuan.cloud.tencent.com/v1",
});

export const MODELS = {
  /** V3.1 — 标准对话(出题 / 简历优化 / 推荐 / 不二右下角聊天 等) */
  chat: "deepseek-chat",
  /** R1 思考模式 — 复盘评分 / Skeptical Recruiter 等深推理 */
  reasoner: "deepseek-reasoner",
  /** 腾讯 hunyuan-turbo-vision — 多模态(读图 + 文本),DiaryChatPanel 用 */
  vision: "hunyuan-turbo-vision",
} as const;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 把对话规整成「严格交替、以 user 开头」的序列。
 *
 * 腾讯混元等强约束模型要求 messages 必须 user/assistant 交替、以 user 开头。
 * 但前端会:① 把硬编码欢迎语作为首条 assistant 消息一起发;
 * ② 多气泡(<|next|>)把一轮回复拆成多条连续 assistant 消息。
 * 这两种都会破坏交替 → 混元报 400。本函数兜底:
 *   - 丢掉开头的非 user 消息(欢迎语)
 *   - 合并连续同角色消息(多气泡 → 合回一条)
 * system 消息不在此处理(调用方自己 prepend)。对 DeepSeek 等宽容模型也无害。
 */
export function toAlternating<T extends { role: string; content: unknown }>(
  msgs: T[],
): T[] {
  const out: T[] = [];
  for (const m of msgs) {
    if (out.length === 0) {
      if (m.role !== "user") continue; // 丢开头的 assistant(欢迎语)
      out.push(m);
      continue;
    }
    const last = out[out.length - 1]!;
    if (last.role === m.role) {
      // 连续同角色 → 合并:都是 string 则拼接,否则保留后者以维持交替
      if (typeof last.content === "string" && typeof m.content === "string") {
        (last as { content: string }).content = `${last.content}\n${m.content}`;
      } else {
        out[out.length - 1] = m;
      }
    } else {
      out.push(m);
    }
  }
  return out;
}

/**
 * 通用 chat 调用 — 返回完整 response
 *
 * jsonMode = true 时要求模型返 JSON(prompt 里必须明示要返 JSON,否则 API 报错)
 */
export async function chat(
  messages: ChatMessage[],
  options: {
    model?: keyof typeof MODELS;
    temperature?: number;
    max_tokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const {
    model = "chat",
    temperature = 0.7,
    max_tokens = 2000,
    jsonMode = false,
  } = options;

  const response = await llm.chat.completions.create({
    model: MODELS[model],
    messages,
    temperature,
    max_tokens,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * 流式 chat — 返回 ReadableStream(SSE 格式)
 * 用于 streaming UI(模拟面试 / 实时聊天等)
 */
export async function chatStream(
  messages: ChatMessage[],
  options: {
    model?: keyof typeof MODELS;
    temperature?: number;
  } = {}
): Promise<ReadableStream<Uint8Array>> {
  const { model = "chat", temperature = 0.7 } = options;

  const stream = await llm.chat.completions.create({
    model: MODELS[model],
    messages,
    temperature,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/* ============================================================
 * 多模态 vision API(hunyuan-turbo-vision)— plan §8.22 lock
 * ============================================================ */

/**
 * 多模态 message 格式 — content 可以是 string(纯文本)或数组(text + image)
 * hunyuan-turbo-vision 跟 OpenAI vision 格式一致
 */
export type VisionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type VisionMessage = {
  role: "system" | "user" | "assistant";
  content: string | VisionContentPart[];
};

/**
 * 多模态 chat — 非流式
 *
 * 用于:summarize-diary / mine-from-diary 等一次性 JSON 输出场景
 */
export async function chatVision(
  messages: VisionMessage[],
  options: {
    temperature?: number;
    max_tokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<string> {
  const { temperature = 0.7, max_tokens = 2000, jsonMode = false } = options;

  const response = await llmVision.chat.completions.create({
    model: MODELS.vision,
    // 阿里 DashScope 兼容 OpenAI vision messages 格式
    messages: messages as Parameters<
      typeof llmVision.chat.completions.create
    >[0]["messages"],
    temperature,
    max_tokens,
    ...(jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * 多模态 chat — 流式
 *
 * 用于:DiaryChatPanel 实时聊天(用户发图 → 不二流式回复)
 */
export async function chatVisionStream(
  messages: VisionMessage[],
  options: { temperature?: number } = {}
): Promise<ReadableStream<Uint8Array>> {
  const { temperature = 0.7 } = options;

  const stream = await llmVision.chat.completions.create({
    model: MODELS.vision,
    messages: messages as Parameters<
      typeof llmVision.chat.completions.create
    >[0]["messages"],
    temperature,
    stream: true,
  });

  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (typeof content === "string") {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
