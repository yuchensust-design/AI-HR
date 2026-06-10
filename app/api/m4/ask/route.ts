/**
 * POST /api/m4/ask — 模块 4 · Ask AI(基于项目上下文回答学生问题)
 *
 * Body:
 *   {
 *     project: M4Project,        // 当前项目卡(含 title / why / weekly_plan / metrics_dictionary)
 *     question: string,          // 用户问题(eg "我访谈时用户答得很笼统怎么办")
 *     userNotes?: string | null  // 用户已记的项目笔记(可选,让 AI 知道当前进展)
 *   }
 *
 * 返回:
 *   { answer: string }
 *
 * 反编造守则:
 *   - AI 回答里不允许假设用户"已经访谈了 N 人 / 已收集 X 条反馈" — 必须以"你提到的问题是 X,我建议..."这种基于用户实际输入的方式回答
 *   - 不允许编造工具 / 资源链接(说"用 XX 软件"而不说"用 XX 软件,下载链接是 ..."除非用户在 question 里给出)
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type { M4Project } from "@/lib/m4-types";

type RequestBody = {
  project?: M4Project;
  question?: string;
  userNotes?: string | null;
};

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」模块 4 的项目教练。学生正在做一个为期 2-4 周的补强项目,他卡住了来问你。

【回答原则】
1. **基于项目上下文回答** — system 会给你项目的 title / why / weekly_plan / metrics_dictionary,引用这些上下文回答,不要泛泛而谈
2. **基于学生实际输入** — 不假设学生已经完成了任何事(eg 不假设"你已经访谈了 5 个用户");只回应他在 question 里写明的事
3. **给可执行下一步** — 回答里至少包含 1 个具体的"下一步可以做什么"(eg "今天可以先把访谈大纲列成 5 个开放问题")
4. **温和不评判** — 不要说"这个问题很常见,但你做错了",改成"这个困惑很正常,试试这样:..."
5. **诚实承认能力边界** — 如果问题需要具体行业 know-how 你不确定(eg "我应该问什么品牌的咖啡店"),诚实说"这个我不熟,建议查行业报告 / 问相关从业者";不编造

【反编造硬约束】
- 不输出具体公司名 / 产品名 / 学校名
- 不编造书名 / 课程名 / 数据集 link
- 不在回答里凭空给出"行业标准是 X%"这种数字

【输出格式】
纯文本,3-6 段,每段 1-3 句。开头不用"好的""我来回答你"这种废话开场,直接进入回答。`;
}

export const maxDuration = 60; // 线上防 Vercel 默认 10s 静默超时

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const project = body.project;
  const question = (body.question ?? "").trim();
  if (!project || !question) {
    return NextResponse.json(
      { error: "missing project or question" },
      { status: 400 },
    );
  }

  const userNotes = (body.userNotes ?? "").trim();

  // 把卡片上下文压缩成精简 brief(项目卡 / 学习卡两种形态),避免 prompt 过长
  const projectBrief =
    project.kind === "learning"
      ? `【学习补强标题】${project.title}
【为什么做】${project.why}
【当前状态】${project.status}
【要补的 gap】${project.covers_gaps.join("; ") || "未指定"}
【要搞懂的概念】${project.concepts.join("; ") || "未指定"}
【轻量产出】${project.micro_deliverable || "未指定"}
【诚实落点】${project.honest_use || "未指定"}`
      : `【项目标题】${project.title}
【为什么做】${project.why}
【目标岗位】${project.target_role ?? "未指定"}
【期限】${project.weeks} ${project.plan_unit === "week" ? "周(按周拆)" : "周(按天拆)"}
【当前状态】${project.status}
【要补的 gap】${project.source_gaps.map((g) => g.jd_requirement).join("; ") || "未指定"}
【产出物清单】${project.deliverables.join("; ") || "未指定"}
【需追踪指标】${project.metrics_dictionary
          .map((m) => `${m.name}(${m.definition})`)
          .join("; ") || "未指定"}
【需要的技能】${project.skills_required.join(", ") || "未指定"}`;

  const userPrompt = `${projectBrief}

${userNotes ? `【学生已记的笔记】\n${userNotes}\n\n` : ""}【学生现在问】
${question}

请按 system 原则回答。`;

  try {
    const answer = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
      {
        model: "chat",
        temperature: 0.6,
        max_tokens: 800,
      },
    );

    return NextResponse.json({ answer: answer.trim() });
  } catch (err) {
    console.error("[m4/ask] LLM error", err);
    const message = err instanceof Error ? err.message : "LLM 调用失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
