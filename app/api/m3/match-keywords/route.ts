/**
 * POST /api/m3/match-keywords — JD 关键词命中判定(LLM 语义 + 证据约束)
 *
 * 为什么不再用纯子串(keyword-match.ts):
 *  - 子串只能命中"字面/别名出现在简历里"的词 → 能力类/职责类(学习能力、开发跟进、
 *    产品迭代…)在简历里用"具体动作"表达,字面不出现 → 永远漏,加同义词也堵不全
 *  - 竞品(resume-job-matcher skill)的"懂招聘"就是把命中判定交给 LLM 一次语义推理
 *
 * 怎么同时保住稳定 + 不编造(避免上次 LLM 匹配的两个 bug):
 *  - 关键词列表【固定】由调用方传入(parse-jd 已确定性抽好)→ LLM 只分类,不能新增/幻觉词
 *  - temperature 0 + 调用方按内容签名缓存 → 同输入同输出,不再忽高忽低
 *  - 命中【必须引用简历原句】作为 evidence,引不出就判未命中 → anti-fab 护栏,反超竞品
 *
 * Body: { jdKeywords: string[], resumeText: string }
 * 返回: { results: [{ keyword, hit, evidence }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import { demoFreeze } from "@/lib/demo-mode";
import kwDemo from "@/lib/demo/linzhou-m3-matchkw.json";

// Vercel serverless 函数超时:LLM 调用常 >10s,默认 10s 会 504 → 必须显式拉到 60s(Hobby 上限)
export const maxDuration = 60;

const MAX_RESUME_LEN = 12000;

const SYSTEM = `你是资深招聘官 + 简历评估官。我会给你一份简历全文,和一组目标岗位关键词。
对【每一个】给定关键词,判断这份简历是否有【具体经历/事实】证明候选人具备该能力或满足该要求。

【判定铁律 — 违反即失败】
1. 命中(hit=true)必须在 evidence 里引用简历中的【原句或原短语】作为证据;引不出简历原文支撑的,一律判未命中(hit=false),evidence 留空字符串。
2. 允许语义推断:简历用"具体动作"体现能力时也算命中。
   例:"两周自学 Figma 并独立产出原型" → "学习能力"命中,evidence 引这句。
   例:"统筹 5 人团队推进需求梳理与产品上线" → "开发跟进"命中。
3. 不许脑补:简历完全没提及、也没有任何动作能推出的能力/要求,判未命中。绝不为了好看硬判命中。
4. 只判定我给的关键词列表,逐个判,不准新增、删除、合并或改写关键词。返回顺序与数量必须和输入一致。

输出严格 JSON(无 markdown 包裹):
{ "results": [ { "keyword": "原样关键词", "hit": true, "evidence": "命中时引用的简历原文片段;未命中留空" } ] }`;

export async function POST(request: NextRequest) {
  try {
    // 演示账号:返回冻结的语义命中(命中/缺口稳定)
    const __demo = await demoFreeze(request, kwDemo, 0);
    if (__demo) return __demo;

    const body = await request.json();
    const jdKeywords: string[] = Array.isArray(body.jdKeywords)
      ? body.jdKeywords.map((k: unknown) => String(k).trim()).filter(Boolean)
      : [];
    const resumeText = String(body.resumeText ?? "").slice(0, MAX_RESUME_LEN);

    if (jdKeywords.length === 0) {
      return NextResponse.json({ error: "jdKeywords 不能为空" }, { status: 400 });
    }
    if (!resumeText) {
      return NextResponse.json({ error: "resumeText 不能为空" }, { status: 400 });
    }

    const user = `【简历全文】
${resumeText}

【目标岗位关键词(共 ${jdKeywords.length} 个,逐个判定)】
${jdKeywords.map((k, i) => `${i + 1}. ${k}`).join("\n")}

返回 JSON。`;

    const raw = await chat(
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      { model: "chat", temperature: 0, max_tokens: 2500, jsonMode: true }
    );

    let parsed: { results?: Array<{ keyword?: unknown; hit?: unknown; evidence?: unknown }> };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[match-keywords] JSON parse failed:", raw.slice(0, 300));
      return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
    }

    const byKeyword = new Map<string, { hit: boolean; evidence: string }>();
    for (const r of parsed.results ?? []) {
      const kw = String(r?.keyword ?? "").trim();
      if (kw) byKeyword.set(kw, { hit: Boolean(r?.hit), evidence: String(r?.evidence ?? "") });
    }

    // 以输入列表为准对齐(防 LLM 漏判/改写):漏的当未命中
    const results = jdKeywords.map((kw) => {
      const m = byKeyword.get(kw);
      return { keyword: kw, hit: m?.hit ?? false, evidence: m?.evidence ?? "" };
    });

    return NextResponse.json({
      results,
      matched: results.filter((r) => r.hit).map((r) => r.keyword),
      missing: results.filter((r) => !r.hit).map((r) => r.keyword),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/match-keywords error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
