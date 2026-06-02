/**
 * POST /api/m3/parse-jd — 模块 3 Phase 2 JD 匹配
 *
 * Body 模式 3 选 1:
 *   { mode: "full", jdText, parsedResume }            完整 JD 文本(最准)
 *   { mode: "role", roleName, company?, parsedResume } 岗位名+公司(LLM 用知识推 + 标注"通用版")
 *   { mode: "quick" } 快速模式:返 { jd_context: null } 不调 LLM,Phase 5 走通用 polish
 *
 * 输出 schema(plan §8.12 §B.1 + §A.1 lock):
 *   {
 *     jd_summary: string,                  // jd_summary 严禁公司名
 *     must_have: string[],
 *     nice_to_have: string[],
 *     jd_requirements_parsed: [{ type, text }],
 *     match_highlights: [{ user_strength, jd_requirement, evidence }],
 *     gaps: [{ jd_requirement, why_gap, fixable }],
 *     priority_score: 1-5,
 *     meta: { mode, confidence: "high" | "medium" | "low" }
 *   }
 *
 * 硬约束:
 *   - jd_summary / jd_requirements_parsed 输出严禁公司名(0.3 #1)
 *   - mode = "role" 时 confidence = "medium" 并明示"通用推断"
 *   - 4 套思辨纪律内化:Anti-fabrication(不编造 JD 不存在的要求)+ Gap→Project Bridge(gaps[] 喂 m4)
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

const MAX_JD_LEN = 8000;

let phase2PromptCache: string | null = null;
async function loadPhase2Prompt(): Promise<string> {
  if (phase2PromptCache) return phase2PromptCache;
  const filepath = path.join(
    process.cwd(),
    "lib/prompts/skill-matching-refs/question-batteries.md"
  );
  try {
    const full = await fs.readFile(filepath, "utf-8");
    const match = full.match(
      /## Phase 2: 岗位匹配[\s\S]*?(?=\n## Phase 3:|\n---)/
    );
    phase2PromptCache = match ? match[0] : "";
    return phase2PromptCache;
  } catch {
    return "";
  }
}

function buildSystemPrompt(phase2Ref: string, mode: "full" | "role"): string {
  const modeNote =
    mode === "full"
      ? "用户提供了完整 JD 文本,你可以高保真拆解。confidence = high。"
      : "用户只给了岗位名(+ 可能公司名),你用行业通用知识推断,**明示这是 generic / not JD-specific**。confidence = medium。";

  return `你是「Offer 捕手」模块 3 简历整理 skill 的 Phase 2 JD 匹配引擎。

【模式】
${modeNote}

【任务】
基于用户的 parsed_resume + JD 输入,产出 JSON:JD 拆解 + 简历命中亮点 + gaps。

【参考主框架 Phase 2 流程】
${phase2Ref || "(主框架文件未加载,按下方 schema 严格执行)"}

【硬约束 — 永远不违反】
1. jd_summary 输出**严禁出现公司名**(LLM 输出层脱敏 — 即使用户 JD 里有"字节/腾讯/阿里"等,你的 jd_summary 只能说"某互联网大厂"/"某短视频公司")
2. jd_requirements_parsed 也严禁公司名
3. match_highlights / gaps 字段允许引用用户简历里的真实公司名(那是用户原始数据,不是你 hallucinate)
4. Anti-fabrication:不编造 JD 不存在的要求;不确定的 must_have 放 nice_to_have
5. JD : 公司业务权重 = 80 : 20(plan §C lock)

【输出 JSON schema — 严格 JSON,无 markdown 包裹】
{
  "jd_summary": "1-2 句核心要求摘要(脱敏,行业 + 职位类型)",
  "must_have": ["硬性要求 1", "硬性要求 2", ...],
  "nice_to_have": ["加分项 1", ...],
  "jd_requirements_parsed": [
    { "type": "tech" | "soft" | "tool" | "domain", "text": "..." }
  ],
  "match_highlights": [
    { "user_strength": "你简历里的什么", "jd_requirement": "JD 的哪条", "evidence": "为什么 match" }
  ],
  "gaps": [
    {
      "jd_requirement": "JD 要的什么",
      "why_gap": "用户为什么缺",
      "fixable": "易补<2周" | "中等1-2月" | "难补≥3月"
    }
  ],
  "priority_score": 1-5,
  "meta": {
    "mode": "${mode}",
    "confidence": "${mode === "full" ? "high" : "medium"}"
  }
}

priority_score:
- 5 = 现有简历就能投(命中 ≥ 80% must_have)
- 4 = 可冲,补 1-2 个 gap
- 3 = 中等,需要补 3-5 个 gap
- 2 = 差距大,需要专项项目
- 1 = 不建议短期内冲

返 JSON。`;
}

function buildUserPromptFull(jdText: string, parsedResume: unknown): string {
  return `目标 JD 文本:
---JD 开始---
${jdText}
---JD 结束---

用户简历(结构化):
${JSON.stringify(parsedResume, null, 2)}

返 JSON。`;
}

function buildUserPromptRole(
  roleName: string,
  company: string | undefined,
  parsedResume: unknown
): string {
  return `用户没给完整 JD,只说目标岗位是:
- 岗位名: ${roleName}
${company ? `- 公司: ${company}` : "- 公司: (未指定)"}

请基于行业通用知识推断该岗位的 must_have / nice_to_have(明确这是 generic,不是 JD-specific)。

用户简历(结构化):
${JSON.stringify(parsedResume, null, 2)}

返 JSON。jd_summary 输出层不能含公司名。`;
}

// ============ Normalize ============

type JdReq = { type?: unknown; text?: unknown };
type HighlightLike = {
  user_strength?: unknown;
  jd_requirement?: unknown;
  evidence?: unknown;
};
type GapLike = {
  jd_requirement?: unknown;
  why_gap?: unknown;
  fixable?: unknown;
};

const VALID_REQ_TYPES = ["tech", "soft", "tool", "domain"] as const;
const VALID_FIXABLE = ["易补<2周", "中等1-2月", "难补≥3月"] as const;

function normalizeReqs(arr: unknown): { type: string; text: string }[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((r) => {
      const rl = r as JdReq;
      const type =
        VALID_REQ_TYPES.includes(rl.type as (typeof VALID_REQ_TYPES)[number])
          ? (rl.type as string)
          : "domain";
      return { type, text: String(rl.text ?? "") };
    })
    .filter((r) => r.text);
}

function normalizeHighlights(arr: unknown) {
  if (!Array.isArray(arr)) return [];
  return arr.map((h) => {
    const hl = h as HighlightLike;
    return {
      user_strength: String(hl.user_strength ?? ""),
      jd_requirement: String(hl.jd_requirement ?? ""),
      evidence: String(hl.evidence ?? ""),
    };
  });
}

function normalizeGaps(arr: unknown) {
  if (!Array.isArray(arr)) return [];
  return arr.map((g) => {
    const gl = g as GapLike;
    const fixableVal = String(gl.fixable ?? "中等1-2月");
    const fixable = VALID_FIXABLE.includes(
      fixableVal as (typeof VALID_FIXABLE)[number]
    )
      ? fixableVal
      : "中等1-2月";
    return {
      jd_requirement: String(gl.jd_requirement ?? ""),
      why_gap: String(gl.why_gap ?? ""),
      fixable,
    };
  });
}

// 简单脱敏(prompt 已强约束,这里再扫一遍兜底)— 不替换用户 evidence 里的公司名(那是用户数据)
function scrubCompanyInSummary(s: string): string {
  const SENSITIVE = ["字节跳动", "字节", "腾讯", "阿里", "阿里巴巴", "美团", "百度", "京东", "拼多多", "网易", "小米", "华为", "OPPO", "vivo", "滴滴", "快手", "蚂蚁", "Tencent", "Alibaba", "ByteDance"];
  let out = s;
  for (const word of SENSITIVE) {
    out = out.replaceAll(word, "某互联网大厂");
  }
  return out;
}

// ============ POST ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const mode = body.mode as string;

    // 快速模式:不调 LLM,直接返 null
    if (mode === "quick") {
      return NextResponse.json({
        jd_context: null,
        meta: { mode: "quick", confidence: "n/a" },
        message:
          "快速模式:Phase 5 将做通用 polish(narrative + ATS + 量化),不针对具体 JD 优化",
      });
    }

    if (mode !== "full" && mode !== "role") {
      return NextResponse.json(
        { error: "mode must be 'full' / 'role' / 'quick'" },
        { status: 400 }
      );
    }

    const parsedResume = body.parsedResume;
    if (!parsedResume) {
      return NextResponse.json(
        { error: "parsedResume required(请先完成 Phase 1)" },
        { status: 400 }
      );
    }

    let userPrompt: string;
    if (mode === "full") {
      const jdText = String(body.jdText ?? "").trim();
      if (!jdText) {
        return NextResponse.json(
          { error: "jdText required for mode=full" },
          { status: 400 }
        );
      }
      if (jdText.length > MAX_JD_LEN) {
        return NextResponse.json(
          { error: `JD 过长(> ${MAX_JD_LEN} 字)` },
          { status: 400 }
        );
      }
      userPrompt = buildUserPromptFull(jdText, parsedResume);
    } else {
      const roleName = String(body.roleName ?? "").trim();
      if (!roleName) {
        return NextResponse.json(
          { error: "roleName required for mode=role" },
          { status: 400 }
        );
      }
      const company = body.company ? String(body.company).trim() : undefined;
      userPrompt = buildUserPromptRole(roleName, company, parsedResume);
    }

    const phase2Ref = await loadPhase2Prompt();

    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt(phase2Ref, mode) },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat",
        temperature: 0.3,
        max_tokens: 2500,
        jsonMode: true,
      }
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("/api/m3/parse-jd — LLM JSON parse failed:", raw.slice(0, 500));
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw: raw.slice(0, 500) },
        { status: 502 }
      );
    }

    // 脱敏 + normalize
    const jdSummary = scrubCompanyInSummary(String(parsed.jd_summary ?? ""));
    const mustHave = Array.isArray(parsed.must_have)
      ? parsed.must_have.map(String).map(scrubCompanyInSummary)
      : [];
    const niceToHave = Array.isArray(parsed.nice_to_have)
      ? parsed.nice_to_have.map(String).map(scrubCompanyInSummary)
      : [];
    const jdReqs = normalizeReqs(parsed.jd_requirements_parsed).map((r) => ({
      ...r,
      text: scrubCompanyInSummary(r.text),
    }));
    const highlights = normalizeHighlights(parsed.match_highlights);
    const gaps = normalizeGaps(parsed.gaps);
    const priorityScore = Math.max(
      1,
      Math.min(5, Number(parsed.priority_score ?? 3))
    );
    const meta = (parsed.meta ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      jd_summary: jdSummary,
      must_have: mustHave,
      nice_to_have: niceToHave,
      jd_requirements_parsed: jdReqs,
      match_highlights: highlights,
      gaps,
      priority_score: priorityScore,
      meta: {
        mode,
        confidence: meta.confidence ?? (mode === "full" ? "high" : "medium"),
        parsed_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/parse-jd error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
