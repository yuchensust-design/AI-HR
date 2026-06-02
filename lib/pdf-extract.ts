/**
 * Client-side PDF → text 提取(模块 3 Phase 1)
 *
 * 用 pdfjs-dist v6 ESM build。Worker 走 CDN(避免 Next.js 16 Turbopack 打包 worker 的坑)。
 * 失败时抛 Error,UI 层捕获后引导用户上传截图(PRD EC-3.1)。
 */

"use client";

export type PdfExtractResult = {
  text: string;
  pages: number;
};

export async function extractTextFromPdf(file: File): Promise<PdfExtractResult> {
  const pdfjsLib = await import("pdfjs-dist");

  // Worker:CDN match install version,避免 worker bundle 配置
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => ("str" in item ? (item as { str: string }).str : ""))
      .join(" ");
    fullText += pageText + "\n\n";
  }

  const trimmed = fullText.trim();
  if (!trimmed) {
    throw new Error(
      "PDF 内容为空 — 可能是扫描版 / 加密 / 图片简历。建议上传截图或直接粘贴文字。"
    );
  }

  return { text: trimmed, pages: pdf.numPages };
}
