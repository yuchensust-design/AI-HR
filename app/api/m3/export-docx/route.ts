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

export const maxDuration = 60; // 保险:整篇排版生成,避免线上默认 10s 超时

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const markdown = String(body.markdown ?? "").trim();
    if (!markdown) {
      return NextResponse.json({ error: "markdown required" }, { status: 400 });
    }

    const buffer = await buildDocx(markdown);

    // 文件名可能含中文(用户名/岗位名),按 RFC5987 编码避免部分浏览器乱码/下载失败
    const rawName =
      typeof body.targetRole === "string" && body.targetRole.trim()
        ? `简历_${body.targetRole.trim()}`
        : "简历";
    const safeAscii = `resume_${Date.now()}.docx`; // 老浏览器回退用纯 ASCII
    const utf8Name = encodeURIComponent(`${rawName}.docx`);

    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeAscii}"; filename*=UTF-8''${utf8Name}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/m3/export-docx error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
