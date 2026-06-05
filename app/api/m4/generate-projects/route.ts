/**
 * POST /api/m4/generate-projects — 模块 4 · 基于 JD gap 生成 2-4 周可交付的补强项目
 *
 * Body:
 *   {
 *     gaps: { jd_requirement: string; why_gap: string; fixable?: string }[],
 *     targetRole?: string | null,
 *     targetCompany?: string | null,
 *     jdSummary?: string | null,
 *     parsedResumeBrief?: string | null,  // 简历前 500 字摘要,LLM 知道学生有什么基础
 *     n?: 2 | 3 | 4,
 *   }
 *
 * 返回:
 *   {
 *     projects: M4ProjectDraft[]  // 2-4 条,每条对应 1-2 个 gap
 *   }
 *
 * 反编造守则:
 *   - 项目 schema 不含"已完成结果"字段(committable / done_at 等都不返回,由前端在 status="DONE" 后补)
 *   - weekly_plan 是计划骨架,LLM 不能在里面塞"已完成 N 次访谈"这种事实
 *   - 不出具体公司名 / 产品名(plan §3 公平边界)
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type { M4ProjectDraft } from "@/lib/m4-types";

type Gap = { jd_requirement: string; why_gap: string; fixable?: string };

type RequestBody = {
  gaps?: Gap[];
  targetRole?: string | null;
  targetCompany?: string | null;
  jdSummary?: string | null;
  parsedResumeBrief?: string | null;
  n?: 2 | 3 | 4;
};

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」模块 4 的项目设计师。学生在简历优化(M3)阶段被识别出几个 JD gap(技能/经验缺口),你的任务是**基于这些 gap 设计 2-4 个可在 2-4 周内独立完成的补强项目**,让学生既学到能力,也能在简历上加一段真实可解释的经历。

【★ 核心原则 ★】
1. **项目必须能直接补至少一个 gap** — title / why 必须明确说"这个项目补什么 gap"
2. **2-4 周可独立完成** — 不允许"6 个月才能见效"或"需要老师指导"的项目
3. **产出物可证明** — deliverables 必须是能拿出来的东西(数据集 / Dashboard 截图 / PRD / 复盘报告 / Prompt 评测集 / 访谈纪要 / 看板 link 等)
4. **指标字典必填** — metrics_dictionary 列出项目要追踪的关键指标,每条带定义和数据来源,让学生知道"做完后能讲出哪些数字"

【反编造硬约束 — 永远不许违反】
1. **永远不输出公司名 / 产品名 / 学校名**
   - 不要用"做字节 / 阿里 / 字节抖音的竞品分析",改成"做 1 个互联网大厂内容平台的竞品分析"
   - 不要用"参加清华大学创业大赛",改成"参加校园 / 全国大学生创业类比赛"
2. **不允许在 weekly_plan 里塞"已完成"事实**
   - 错:"Day 5 · 已完成第一轮访谈 5 人,反馈整理完毕"
   - 对:"Day 5 · 第一轮访谈(预计 3-5 人,每人 20-30 分钟),收集开放问题反馈"
3. **不允许写"成果将达到 N%"这种承诺**
   - 错:"完成后可使简历命中率提升 30%"
   - 对:"完成后简历可补充该 gap 对应的实战 bullet 1-2 条"
4. **资源不能编造** — 如果引用书 / 课程,只允许写"可查找该类资源",不写具体书名 / 老师名

【项目类型偏好(按 gap 类型映射)】
- **数据 / SQL / Excel / BI 类 gap** → 推荐做"漏斗分析看板 / 留存复盘看板 / A/B 实验设计草案"
- **用户研究 / 访谈类 gap** → 推荐做"用户访谈实战项目(5-10 个目标用户) + 访谈结构 + 洞察纪要"
- **AI 工具 / Prompt 工程类 gap** → 推荐做"Prompt 评测集 / 简历解析评测 / 失败案例分析"
- **运营 / 活动 / 拉新类 gap** → 推荐做"校园 / 社群活动复盘报告 + 转化漏斗分析"
- **跨团队沟通 / 协作类 gap** → 推荐做"协作流程设计 / 项目复盘文档 / SOP 草案"
- **产品 / PRD 类 gap** → 推荐做"竞品分析 + 1 份 PRD 草案 + 用户故事地图"
- **技术 / 编码类 gap** → 推荐做"小工具开源(数据爬虫 / 自动化脚本 / 简易 Web 工具)"

【★ 多样性约束 ★】
- 多个项目时,**至少有 2 种不同类型**(避免全都是"做用户访谈"或全都是"做 Dashboard")
- 优先级:补 must-have gap 的项目排前,补 nice-to-have 的排后

【输出格式 — 严格 JSON】
返回 { "projects": [...] },每个 project:
{
  "source_gaps": [{ "jd_requirement": "...", "why_gap": "..." }],
  "target_role": null | "<不变,客户端会传>",
  "target_company": null,
  "title": "<≤ 24 字,具体场景化>",
  "why": "<≤ 120 字,解释为什么这个项目能补这些 gap>",
  "weeks": 2 | 3 | 4,
  "weekly_plan": [
    {
      "week": 1,
      "goal": "<本周里程碑>",
      "tasks": [
        { "id": "w1-d1-<rand>", "day": "Day 1", "task": "...", "hours": "2h" },
        ...
      ]
    },
    ...
  ],
  "deliverables": ["<可拿出来的具体产出 1>", "<2>", ...],
  "metrics_dictionary": [
    { "name": "<指标名,中文>", "definition": "<定义>", "data_source": "<怎么采到这个数据>" }
  ],
  "skills_required": ["<技能 1>", "<技能 2>"]
}

【tasks.id 格式】严格 "w<week>-d<day_num>-<3-4 位随机>"(前端会用它跟踪进度,不能含中文/空格)。

【输出长度控制】总返回 JSON ≤ 8000 字符;每个 weekly_plan 的 tasks ≤ 5 条;deliverables ≤ 6 条;metrics_dictionary ≤ 5 条。`;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const gaps = Array.isArray(body.gaps) ? body.gaps : [];
  if (gaps.length === 0) {
    return NextResponse.json(
      {
        error:
          "缺少 gaps 输入。先去 M3 解析 JD 拿到 gaps,或手动写一条想补的能力缺口。",
      },
      { status: 400 },
    );
  }
  const n = body.n === 2 || body.n === 3 || body.n === 4 ? body.n : 3;
  const targetRole = body.targetRole?.trim() || "(未指定目标岗位)";
  const jdSummary = body.jdSummary?.trim() || "";
  const resumeBrief = body.parsedResumeBrief?.trim() || "";

  const userPrompt = `【目标岗位】${targetRole}

【JD 摘要】
${jdSummary || "(M3 未提供 JD 摘要)"}

【学生简历亮点 / 已有基础】
${resumeBrief || "(M3 未提供简历摘要,按通用学生水平设计项目难度)"}

【需要补的 JD gap】
${gaps
  .map(
    (g, i) =>
      `${i + 1}. ${g.jd_requirement}\n   - 缺口原因:${g.why_gap}${g.fixable ? `\n   - 可补方向:${g.fixable}` : ""}`,
  )
  .join("\n\n")}

【请生成】${n} 个补强项目,每个项目补 1-2 个 gap。严格按 system 输出 JSON。`;

  try {
    const raw = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat",
        temperature: 0.7,
        max_tokens: 4000,
        jsonMode: true,
      },
    );

    let parsed: { projects?: M4ProjectDraft[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "LLM 返回不是合法 JSON,请重试" },
        { status: 502 },
      );
    }

    const projects = Array.isArray(parsed?.projects) ? parsed.projects : [];
    if (projects.length === 0) {
      return NextResponse.json(
        { error: "LLM 没生成任何项目,请检查 gap 输入" },
        { status: 502 },
      );
    }

    // 客户端传的 targetRole/Company 透传到每个项目(防止 LLM 编造或漏字段)
    const normalized = projects.slice(0, 4).map((p) => ({
      ...p,
      target_role: body.targetRole ?? null,
      target_company: body.targetCompany ?? null,
      // 防御性补全
      source_gaps: Array.isArray(p.source_gaps) ? p.source_gaps : [],
      weekly_plan: Array.isArray(p.weekly_plan) ? p.weekly_plan : [],
      deliverables: Array.isArray(p.deliverables) ? p.deliverables : [],
      metrics_dictionary: Array.isArray(p.metrics_dictionary)
        ? p.metrics_dictionary
        : [],
      skills_required: Array.isArray(p.skills_required) ? p.skills_required : [],
    }));

    return NextResponse.json({ projects: normalized });
  } catch (err) {
    console.error("[m4/generate-projects] LLM error", err);
    const message = err instanceof Error ? err.message : "LLM 调用失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
