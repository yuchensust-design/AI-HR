/**
 * POST /api/m3/diff-metrics — Phase 5 Live Diff 6 维表的 2 维 LLM 评估
 *
 * 用户 2026-06-04 决策:STAR 完整度 + 学历/经验硬门槛对齐 走 LLM 评估,4 个其他维度纯前端规则。
 *
 * Body: { v1Bullets: string[], v2Bullets: string[], jdContext, parsedResumeBasic? }
 *
 * 输出(06 §3.4 升级:加 matched_keywords + gap_breakdown):
 *   {
 *     jd_keywords: string[],
 *     matched_keywords: string[],          // v2 命中的 jd_keywords 子集(LLM 语义判断)
 *     gap_breakdown: { easy, mid, hard },  // 按 jdContext.gaps[].fixable 计数(纯规则)
 *     star_complete_v1: { complete: N, total: N },
 *     star_complete_v2: { complete: N, total: N },
 *     hard_req_aligned_v1: { aligned: N, total: N, items: [...] },
 *     hard_req_aligned_v2: { aligned: N, total: N, items: [...] },
 *     llm_explain: "1 句 LLM 评估解释"
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

type JdContext = {
  jd_summary?: string;
  must_have?: string[];
  jd_requirements_parsed?: { type: string; text: string }[];
  gaps?: { jd_requirement?: string; why_gap?: string; fixable?: string }[];
} | null;

function buildPrompt(
  v1Bullets: string[],
  v2Bullets: string[],
  jdContext: JdContext,
  parsedBasic: { major?: string; year_level?: string } | undefined
): string {
  const mustHave = (jdContext?.must_have ?? []).join(" / ") || "(无)";
  const parsedReq = (jdContext?.jd_requirements_parsed ?? [])
    .map((r) => `${r.type}: ${r.text}`)
    .join("\n") || "(无)";

  return `你是资深 HR + 简历评估官。我会给你 v1(原简历)和 v2(优化后)的 bullets 列表 + JD 信息,你需要严格判定 3 件事。

【任务 0:扩展 JD 关键词到 30-50 个 token】(用于前端跑 keyword count)
基于 must_have + parsed_requirements,扩展成 30-50 个相关 token,包括:
  - 原 must_have 拆出的关键词(eg "SQL/Excel 数据分析" → "SQL", "Excel", "数据分析")
  - 同义/近义扩展(eg "数据敏感度" → "数据分析", "数据驱动", "数据可视化")
  - JD 隐含的技能词(eg AI PM JD → "用户访谈", "PRD", "AB test", "LLM")
- 输出在 jd_keywords 字段
- 不重复;不含公司名

【任务 1:STAR 完整度】
对每条 bullet,判定是否**同时**含 4 要素:
  - S (Situation):背景 / 场景 / 项目
  - T (Task):任务 / 目标 / 角色
  - A (Action):具体动作 / 方法
  - R (Result):结果 / 量化 / 影响

至少 3 要素清楚的算 partial 不算 complete。**严格判定 — 不水**。

【任务 2:学历/经验硬门槛对齐】
从 JD 里提取**硬门槛**(可量化 / 二元判定的要求,eg:
  - "本科及以上"
  - "GPA ≥ 3.0"
  - "X 年经验"
  - "懂 Python / SQL"
  - "英语 CET6"
  - "实习经验 ≥ N 段"
),对 v1 / v2 各算对齐数。

**注意**:软技能("沟通能力强")不算硬门槛(无法二元判定)。

【任务 3:matched_keywords(v2 命中的 jd_keywords)】
从你产的 jd_keywords 里挑出 v2 bullets **实际命中**的关键词:
  - 命中 = v2 bullets 文本里直接出现该 token,或语义近似(eg "Pandas" 命中"数据分析")
  - 严格判定 — v1 命中但 v2 没命中的不算
  - 不能凭空加,只从 jd_keywords 子集里选

【输出严格 JSON】
{
  "jd_keywords": ["数据分析", "SQL", "用户访谈", ...],  // 30-50 个
  "matched_keywords": ["数据分析", "SQL", ...],         // v2 命中的 jd_keywords 子集
  "star_complete_v1": { "complete": N, "total": ${v1Bullets.length} },
  "star_complete_v2": { "complete": N, "total": ${v2Bullets.length} },
  "hard_req_total": N,
  "hard_req_v1_aligned": N,
  "hard_req_v2_aligned": N,
  "hard_req_items": [
    { "req": "本科及以上", "v1": true, "v2": true },
    { "req": "懂 SQL", "v1": false, "v2": true },
    ...
  ],
  "llm_explain": "1-2 句简短评估(中立,不夸张)"
}

【v1 bullets(原简历,${v1Bullets.length} 条)】
${v1Bullets.map((b, i) => `[v1-${i + 1}] ${b}`).join("\n")}

【v2 bullets(优化后,${v2Bullets.length} 条)】
${v2Bullets.map((b, i) => `[v2-${i + 1}] ${b}`).join("\n")}

【JD 信息】
- jd_summary: ${jdContext?.jd_summary ?? "(无 — 快速模式)"}
- must_have: ${mustHave}
- parsed_requirements: ${parsedReq}
- 用户基本: ${parsedBasic?.major ?? "?"} · ${parsedBasic?.year_level ?? "?"}

返 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const v1Bullets = Array.isArray(body.v1Bullets) ? body.v1Bullets : [];
    const v2Bullets = Array.isArray(body.v2Bullets) ? body.v2Bullets : [];
    const jdContext = body.jdContext ?? null;
    const parsedBasic = body.parsedResumeBasic ?? undefined;

    if (v1Bullets.length === 0 && v2Bullets.length === 0) {
      return NextResponse.json(
        { error: "v1Bullets / v2Bullets 至少一个非空" },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(v1Bullets, v2Bullets, jdContext, parsedBasic);

    const raw = await chat(
      [{ role: "user", content: prompt }],
      { model: "chat", temperature: 0.2, max_tokens: 1500, jsonMode: true }
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[diff-metrics] LLM JSON parse failed:", raw.slice(0, 300));
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw: raw.slice(0, 300) },
        { status: 502 }
      );
    }

    type StarLike = { complete?: unknown; total?: unknown };
    const starV1 = (parsed.star_complete_v1 ?? {}) as StarLike;
    const starV2 = (parsed.star_complete_v2 ?? {}) as StarLike;

    const jdKeywords = Array.isArray(parsed.jd_keywords)
      ? parsed.jd_keywords.map(String).filter(Boolean)
      : [];

    // matched_keywords: LLM 输出 + 兜底字符串匹配
    let matchedKeywords = Array.isArray(parsed.matched_keywords)
      ? parsed.matched_keywords.map(String).filter(Boolean)
      : [];
    // 约束在 jdKeywords 子集内,去重
    matchedKeywords = Array.from(new Set(matchedKeywords)).filter((k) => jdKeywords.includes(k));
    // 兜底:LLM 漏的关键词做字符串子串匹配补回
    if (jdKeywords.length > 0) {
      const v2Joined = v2Bullets.join(" ").toLowerCase();
      for (const k of jdKeywords) {
        if (matchedKeywords.includes(k)) continue;
        if (k.length >= 2 && v2Joined.includes(k.toLowerCase())) {
          matchedKeywords.push(k);
        }
      }
    }

    // gap_breakdown: 纯规则,按 jdContext.gaps[].fixable 计数
    const gaps = Array.isArray(jdContext?.gaps) ? jdContext.gaps : [];
    const gapBreakdown = { easy: 0, mid: 0, hard: 0 };
    for (const g of gaps) {
      const f = String(g?.fixable ?? "");
      if (f.includes("易补")) gapBreakdown.easy++;
      else if (f.includes("中等")) gapBreakdown.mid++;
      else if (f.includes("难补")) gapBreakdown.hard++;
    }

    return NextResponse.json({
      jd_keywords: jdKeywords,
      matched_keywords: matchedKeywords,
      gap_breakdown: gapBreakdown,
      star_complete_v1: {
        complete: Number(starV1.complete ?? 0),
        total: Number(starV1.total ?? v1Bullets.length),
      },
      star_complete_v2: {
        complete: Number(starV2.complete ?? 0),
        total: Number(starV2.total ?? v2Bullets.length),
      },
      hard_req_total: Number(parsed.hard_req_total ?? 0),
      hard_req_v1_aligned: Number(parsed.hard_req_v1_aligned ?? 0),
      hard_req_v2_aligned: Number(parsed.hard_req_v2_aligned ?? 0),
      hard_req_items: Array.isArray(parsed.hard_req_items) ? parsed.hard_req_items : [],
      llm_explain: String(parsed.llm_explain ?? ""),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    console.error("/api/m3/diff-metrics error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
