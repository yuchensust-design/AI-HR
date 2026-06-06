/**
 * POST /api/m1/evidence-parse
 *
 * 输入: { rawText: string }
 * 输出:
 *   {
 *     summary: string,   // 1-2 段中文,「这个用户做过什么」
 *     tags: string[],    // 8-15 个关键字(必须从 rawText 实际出现的词)
 *     rawSnippet: string,// 1500 字内的核心片段(LLM 摘的,why_fit 引用用)
 *     quality: "high"|"mid"|"low"
 *   }
 *
 * 用途: M1 路径 A(上传简历)在客户端 parseResumeFile 完后调用,
 * 拿到结构化摘要传给 /api/m1/recommend 做三段融合。
 *
 * Anti-fabrication: prompt 强制「用户没写的别添补 / 关键字必须来自原文」。
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

const MAX_INPUT_CHARS = 12_000;
const MIN_INPUT_CHARS = 20;

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」的简历摘要助手。用户上传了简历,你要做的事:

【硬约束 — 必遵】
1. **不编造**: 用户简历里没明确写的事情(eg "他喜欢做研究")绝对不能加。只摘原文。
2. **不输出公司名 / 产品名 / 学校名**(★ 极严格,违反即退回):
   即使用户简历里写了具体名字,你的 summary / rawSnippet / tags 都**必须做行业级抽象替换**,例如:
   - "字节跳动" → "互联网大厂" 或 "短视频/内容平台公司"
   - "阿里巴巴" → "互联网大厂" 或 "电商平台公司"
   - "腾讯" → "互联网大厂"
   - "TikTok" / "抖音" / "微信" / "淘宝" → "短视频产品" / "社交产品" / "电商产品"(只保留产品类型)
   - "GPT-4" / "Claude" / "Gemini" → "大语言模型" 或 "LLM"
   - "OpenAI" / "Anthropic" → "AI 厂商"
   - "清华大学" / "北大" / "麻省理工" → "985 高校" / "顶尖院校" / "海外名校"
   - "中国移动" / "华为" → "央国企 / 大型科技公司"
   - 创业公司具体名 → "初创公司 / 小厂"
   规则:**只保留类型/规模/行业层级的抽象信息**,具体名字一律剥掉。哪怕用户简历明确写了 N 次,你的输出里**0 次出现具体名字**。
3. **关键字必须来自原文**: tags 数组里每个 keyword 都必须是用户原文里出现过的实词(或同义概括),不能凭空加。但 **tags 也要做公司名/产品名脱敏**(同上规则)。
4. **rawSnippet 抄用户原文但要脱敏**: 选用户简历里**最跟职业方向相关的 600-900 字内连续片段**(实习经历 + 项目经历 + 技能段优先)。**抄完后把所有公司名/产品名/学校名按上表替换**。如果原文不够就全抄,但替换不能少。**严禁超过 1000 字**,否则下游会截断。

【字段要求】
- summary: 1-2 段中文,150-250 字。客观描述 "这个用户的背景 + 做过什么 + 有哪些技能 / 工具",不评价、不预测、不推荐方向(那是后续 recommend LLM 的活)。
- tags: 8-15 个关键字(短词,2-6 字),覆盖学校类型 / 专业 / 经历类别(实习 / 项目 / 比赛 / 社团 / 课程)/ 技能 / 工具 / 领域 / 角色。例:["大学生", "CS 专业", "用户增长实习", "AI 学习助手项目", "Python", "数据分析", "3 段实习", "字节大厂"]。**不输出公司名**,有则替换成"大厂 / 中厂 / 初创"等行业类。
- rawSnippet: 直接抄用户简历最核心的 600-900 字片段(严禁超过 1000 字)。
- quality: 看 rawText 长度 + 结构化程度:
  - high: rawText ≥ 800 字 且有清晰的「实习 / 项目 / 技能」三段结构
  - mid: rawText 300-800 字 或只有零散经历
  - low: rawText < 300 字 或几乎只有学校 + 专业

【输出格式 — 严格 JSON 无 markdown 包裹】
{
  "summary": "...",
  "tags": ["...", "..."],
  "rawSnippet": "...",
  "quality": "high" | "mid" | "low"
}`;
}

type ParseResult = {
  summary?: unknown;
  tags?: unknown;
  rawSnippet?: unknown;
  quality?: unknown;
};

/** §8.28 A — JSON 容错抢救:从截断的 raw 里 regex 抽 summary / tags / rawSnippet */
function rescueJson(raw: string): ParseResult {
  const out: ParseResult = {};
  // 抽 summary "...":提取 "summary" 字段的字符串值(允许跨行,允许结尾未闭合)
  const sumMatch = raw.match(/"summary"\s*:\s*"([\s\S]*?)(?:"\s*,|"\s*$|$)/);
  if (sumMatch) out.summary = sumMatch[1];

  // 抽 tags 数组:["x","y","z"]  允许末尾未闭合
  const tagsMatch = raw.match(/"tags"\s*:\s*\[([\s\S]*?)(?:\]|$)/);
  if (tagsMatch) {
    const tagStrings = [...tagsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (tagStrings.length) out.tags = tagStrings;
  }

  // 抽 rawSnippet
  const snipMatch = raw.match(/"rawSnippet"\s*:\s*"([\s\S]*?)(?:"\s*,|"\s*}|$)/);
  if (snipMatch) out.rawSnippet = snipMatch[1];

  // 抽 quality
  const qMatch = raw.match(/"quality"\s*:\s*"(high|mid|low)"/);
  if (qMatch) out.quality = qMatch[1];

  return out;
}

/** §8.28 B — 规则版兜底:LLM 完全挂时,纯前端规则生成 summary */
function ruleBasedFallback(text: string) {
  const truncated = text.length > 800 ? text.slice(0, 800) : text;
  const quality: "high" | "mid" | "low" =
    text.length >= 800 ? "mid" : text.length >= 300 ? "mid" : "low";
  return {
    summary: truncated,
    tags: [],
    rawSnippet: text.slice(0, 1500),
    quality,
    mode: "fallback" as const,
  };
}

/** 标准化 LLM 返回 → 业务字段 */
function normalize(parsed: ParseResult, fallbackText: string) {
  const summary =
    typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const tagsRaw = Array.isArray(parsed.tags) ? parsed.tags : [];
  const tags = tagsRaw
    .map((t) => (typeof t === "string" ? t.trim() : ""))
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 15);
  const rawSnippet =
    typeof parsed.rawSnippet === "string"
      ? parsed.rawSnippet.slice(0, 1500)
      : fallbackText.slice(0, 1500);
  const qualityRaw = parsed.quality;
  const quality =
    qualityRaw === "high" || qualityRaw === "mid" || qualityRaw === "low"
      ? qualityRaw
      : fallbackText.length >= 800
        ? "high"
        : fallbackText.length >= 300
          ? "mid"
          : "low";
  return { summary, tags, rawSnippet, quality };
}

async function tryLLM(truncated: string, retryHint?: string): Promise<string> {
  const userMsg = retryHint
    ? `用户简历原文(共 ${truncated.length} 字):\n\n${truncated}\n\n⚠️ ${retryHint}\n请返 JSON。`
    : `用户简历原文(共 ${truncated.length} 字):\n\n${truncated}\n\n请返 JSON。`;
  return await chat(
    [
      { role: "system", content: buildSystemPrompt() },
      { role: "user", content: userMsg },
    ],
    {
      model: "chat",
      temperature: 0.3,
      max_tokens: 4000,
      jsonMode: true,
    }
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const rawText = typeof body?.rawText === "string" ? body.rawText : "";
    const text = rawText.trim();

    if (text.length < MIN_INPUT_CHARS) {
      return NextResponse.json(
        { error: `简历内容至少 ${MIN_INPUT_CHARS} 字` },
        { status: 400 }
      );
    }

    const truncated =
      text.length > MAX_INPUT_CHARS ? text.slice(0, MAX_INPUT_CHARS) : text;

    // ============ Round 1: 调 LLM ============
    let raw: string | null = null;
    try {
      raw = await tryLLM(truncated);
    } catch (err) {
      console.warn("[evidence-parse] R1 LLM call failed:", err);
    }

    if (raw) {
      // R1: 直接 parse
      let parsed: ParseResult | null = null;
      try {
        parsed = JSON.parse(raw) as ParseResult;
      } catch {
        // R1: parse 失败 → 试 rescue
        parsed = rescueJson(raw);
        console.warn(
          "[evidence-parse] R1 JSON parse failed, rescued fields:",
          Object.keys(parsed)
        );
      }
      const result = normalize(parsed, truncated);
      if (result.summary.length >= 30 && result.tags.length >= 3) {
        return NextResponse.json({ ...result, mode: "llm" });
      }
      console.warn(
        "[evidence-parse] R1 result too sparse, retrying with shorter hint"
      );
    }

    // ============ Round 2: 重试(prompt 加"更短") ============
    try {
      raw = await tryLLM(
        truncated,
        "上一次输出可能太长被截断,这次请严格控制 summary 100-180 字,rawSnippet 500-700 字。"
      );
    } catch (err) {
      console.warn("[evidence-parse] R2 LLM call failed:", err);
      raw = null;
    }

    if (raw) {
      let parsed: ParseResult | null = null;
      try {
        parsed = JSON.parse(raw) as ParseResult;
      } catch {
        parsed = rescueJson(raw);
        console.warn("[evidence-parse] R2 JSON parse failed, used rescue");
      }
      const result = normalize(parsed, truncated);
      if (result.summary.length >= 30) {
        return NextResponse.json({ ...result, mode: "llm-retry" });
      }
    }

    // ============ Round 3: 规则版兜底 ============
    console.warn(
      "[evidence-parse] All LLM attempts failed, returning rule-based fallback"
    );
    return NextResponse.json(ruleBasedFallback(text));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/evidence-parse fatal:", err);
    // 哪怕走到这里也兜底,绝不返回 5xx 让前端卡死
    return NextResponse.json({
      ...ruleBasedFallback("简历内容暂时无法解析,请回去重贴或跳过此步"),
      error: message,
    });
  }
}
