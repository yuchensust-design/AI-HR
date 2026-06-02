/**
 * POST /api/m3/export-docx — markdown → .docx Blob
 *
 * Body: { markdown: string, basic?: {...}, targetRole?: string }
 * 返回: application/vnd.openxmlformats-officedocument.wordprocessingml.document
 *
 * plan §E.1 版式 lock:1 页 / 思源黑体 / 18pt 名字 / 12pt 标题 / 10.5pt 正文 / 1.2 行距 / 黑白
 * 文件名:{name}_{target_role}_{YYYYMMDD}.docx
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDocx } from "@/lib/docx-build";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const markdown = String(body.markdown ?? "").trim();
    if (!markdown) {
      return NextResponse.json({ error: "markdown required" }, { status: 400 });
    }

    const buffer = await buildDocx(markdown);

    const filename = `resume_${Date.now()}.docx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/export-docx error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
