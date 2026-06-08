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
import { canonicalizeKeyword } from "@/lib/keyword-match";

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

// ============ JD 关键词抽取(独立 LLM 调用,只看 JD,不看简历)============
//
// keyword-fix 2026-06-07:关键词命中"不准 + 不一致"两个 bug 的根治。
//   - 旧逻辑在 diff-metrics 里让 LLM"扩展到 30-50 个 token"+ 同 prompt 塞了简历技能
//     → 凑数 + 把简历词漏当 JD 词 + 每次现生成不可复现
//   - 新逻辑:这里 JD-only prompt + temperature 0 + 不凑数,一次性抽好存住
//     命中判定改到前端 lib/keyword-match.ts 用代码做(确定性)
async function extractJdKeywords(
  mode: "full" | "role",
  jdText: string,
  roleName: string,
  company: string | undefined
): Promise<string[]> {
  const source =
    mode === "full"
      ? `JD 文本:\n---\n${jdText}\n---`
      : `目标岗位:${roleName}${company ? ` @ ${company}` : ""}\n(无完整 JD,基于该岗位行业通用要求,列招聘方常看重的核心硬技能/工具/方法/概念)`;

  const sys = `你是 JD 关键词抽取器。从下面内容抽出"招聘方真正要求或看重的核心关键词"——技能、工具、方法、领域概念、关键职责动作。

【铁律 — 违反即失败】
1. 只抽 JD 里真实出现或明确要求的词;**绝不扩展同义词,绝不脑补 JD 没提到的技能/工具**
2. **不硬凑数量**:JD 有几个核心词就给几个(通常 8~25 个),宁缺毋滥
3. 每个关键词是简洁概念(2~12 字),如"用户访谈""A/B测试""SQL""产品规划""PRD";**不要整句、不要解释**
4. 允许把 JD 原文里的表达规整成招聘中更常见、可评估的标准关键词,但前提是**不改变原意**
   例如:
   - "负责调研用户需求" → "需求调研"
   - "输出原型并推进迭代" → "原型绘制"、"产品迭代"
   - "熟练使用 Axure/Figma" → "产品设计工具"
   - "能与研发协作推进落地" → "开发跟进"、"团队协作"
5. 不含公司名;去重;按 JD 里的重要性大致排序

返 JSON:{ "keywords": ["关键词1", "关键词2", ...] }`;

  try {
    const raw = await chat(
      [
        { role: "system", content: sys },
        { role: "user", content: source },
      ],
      { model: "chat", temperature: 0, max_tokens: 800, jsonMode: true }
    );
    const parsed = JSON.parse(raw) as { keywords?: unknown };
    if (!Array.isArray(parsed.keywords)) return [];
    return parsed.keywords
      .map((k) => canonicalizeKeyword(scrubCompanyInSummary(String(k).trim())))
      .filter((k) => k.length >= 2 && k.length <= 20);
  } catch (e) {
    console.error("[parse-jd] extractJdKeywords failed:", e);
    return [];
  }
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

    // 主匹配分析 + JD 关键词抽取 并行(关键词抽取是独立 JD-only 调用,不看简历)
    const jdTextForKw = mode === "full" ? String(body.jdText ?? "").trim() : "";
    const roleNameForKw = mode === "role" ? String(body.roleName ?? "").trim() : "";
    const companyForKw = body.company ? String(body.company).trim() : undefined;

    const [raw, jdKeywords] = await Promise.all([
      chat(
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
      ),
      extractJdKeywords(mode, jdTextForKw, roleNameForKw, companyForKw),
    ]);

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
      // 确定性关键词清单(只忠于 JD,前端用 lib/keyword-match.ts 算命中)
      jd_keywords: jdKeywords,
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
