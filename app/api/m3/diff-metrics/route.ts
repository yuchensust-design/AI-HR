/**
 * POST /api/m3/diff-metrics — Phase 5 Live Diff 6 维表的 2 维 LLM 评估
 *
 * 用户 2026-06-04 决策:STAR 完整度 + 学历/经验硬门槛对齐 走 LLM 评估,4 个其他维度纯前端规则。
 *
 * Body: { v1Bullets: string[], v2Bullets: string[], jdContext, parsedResumeBasic? }
 *
 * keyword-fix 2026-06-07:JD 关键词清单 + 命中已移走。
 *   - 关键词清单 → parse-jd 一次性抽好存 jdContext.jd_keywords(只忠于 JD,不污染)
 *   - 命中判定 → 前端 lib/keyword-match.ts 代码层确定性计算(可复现)
 *   本路由只保留 STAR 完整度 + 硬门槛对齐 两个真需要 LLM 的判定。
 *
 * 输出:
 *   {
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
import { demoFreeze } from "@/lib/demo-mode";
import diffDemo from "@/lib/demo/linzhou-m3-diffmetrics.json";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

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
  parsedBasic: { major?: string; year_level?: string } | undefined,
  resumeSkillsText: string
): string {
  const mustHave = (jdContext?.must_have ?? []).join(" / ") || "(无)";
  const parsedReq = (jdContext?.jd_requirements_parsed ?? [])
    .map((r) => `${r.type}: ${r.text}`)
    .join("\n") || "(无)";

  return `你是资深 HR + 简历评估官。我会给你 v1(原简历)和 v2(优化后)的 bullets 列表 + JD 信息,你需要严格判定 2 件事。

(注:JD 关键词命中由系统在代码层确定性计算,此处不再产关键词清单。)

【任务 1:STAR 完整度】
对每条 bullet,判定是否**同时**含 4 要素:
  - S (Situation):背景 / 场景 / 项目
  - T (Task):任务 / 目标 / 角色
  - A (Action):具体动作 / 方法
  - R (Result):结果 / 量化 / 影响

判定口径:
  - complete = 4 要素齐全
  - partial = 恰好含 3 个要素(成果型 bullet 常见:动作+结果强但情境/任务略 → 算 partial)
  - 其余(≤2 要素)既不算 complete 也不算 partial
严格判定但不漏 partial:成果密集型 bullet 别一刀切判 0,该给 partial 就给。

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

【输出严格 JSON】
{
  "star_complete_v1": { "complete": N, "partial": N, "total": ${v1Bullets.length} },
  "star_complete_v2": { "complete": N, "partial": N, "total": ${v2Bullets.length} },
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

【简历技能/工具/课程清单】(这些也是简历内容,不在 bullet 里 — 硬门槛对齐(任务 2)要带上)
${resumeSkillsText || "(无)"}

【JD 信息】
- jd_summary: ${jdContext?.jd_summary ?? "(无 — 快速模式)"}
- must_have: ${mustHave}
- parsed_requirements: ${parsedReq}
- 用户基本: ${parsedBasic?.major ?? "?"} · ${parsedBasic?.year_level ?? "?"}

返 JSON。`;
}

export async function POST(request: NextRequest) {
  try {
    // 演示账号:返回冻结的评分指标(综合评分稳定、零随机)
    const __demo = await demoFreeze(request, diffDemo, 0);
    if (__demo) return __demo;

    const body = await request.json();
    const v1Bullets = Array.isArray(body.v1Bullets) ? body.v1Bullets : [];
    const v2Bullets = Array.isArray(body.v2Bullets) ? body.v2Bullets : [];
    const jdContext = body.jdContext ?? null;
    const parsedBasic = body.parsedResumeBasic ?? undefined;
    const resumeSkillsText = typeof body.resumeSkillsText === "string" ? body.resumeSkillsText : "";

    if (v1Bullets.length === 0 && v2Bullets.length === 0) {
      return NextResponse.json(
        { error: "v1Bullets / v2Bullets 至少一个非空" },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(v1Bullets, v2Bullets, jdContext, parsedBasic, resumeSkillsText);

    const raw = await chat(
      [{ role: "user", content: prompt }],
      { model: "chat", temperature: 0, max_tokens: 1500, jsonMode: true }
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

    type StarLike = { complete?: unknown; partial?: unknown; total?: unknown };
    const starV1 = (parsed.star_complete_v1 ?? {}) as StarLike;
    const starV2 = (parsed.star_complete_v2 ?? {}) as StarLike;

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
      gap_breakdown: gapBreakdown,
      star_complete_v1: {
        complete: Number(starV1.complete ?? 0),
        partial: Number(starV1.partial ?? 0),
        total: Number(starV1.total ?? v1Bullets.length),
      },
      star_complete_v2: {
        complete: Number(starV2.complete ?? 0),
        partial: Number(starV2.partial ?? 0),
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
