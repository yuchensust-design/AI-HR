/**
 * POST /api/m4/draft-notes — 模块 4 · 根据已勾选任务整理「项目笔记草稿」
 *
 * 把用户在周计划里勾选(声称做过)的任务,组织成一段第一人称的项目经历笔记**脚手架**,
 * 供用户编辑后送进简历。
 *
 * Body:
 *   {
 *     project: M4Project,        // 当前项目卡(title / why / deliverables / metrics 等)
 *     doneTasks: string[],       // 用户勾选的任务文本
 *   }
 * 返回: { draft: string }
 *
 * 反编造守则(核心 —— 绝不违反):
 *   - 不替用户声称任何具体成果 / 数字(不写"提升了 30%"、"访谈了 50 人")
 *   - 真实成果一律用【】占位,提示用户填真实数字/产出
 *   - 只组织"勾选的任务在做什么",不假设做得好、做完、有效果
 *   - 不编造公司/产品/学校名、不编造资源链接
 */

import { NextRequest, NextResponse } from "next/server";
import { chat } from "@/lib/llm";
import type { M4Project } from "@/lib/m4-types";

export const maxDuration = 60;

type RequestBody = {
  project?: M4Project;
  doneTasks?: string[];
};

function buildSystemPrompt(): string {
  return `你是「Offer 捕手」模块 4 的笔记助手。学生在补强项目里勾选了一些任务(表示他正在做/打算做),
你的任务:把这些勾选的任务**组织成一段可以写进简历的项目经历笔记草稿**,供他编辑后使用。

【这是草稿脚手架,不是替他声称成果 —— 最重要的纪律】
1. 只组织"他勾选的任务在做什么",不假设他做完了、做得好、有效果。
2. **真实成果、数字、产出一律用【】占位**,提示他填,例:"产出了【填:具体产出,如一份 X 页报告/一个 demo 链接】"、"覆盖【填:数量】个样本"。
3. **绝不替他编造任何具体数字**(不写"提升 30%""访谈 50 人""准确率 92%")—— 这些只能是他填的真实值。
4. 用第一人称、简历口吻(动词开头),3-5 句,组织成 1 段连贯叙述,不要罗列任务原文。
5. 结尾加一句提示:"⚠️ 把上面【】里的内容换成你的真实成果再保存。"

【反编造硬约束】
- 不输出具体公司名/产品名/学校名
- 不编造书名/课程/数据集链接
- 不凭空给"行业标准是 X%"这类数字

【输出格式】纯文本。先输出笔记草稿正文(含【】占位),最后单独一行输出那句 ⚠️ 提示。不要任何额外开场白。`;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const project = body.project;
  const doneTasks = Array.isArray(body.doneTasks)
    ? body.doneTasks.map((t) => String(t).trim()).filter(Boolean)
    : [];

  if (!project || doneTasks.length === 0) {
    return NextResponse.json(
      { error: "missing project or doneTasks" },
      { status: 400 },
    );
  }

  const title = project.title ?? "";
  const why = project.why ?? "";
  const deliverables =
    project.kind === "learning"
      ? project.micro_deliverable
        ? [project.micro_deliverable]
        : []
      : project.deliverables ?? [];

  const userPrompt = `【项目标题】${title}
【为什么做】${why}
${deliverables.length ? `【计划产出物】${deliverables.join("; ")}` : ""}

【学生已勾选(在做/打算做)的任务】
${doneTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")}

请按 system 原则,把这些勾选的任务组织成一段简历笔记草稿(真实成果用【】占位)。`;

  try {
    const draft = await chat(
      [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: userPrompt },
      ],
      { model: "chat", temperature: 0.5, max_tokens: 600 },
    );
    return NextResponse.json({ draft: draft.trim() });
  } catch (err) {
    console.error("[m4/draft-notes] LLM error", err);
    const message = err instanceof Error ? err.message : "LLM 调用失败";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
