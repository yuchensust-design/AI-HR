/**
 * LLM 客户端包装
 *
 * 使用 DeepSeek API(兼容 OpenAI SDK)
 * - deepseek-chat (V3.1) — 默认,适合大多数对话场景
 * - deepseek-reasoner (R1) — 思考模式,适合复盘评分等需要"细思"的场景
 *
 * 切换 LLM 提供商时只需改 baseURL + apiKey(模型名按需调整)
 */

import OpenAI from "openai";

const apiKey = process.env.DEEPSEEK_API_KEY;

if (!apiKey && process.env.NODE_ENV === "production") {
  console.warn(
    "⚠️ DEEPSEEK_API_KEY not set in production. LLM calls will fail."
  );
}

export const llm = new OpenAI({
  apiKey: apiKey || "missing-key",
  baseURL: "https://api.deepseek.com/v1",
});

export const MODELS = {
  /** V3.1 — 标准对话(出题 / 简历优化 / 推荐 / 不二聊天 等) */
  chat: "deepseek-chat",
  /** R1 思考模式 — 复盘评分 / Skeptical Recruiter 等深推理 */
  reasoner: "deepseek-reasoner",
} as const;

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * 通用 chat 调用 — 返回完整 response
 */
export async function chat(
  messages: ChatMessage[],
  options: {
    model?: keyof typeof MODELS;
    temperature?: number;
    max_tokens?: number;
  } = {}
): Promise<string> {
  const { model = "chat", temperature = 0.7, max_tokens = 2000 } = options;

  const response = await llm.chat.completions.create({
    model: MODELS[model],
    messages,
    temperature,
    max_tokens,
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
