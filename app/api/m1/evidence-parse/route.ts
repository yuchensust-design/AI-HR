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
4. **rawSnippet 抄用户原文但要脱敏**: 选用户简历里**最跟职业方向相关的 1500 字内连续片段**(实习经历 + 项目经历 + 技能段优先)。**抄完后把所有公司名/产品名/学校名按上表替换**。如果原文不够 1500 字就全抄,但替换不能少。

【字段要求】
- summary: 1-2 段中文,200-400 字。客观描述 "这个用户的背景 + 做过什么 + 有哪些技能 / 工具",不评价、不预测、不推荐方向(那是后续 recommend LLM 的活)。
- tags: 8-15 个关键字(短词,2-6 字),覆盖学校类型 / 专业 / 经历类别(实习 / 项目 / 比赛 / 社团 / 课程)/ 技能 / 工具 / 领域 / 角色。例:["大学生", "CS 专业", "用户增长实习", "AI 学习助手项目", "Python", "数据分析", "3 段实习", "字节大厂"]。**不输出公司名**,有则替换成"大厂 / 中厂 / 初创"等行业类。
- rawSnippet: 直接抄用户简历最核心的 1500 字内片段。
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

    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `用户简历原文(共 ${truncated.length} 字):\n\n${truncated}\n\n请返 JSON。`,
        },
      ],
      {
        model: "chat",
        temperature: 0.3,
        max_tokens: 1200,
        jsonMode: true,
      }
    );

    type ParseResult = {
      summary?: unknown;
      tags?: unknown;
      rawSnippet?: unknown;
      quality?: unknown;
    };

    let parsed: ParseResult;
    try {
      parsed = JSON.parse(raw) as ParseResult;
    } catch {
      console.error("[evidence-parse] LLM JSON parse failed:", raw);
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw },
        { status: 502 }
      );
    }

    // Normalize
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
        : truncated.slice(0, 1500);
    const qualityRaw = parsed.quality;
    const quality =
      qualityRaw === "high" || qualityRaw === "mid" || qualityRaw === "low"
        ? qualityRaw
        : truncated.length >= 800
        ? "high"
        : truncated.length >= 300
        ? "mid"
        : "low";

    if (summary.length === 0 || tags.length === 0) {
      return NextResponse.json(
        { error: "LLM 没产出有效摘要,请重试或换种文本" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      summary,
      tags,
      rawSnippet,
      quality,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m1/evidence-parse error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
