/**
 * Client-side Word(.docx) → text 提取(模块 3 Phase 1)
 *
 * 用 mammoth.browser build,纯客户端。
 * .doc(老版 binary)mammoth 不支持 → 抛错引导粘贴文字。
 */

"use client";

export type DocxExtractResult = {
  text: string;
  warnings: string[];
};

export async function extractTextFromDocx(file: File): Promise<DocxExtractResult> {
  if (file.name.toLowerCase().endsWith(".doc")) {
    throw new Error(
      "老版 .doc 格式不支持(建议另存为 .docx 或粘贴文字)。"
    );
  }

  const mammoth = await import("mammoth/mammoth.browser");
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });

  const trimmed = (result.value ?? "").trim();
  if (!trimmed) {
    throw new Error("Word 文档内容为空 — 建议直接粘贴文字。");
  }

  return {
    text: trimmed,
    warnings: (result.messages ?? []).map((m) => m.message),
  };
}
