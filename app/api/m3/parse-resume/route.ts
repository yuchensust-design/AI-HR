/**
 * POST /api/m3/parse-resume — 模块 3 Phase 1 简历解析
 *
 * Body: { resumeText: string }
 *
 * 流程:
 *   Step 1 prompt 嵌入 lib/prompts/skill-matching-refs/question-batteries.md §Phase 1 解析步骤
 *   Step 2 DeepSeek jsonMode 调用 → 结构化 JSON
 *   Step 3 normalize 兜底 + 给每条 bullet 标 narrative_tag(喂 Phase 5 路由)
 *
 * 返回:
 *   {
 *     basic, education[], experience[], projects[], activities[], skills,
 *     meta: { parse_quality, missing_critical[], narrative_tag_distribution }
 *   }
 *
 * 硬约束:
 *   - Anti-fabrication:缺失字段输出 null,绝不编造
 *   - 公司名只在 input 出现 OK,output 里 jd_summary 等没,但 parse-resume 输出含用户真实公司名是 OK 的
 *
 * plan §A.1 Phase 1 + Step 0.5 A/B 实验 lock(narrative_tag 喂路由器)
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";

const MAX_RESUME_LEN = 20000; // 20KB 文本,足够 1-2 页简历

// 缓存主框架 Phase 1 prompt 段(读 1 次)
let phase1PromptCache: string | null = null;
async function loadPhase1Prompt(): Promise<string> {
  if (phase1PromptCache) return phase1PromptCache;
  const filepath = path.join(
    process.cwd(),
    "lib/prompts/skill-matching-refs/question-batteries.md"
  );
  try {
    const full = await fs.readFile(filepath, "utf-8");
    // 抽取 Phase 1 section
    const match = full.match(
      /## Phase 1: 简历识别 \+ 解析[\s\S]*?(?=\n## Phase 2:|\n---)/
    );
    phase1PromptCache = match ? match[0] : "";
    return phase1PromptCache;
  } catch {
    return ""; // 没读到也不阻塞,主 prompt 已 self-contained
  }
}

function buildSystemPrompt(phase1Ref: string): string {
  return `你是「Offer 捕手」模块 3 简历整理 skill 的 Phase 1 解析引擎。

【任务】
把用户的简历 raw text(粘贴 / PDF/Word 提取后)解析成结构化 JSON。同时给每条 bullet 标 narrative_tag,用于后续 Phase 5 路由决策。

【参考主框架 Phase 1 解析步骤】
${phase1Ref || "(主框架文件未加载,按下方 schema 严格执行)"}

【硬约束 — 永远不违反】
1. Anti-fabrication:简历里没有的字段一律输出 null,**绝不编造数字 / metric / 学校 / 公司名**
2. 用户真实公司 / 学校名 OK 保留(parse-resume 是解析,不是脱敏;脱敏在 Phase 2/5 输出层做)
3. 文案温和,不评判用户简历质量

【narrative_tag 分类规则(每条 bullet 必标 1 个)】
- "responsibility_driven":开头是"负责" "协助" "参与" "完成" 等职责陈述,无成果数字
- "lacks_metric":有动作但缺量化(eg "做了用户调研" — 没说几个 / 多久 / 转化)
- "vague_action":动词偏弱(eg "做" "完成" "实现"),不是强动词(主导 / 设计 / 优化)
- "strong":STAR / X-Y-Z 完整(动作 + 量化 + 影响),无需重写

【输出格式 — 严格 JSON,无 markdown 包裹】
{
  "basic": {
    "name": string | null,
    "phone": string | null,
    "email": string | null,
    "school": string | null,
    "major": string | null,
    "year_level": string | null,
    "gpa": string | null
  },
  "education": [
    { "school": string, "major": string, "period": string, "gpa": string | null, "courses": string[] }
  ],
  "experience": [
    {
      "org": string,
      "role": string,
      "period": string,
      "bullets": [
        { "text": string, "narrative_tag": "responsibility_driven" | "lacks_metric" | "vague_action" | "strong" }
      ]
    }
  ],
  "projects": [
    {
      "name": string,
      "period": string,
      "role": string | null,
      "tech_stack": string[],
      "bullets": [{ "text": string, "narrative_tag": "..." }]
    }
  ],
  "activities": [
    {
      "org": string,
      "role": string,
      "period": string,
      "bullets": [{ "text": string, "narrative_tag": "..." }]
    }
  ],
  "skills": {
    "languages": string[],
    "frameworks": string[],
    "tools": string[],
    "domain": string[]
  },
  "meta": {
    "parse_quality": "good" | "partial" | "low",
    "missing_critical": string[]
  }
}

parse_quality 判定:
- good = 基本信息 + 至少 1 段经历 + 至少 1 个项目 全有
- partial = 基本信息全,经历或项目至少 1 个
- low = 基本信息有缺失,或经历项目都没识别出

返 JSON。`;
}

function buildUserPrompt(resumeText: string): string {
  return `下面是用户简历的 raw text。请按 schema 解析并返 JSON。

---简历开始---
${resumeText}
---简历结束---

返 JSON。`;
}

// ============ Normalize 兜底(参考 m1 recommend normalizedNegative 模式) ============

type BulletLike = { text?: unknown; narrative_tag?: unknown };

const VALID_TAGS = ["responsibility_driven", "lacks_metric", "vague_action", "strong"] as const;
type NarrativeTag = (typeof VALID_TAGS)[number];

function normalizeBullet(b: unknown): { text: string; narrative_tag: NarrativeTag } {
  if (typeof b === "string") {
    return { text: b, narrative_tag: heuristicTag(b) };
  }
  const bl = b as BulletLike;
  const text = typeof bl.text === "string" ? bl.text : String(bl.text ?? "");
  const tag = VALID_TAGS.includes(bl.narrative_tag as NarrativeTag)
    ? (bl.narrative_tag as NarrativeTag)
    : heuristicTag(text);
  return { text, narrative_tag: tag };
}

function heuristicTag(text: string): NarrativeTag {
  const t = text.trim();
  if (/^(负责|协助|参与|完成)/.test(t)) return "responsibility_driven";
  if (!/\d/.test(t)) return "lacks_metric";
  if (/^(做了|完成|实现|搞了)/.test(t)) return "vague_action";
  return "strong";
}

function normalizeBullets(arr: unknown): { text: string; narrative_tag: NarrativeTag }[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeBullet);
}

type ExperienceLike = {
  org?: unknown;
  role?: unknown;
  period?: unknown;
  bullets?: unknown;
};

function normalizeExperienceArray(arr: unknown) {
  if (!Array.isArray(arr)) return [];
  return arr.map((e) => {
    const el = e as ExperienceLike;
    return {
      org: String(el.org ?? ""),
      role: String(el.role ?? ""),
      period: String(el.period ?? ""),
      bullets: normalizeBullets(el.bullets),
    };
  });
}

type ProjectLike = {
  name?: unknown;
  period?: unknown;
  role?: unknown;
  tech_stack?: unknown;
  bullets?: unknown;
};

function normalizeProjectArray(arr: unknown) {
  if (!Array.isArray(arr)) return [];
  return arr.map((p) => {
    const pl = p as ProjectLike;
    return {
      name: String(pl.name ?? ""),
      period: String(pl.period ?? ""),
      role: pl.role ? String(pl.role) : null,
      tech_stack: Array.isArray(pl.tech_stack) ? pl.tech_stack.map(String) : [],
      bullets: normalizeBullets(pl.bullets),
    };
  });
}

function computeTagDistribution(
  experience: ReturnType<typeof normalizeExperienceArray>,
  projects: ReturnType<typeof normalizeProjectArray>,
  activities: ReturnType<typeof normalizeExperienceArray>
) {
  const allBullets = [
    ...experience.flatMap((e) => e.bullets),
    ...projects.flatMap((p) => p.bullets),
    ...activities.flatMap((a) => a.bullets),
  ];
  const total = allBullets.length;
  if (total === 0) {
    return {
      total,
      responsibility_driven: 0,
      lacks_metric: 0,
      vague_action: 0,
      strong: 0,
    };
  }
  const dist = { responsibility_driven: 0, lacks_metric: 0, vague_action: 0, strong: 0 };
  for (const b of allBullets) {
    dist[b.narrative_tag] += 1;
  }
  return {
    total,
    responsibility_driven: +(dist.responsibility_driven / total).toFixed(2),
    lacks_metric: +(dist.lacks_metric / total).toFixed(2),
    vague_action: +(dist.vague_action / total).toFixed(2),
    strong: +(dist.strong / total).toFixed(2),
  };
}

// ============ POST ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const resumeText = String(body.resumeText ?? "").trim();

    if (!resumeText) {
      return NextResponse.json(
        { error: "resumeText required" },
        { status: 400 }
      );
    }
    if (resumeText.length > MAX_RESUME_LEN) {
      return NextResponse.json(
        { error: `简历过长(> ${MAX_RESUME_LEN} 字),请精简后再粘贴` },
        { status: 400 }
      );
    }

    const phase1Ref = await loadPhase1Prompt();

    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt(phase1Ref) },
        { role: "user", content: buildUserPrompt(resumeText) },
      ],
      {
        model: "chat",
        temperature: 0.2, // 解析任务低温
        max_tokens: 3000,
        jsonMode: true,
      }
    );

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("/api/m3/parse-resume — LLM JSON parse failed:", raw.slice(0, 500));
      return NextResponse.json(
        { error: "LLM 返回格式异常,请重试", raw: raw.slice(0, 500) },
        { status: 502 }
      );
    }

    // Normalize
    const basic = (parsed.basic ?? {}) as Record<string, unknown>;
    const education = Array.isArray(parsed.education) ? parsed.education : [];
    const experience = normalizeExperienceArray(parsed.experience);
    const projects = normalizeProjectArray(parsed.projects);
    const activities = normalizeExperienceArray(parsed.activities);
    const skills = (parsed.skills ?? {}) as Record<string, unknown>;
    const metaIn = (parsed.meta ?? {}) as Record<string, unknown>;

    const tagDistribution = computeTagDistribution(experience, projects, activities);

    return NextResponse.json({
      basic: {
        name: basic.name ?? null,
        phone: basic.phone ?? null,
        email: basic.email ?? null,
        school: basic.school ?? null,
        major: basic.major ?? null,
        year_level: basic.year_level ?? null,
        gpa: basic.gpa ?? null,
      },
      education,
      experience,
      projects,
      activities,
      skills: {
        languages: Array.isArray(skills.languages) ? skills.languages : [],
        frameworks: Array.isArray(skills.frameworks) ? skills.frameworks : [],
        tools: Array.isArray(skills.tools) ? skills.tools : [],
        domain: Array.isArray(skills.domain) ? skills.domain : [],
      },
      meta: {
        parse_quality: ["good", "partial", "low"].includes(metaIn.parse_quality as string)
          ? metaIn.parse_quality
          : tagDistribution.total > 0
          ? "partial"
          : "low",
        missing_critical: Array.isArray(metaIn.missing_critical) ? metaIn.missing_critical : [],
        narrative_tag_distribution: tagDistribution,
        parsed_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/parse-resume error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
