/**
 * POST /api/m3/interview-prep — Tab4 静态面试题文档(对标竞品 ResumeAI Pro 的"面试准备")
 *
 * 基于用户改好的简历 + 目标 JD,生成 5-6 类高频面试题 + 参考答案 + 答题技巧。
 *
 * Anti-fabrication:参考答案只用简历真实内容组织,不编造数字 / 经历 / 成果。
 * 这是和竞品的关键区别 —— 竞品参考答案里会编"覆盖 200+ 用户访谈""CET-6 568 分"等。
 *
 * Body: { parsedResume, jdContext }
 * 返回: { categories: [{ name, questions: [{ q, reference_answer, tip }] }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

type PrepQuestion = {
  q?: unknown;
  examines?: unknown;
  reference_answer?: unknown;
  tip?: unknown;
};

type PrepCategory = {
  name?: unknown;
  questions?: unknown;
};

function normalizePrepCategories(raw: unknown): Array<{
  name: string;
  questions: Array<{ q: string; examines?: string; reference_answer: string; tip?: string }>;
}> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((cat) => {
      const c = cat as PrepCategory;
      const questions = Array.isArray(c.questions)
        ? c.questions
            .map((q) => {
              const item = q as PrepQuestion;
              const question = String(item.q ?? "").trim();
              const answer = String(item.reference_answer ?? "").trim();
              if (!question || !answer) return null;
              return {
                q: question,
                examines: String(item.examines ?? "").trim() || undefined,
                reference_answer: answer,
                tip: String(item.tip ?? "").trim() || undefined,
              };
            })
            .filter(Boolean) as Array<{ q: string; examines?: string; reference_answer: string; tip?: string }>
        : [];
      return {
        name: String(c.name ?? "").trim() || "面试题",
        questions,
      };
    })
    .filter((cat) => cat.questions.length > 0);
}

function clampTo15Questions(
  categories: Array<{
    name: string;
    questions: Array<{ q: string; examines?: string; reference_answer: string; tip?: string }>;
  }>,
) {
  let remaining = 15;
  const result: typeof categories = [];
  for (const cat of categories) {
    if (remaining <= 0) break;
    const picked = cat.questions.slice(0, remaining);
    if (picked.length > 0) {
      result.push({ ...cat, questions: picked });
      remaining -= picked.length;
    }
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsedResume = body.parsedResume ?? null;
    const jdContext = body.jdContext ?? null;
    if (!parsedResume) {
      return NextResponse.json({ error: "parsedResume required" }, { status: 400 });
    }

    const jdLine = jdContext
      ? `目标岗位:${jdContext.jd_summary ?? ""}\nmust_have: ${(jdContext.must_have ?? []).join("、")}`
      : "无明确 JD,按简历求职方向出通用题";

    const prompt = `你是资深面试官 + 求职辅导老师。基于用户的简历 + 目标 JD,生成一份面试准备文档,帮用户提前准备。

【铁律 — anti-fabrication(和别家工具的关键区别)】
- 参考答案只能用简历里真实写到的经历 / 数字 / 项目来组织,**绝不编造**
- 简历没写的数字(eg 用户量、提升幅度),用【你的实际数字】占位,提醒用户面试前确认
- 不替用户编"CET-6 568 分""覆盖 200+ 用户"这类具体值
- 答案口语化、可背诵,但真实可解释

【出题要求】
- 固定 6 个类别:自我介绍类 / 岗位匹配类 / 经历深挖类 / 能力评估类 / 动机与规划类 / 情景与压力类
- **总题数必须正好 15 题**
- 每类 2-3 题,按 3/3/3/2/2/2 分配
- 题目要结合用户简历的具体经历 + JD 的具体要求(不要泛泛而问)
- 每题:q(问题) + examines(这题考察什么,≤ 30 字) + reference_answer(参考答案,基于简历真实内容,150-300 字,口语) + tip(答题技巧/答题方向,≤ 40 字)

【用户简历】
${JSON.stringify(parsedResume, null, 2).slice(0, 5000)}

【${jdLine}】

只返 JSON:
{
  "categories": [
    {
      "name": "自我介绍类",
      "questions": [
        { "q": "请简要介绍一下你自己?", "examines": "考察什么", "reference_answer": "...(基于简历真实内容)...", "tip": "答题方向" }
      ]
    }
  ]
}`;

    const raw = await chat([{ role: "user", content: prompt }], {
      model: "chat",
      temperature: 0.5,
      max_tokens: 6000,
      jsonMode: true,
    });

    let parsed: { categories?: unknown[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[interview-prep] JSON parse failed:", raw.slice(0, 300));
      return NextResponse.json({ error: "LLM 返回格式异常,请重试" }, { status: 502 });
    }

    const categories = clampTo15Questions(normalizePrepCategories(parsed.categories));
    return NextResponse.json({
      categories,
      total_questions: categories.reduce((sum, cat) => sum + cat.questions.length, 0),
      generated_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown";
    console.error("/api/m3/interview-prep error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
