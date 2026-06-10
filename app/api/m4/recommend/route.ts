/**
 * POST /api/m4/recommend — 模块 4 · 分档推荐(两步管道第②步)
 *
 * 吃 analyze-gaps 产出的(已勾选)gaps + 用户选的时间档,按 ROI 出高性价比方案:
 *   - sprint(冲刺 3-7天)→ LearningCard[]:看书/视频快速补概念 + 轻量可验证产出(不硬塞项目)
 *   - standard(标准 2-4周)→ ProjectCard[]:按天拆的 end-to-end 小项目
 *   - deep(深耕 1-2月+)→ ProjectCard[]:按周拆、带迭代的深项目
 *
 * 复用 bridge skill 方法论:project-archetypes 种子库 + 学习资源(反幻觉)+ Skeptical Recruiter 风险自检。
 *
 * Body:
 *   {
 *     timeTier: "sprint" | "standard" | "deep",
 *     gaps: ScoredGap[],          // 用户勾选要攻的(已带 impact / fixable_in)
 *     targetRole?: string,
 *     parsedResumeBrief?: string, // 简历摘要(≤500字)
 *   }
 * 返回:
 *   sprint   → { cards: M4LearningDraftCore[] }
 *   standard/deep → { projects: M4ProjectDraftCore[] }
 */

import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type {
  ScoredGap,
  TimeTier,
  M4ProjectDraftCore,
  M4LearningDraftCore,
  M4Resource,
} from "@/lib/m4-types";

export const maxDuration = 60;

type RequestBody = {
  timeTier: TimeTier;
  gaps: ScoredGap[];
  targetRole?: string;
  parsedResumeBrief?: string;
};

// —— 按角色项目种子库(bridge skill 复用)——
let archetypesCache: string | null = null;
async function loadArchetypes(): Promise<string> {
  if (archetypesCache !== null) return archetypesCache;
  const fp = path.join(
    process.cwd(),
    "lib/prompts/skill-designing-bridge-refs/project-archetypes.md",
  );
  try {
    archetypesCache = await fs.readFile(fp, "utf-8");
  } catch {
    archetypesCache = "";
  }
  return archetypesCache;
}

// ROI:impact 降序;过滤到本档能补的;同分保持原序。high-impact 但本档补不了的留作诚实提示。
function rankGaps(gaps: ScoredGap[], tier: TimeTier): {
  picked: ScoredGap[];
  unfixable: ScoredGap[];
} {
  const sorted = [...gaps].sort((a, b) => b.impact - a.impact);
  const fixable = sorted.filter((g) => g.fixable_in?.[tier]);
  const unfixable = sorted.filter(
    (g) => !g.fixable_in?.[tier] && g.impact >= 4,
  );
  const topN = tier === "deep" ? 3 : 2;
  return { picked: (fixable.length ? fixable : sorted).slice(0, topN), unfixable };
}

const ANTI_FAB = `【反编造 — 永不违反】
1. 不输出公司名 / 产品名 / 学校名
2. 计划里写"计划做什么",不能写"已完成 N 次访谈"这种事实
3. 不承诺具体成果数字("可提升 30%"→禁止)
4. 学习资源**只推荐你确实记得存在的**(知名书 / 知名课 / 官方文档);不确定 URL 就只给名字 + 内容方向,绝不编造资源名/链接`;

function gapsBlock(gaps: ScoredGap[]): string {
  return gaps
    .map(
      (g, i) =>
        `${i + 1}. ${g.jd_requirement}(覆盖:${g.current_coverage} · impact ${g.impact})— ${g.why_matters}`,
    )
    .join("\n");
}

// —— sprint:学习卡 ——
function buildLearningSystem(archetypes: string): string {
  return `你是「Offer 捕手」模块 4 的补强设计师。用户只有 **3-7 天(冲刺档)**,时间太短做不出像样项目,所以你设计的是**学习型快速补强**:用看书/看视频/读文档快速补上相关概念,产出一个轻量但可验证的东西(一页总结 / 一条帖 / 一份笔记)。

【冲刺档硬规则】
- 针对给定的 1-2 个 gap,每个 gap 出 1 张学习卡(共 1-2 张)
- concepts:3-6 个该 gap 下最该先搞懂的核心概念
- resources:2-3 个针对性资源(优先免费 + 中文;英文标注 lang:"en")
- micro_deliverable:3-7 天内能真做出的轻量可验证产出(一页概念总结 / 一条知乎/小红书帖 / 一份带截图的笔记)
- honest_use:诚实说明这在简历/面试里只能写成"了解/入门级 + 轻量产出",**不是"做过项目"**
- est_hours:预估总投入(如 "6-10h")
- 不要输出 weekly_plan / 周计划 —— 这是学习卡不是项目

【资源种子库(按角色,挑相关的改造)】
${archetypes || "(种子库未加载,用你的通用知识,严格遵守反幻觉)"}

${ANTI_FAB}

【输出 — 严格 JSON,无 markdown】
{
  "cards": [
    {
      "kind": "learning",
      "covers_gaps": ["对应的 jd_requirement"],
      "title": "≤20字,如:快速补 A/B 测试基础",
      "why": "≤100字 为什么这张卡能补这些 gap",
      "concepts": ["核心概念1", "..."],
      "resources": [ { "type":"book"|"video"|"doc", "title":"", "note":"为什么相关+看哪部分", "url":"(可选)", "lang":"zh"|"en" } ],
      "micro_deliverable": "3-7天能产出的轻量可验证东西",
      "est_hours": "6-10h",
      "honest_use": "诚实落点:只能写成了解/入门级"
    }
  ]
}
返 JSON。`;
}

// —— standard / deep:项目卡 ——
function buildProjectSystem(tier: "standard" | "deep", archetypes: string): string {
  const dial =
    tier === "standard"
      ? `【标准档(2-4周)硬规则】
- 出 1-2 个项目,每个 2-4 周可独立完成
- plan_unit = "day"(按天拆);weeks 取 2-4;weekly_plan 每周 goal + 3-5 个 Day 粒度 task
- deliverables 1-2 个;metrics_dictionary 2-3 个;技术拉伸 ≤1 级(最多 1 个新工具)`
      : `【深耕档(1-2月+)硬规则】
- 出 1 个有迭代深度的项目(最多 2 个),5-8 周
- plan_unit = "week"(按周拆里程碑);weeks 取 5-8;weekly_plan 每周 goal + 2-4 个偏里程碑的 task(不必到天)
- deliverables 2-3 个 + 至少一项体现"迭代/真实用户/评测"的证据;metrics_dictionary 3-5 个;可含 1 个新框架(仍 ≤1 级拉伸基础上)`;

  return `你是「Offer 捕手」模块 4 的项目设计师。基于给定 gap 设计可独立完成、做完能写进简历的补强项目。

${dial}

【Skeptical Recruiter 自检(必做)】
每个项目末尾,扮演怀疑用户能否完成的 HR,给 1-3 条最尖锐的风险(时间/技术/真实用户从哪来等),每条配一句 mitigation,写进 risks[]。

【学习资源】
每个项目给 1-3 个项目内要学/查的资源(learning_resources),规则同下种子库 + 反幻觉。

【资源/项目种子库(按角色,挑相关的改造,不要照搬)】
${archetypes || "(种子库未加载,用你的通用知识)"}

${ANTI_FAB}

【tasks.id 格式】严格 "w<week>-d<序号>-<3-4位随机>",不含中文/空格(前端用它跟踪进度)。
【输出长度】总 JSON ≤ 8000 字符。

【输出 — 严格 JSON,无 markdown】
{
  "projects": [
    {
      "kind": "project",
      "source_gaps": [ { "jd_requirement": "...", "why_gap": "..." } ],
      "target_role": null,
      "target_company": null,
      "title": "≤24字,具体场景化",
      "why": "≤120字 为什么这项目能补这些 gap",
      "weeks": ${tier === "standard" ? "2|3|4" : "5|6|7|8"},
      "plan_unit": "${tier === "standard" ? "day" : "week"}",
      "weekly_plan": [
        { "week": 1, "goal": "本周里程碑", "tasks": [ { "id":"w1-d1-a1b2", "day":"${tier === "standard" ? "Day 1" : "Week 1"}", "task":"...", "hours":"2h" } ] }
      ],
      "deliverables": ["可拿出来的具体产出"],
      "metrics_dictionary": [ { "name":"指标名", "definition":"定义", "data_source":"数据来源" } ],
      "skills_required": ["技能"],
      "risks": [ { "risk":"尖锐风险", "mitigation":"缓解" } ],
      "learning_resources": [ { "type":"book"|"video"|"doc", "title":"", "note":"", "url":"(可选)", "lang":"zh"|"en" } ]
    }
  ]
}
返 JSON。`;
}

function buildUserPrompt(
  tier: TimeTier,
  picked: ScoredGap[],
  unfixable: ScoredGap[],
  targetRole: string | undefined,
  resumeBrief: string | undefined,
): string {
  const roleLine = targetRole ? `目标岗位:${targetRole}` : "目标岗位:(未指定)";
  const resumeLine = resumeBrief
    ? `\n[简历摘要]\n${resumeBrief}`
    : "\n[简历摘要] 用户未提供,按通用情况设计。";
  const unfixableLine =
    unfixable.length > 0
      ? `\n\n[注意] 以下高 impact 缺口在本时间档内做不出可信证据,请在设计时忽略它们做项目/学习卡,但你可以在 why 或后续提醒里诚实点到:\n${unfixable.map((g) => `- ${g.jd_requirement}`).join("\n")}`
      : "";
  return `${roleLine}
时间档:${tier}
${resumeLine}

要攻的缺口(已按 ROI 选好,请只针对这些设计):
${gapsBlock(picked)}${unfixableLine}

返 JSON。`;
}

// —— normalize ——
function normResource(r: Record<string, unknown>): M4Resource {
  const t = r.type === "video" || r.type === "doc" ? r.type : "book";
  const lang = r.lang === "en" ? "en" : "zh";
  return {
    type: t as "book" | "video" | "doc",
    title: String(r.title ?? ""),
    note: String(r.note ?? ""),
    ...(r.url ? { url: String(r.url) } : {}),
    lang: lang as "zh" | "en",
  };
}

function normLearning(c: Record<string, unknown>): M4LearningDraftCore {
  return {
    kind: "learning",
    covers_gaps: Array.isArray(c.covers_gaps) ? c.covers_gaps.map(String) : [],
    title: String(c.title ?? "补强"),
    why: String(c.why ?? ""),
    concepts: Array.isArray(c.concepts) ? c.concepts.map(String) : [],
    resources: Array.isArray(c.resources)
      ? (c.resources as Record<string, unknown>[]).map(normResource)
      : [],
    micro_deliverable: String(c.micro_deliverable ?? ""),
    est_hours: String(c.est_hours ?? ""),
    honest_use: String(c.honest_use ?? ""),
  };
}

function normProject(p: Record<string, unknown>, tier: "standard" | "deep"): M4ProjectDraftCore {
  const planUnit = p.plan_unit === "week" || p.plan_unit === "day"
    ? (p.plan_unit as "day" | "week")
    : tier === "deep"
      ? "week"
      : "day";
  const weeksNum = Number(p.weeks);
  return {
    kind: "project",
    source_gaps: Array.isArray(p.source_gaps)
      ? (p.source_gaps as Record<string, unknown>[]).map((g) => ({
          jd_requirement: String(g.jd_requirement ?? ""),
          why_gap: String(g.why_gap ?? ""),
        }))
      : [],
    target_role: typeof p.target_role === "string" ? p.target_role : null,
    target_company: null,
    title: String(p.title ?? "补强项目"),
    why: String(p.why ?? ""),
    weeks: Number.isFinite(weeksNum) && weeksNum > 0 ? weeksNum : tier === "deep" ? 6 : 3,
    plan_unit: planUnit,
    weekly_plan: Array.isArray(p.weekly_plan) ? (p.weekly_plan as M4ProjectDraftCore["weekly_plan"]) : [],
    deliverables: Array.isArray(p.deliverables) ? p.deliverables.map(String) : [],
    metrics_dictionary: Array.isArray(p.metrics_dictionary)
      ? (p.metrics_dictionary as M4ProjectDraftCore["metrics_dictionary"])
      : [],
    skills_required: Array.isArray(p.skills_required) ? p.skills_required.map(String) : [],
    risks: Array.isArray(p.risks)
      ? (p.risks as Record<string, unknown>[]).map((r) => ({
          risk: String(r.risk ?? ""),
          mitigation: String(r.mitigation ?? ""),
        }))
      : [],
    learning_resources: Array.isArray(p.learning_resources)
      ? (p.learning_resources as Record<string, unknown>[]).map(normResource)
      : [],
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const { timeTier, gaps, targetRole, parsedResumeBrief } = body;

    if (timeTier !== "sprint" && timeTier !== "standard" && timeTier !== "deep") {
      return NextResponse.json({ error: "timeTier 不合法" }, { status: 400 });
    }
    if (!Array.isArray(gaps) || gaps.length === 0) {
      return NextResponse.json({ error: "gaps 不能为空" }, { status: 400 });
    }

    const { picked, unfixable } = rankGaps(gaps, timeTier);
    const archetypes = await loadArchetypes();
    const userPrompt = buildUserPrompt(timeTier, picked, unfixable, targetRole, parsedResumeBrief);

    if (timeTier === "sprint") {
      const raw = await chat(
        [
          { role: "system", content: buildLearningSystem(archetypes) },
          { role: "user", content: userPrompt },
        ],
        { model: "chat", temperature: 0.7, max_tokens: 3000, jsonMode: true },
      );
      let parsed: { cards?: unknown };
      try {
        parsed = JSON.parse(raw);
      } catch {
        console.error("[m4/recommend] sprint JSON parse failed:", raw.slice(0, 500));
        return NextResponse.json({ error: "返回格式异常,请重试" }, { status: 502 });
      }
      const cards = Array.isArray(parsed.cards)
        ? (parsed.cards as Record<string, unknown>[]).map(normLearning).filter((c) => c.title)
        : [];
      if (cards.length === 0) {
        return NextResponse.json({ error: "未生成有效学习卡,请重试" }, { status: 502 });
      }
      return NextResponse.json({ cards });
    }

    // standard / deep
    const raw = await chat(
      [
        { role: "system", content: buildProjectSystem(timeTier, archetypes) },
        { role: "user", content: userPrompt },
      ],
      { model: "chat", temperature: 0.7, max_tokens: 4000, jsonMode: true },
    );
    let parsed: { projects?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[m4/recommend] project JSON parse failed:", raw.slice(0, 500));
      return NextResponse.json({ error: "返回格式异常,请重试" }, { status: 502 });
    }
    const projects = Array.isArray(parsed.projects)
      ? (parsed.projects as Record<string, unknown>[])
          .map((p) => normProject(p, timeTier))
          .filter((p) => p.title)
      : [];
    if (projects.length === 0) {
      return NextResponse.json({ error: "未生成有效项目,请重试" }, { status: 502 });
    }
    return NextResponse.json({ projects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[m4/recommend] error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
