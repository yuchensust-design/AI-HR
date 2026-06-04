"use client";

/**
 * 简历文件 client-side parser
 *
 * 支持:.md / .txt / .docx / .pdf
 *   - md/txt:FileReader.readAsText(0 依赖)
 *   - docx:mammoth.extractRawText(client)
 *   - pdf:pdfjs-dist + worker CDN(legacy build,兼容 Next 16 + Turbopack)
 *
 * 隐私:全浏览器本地处理,绝不上传服务器。
 *
 * 限制:5 MB / 20 页 PDF / 1 万字裁剪
 */

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const MAX_OUTPUT_CHARS = 10_000;

export type ParseResult = {
  text: string;
  fileName: string;
  warnings: string[];
};

export class ResumeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResumeParseError";
  }
}

function getExt(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

function cleanText(raw: string, warnings: string[]): string {
  let t = raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (t.length > MAX_OUTPUT_CHARS) {
    warnings.push(`简历过长(${t.length} 字),截到 ${MAX_OUTPUT_CHARS} 字`);
    t = t.slice(0, MAX_OUTPUT_CHARS);
  }
  return t;
}

async function parseText(file: File): Promise<string> {
  return await file.text();
}

async function parseDocx(file: File, warnings: string[]): Promise<string> {
  const mammoth = await import("mammoth");
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buf });
  if (result.messages && result.messages.length > 0) {
    const errs = result.messages
      .filter((m) => m.type === "error" || m.type === "warning")
      .slice(0, 3);
    for (const m of errs) {
      warnings.push(`docx parse:${m.message}`);
    }
  }
  return result.value ?? "";
}

async function parsePdf(file: File, warnings: string[]): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // CDN worker — 跟 pdfjs version 严格匹配
  const version = pdfjs.version;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${version}/legacy/build/pdf.worker.min.mjs`;

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buf),
    // 关闭字体警告噪声(简历字体非关键)
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const pages = Math.min(doc.numPages, MAX_PDF_PAGES);
  if (doc.numPages > MAX_PDF_PAGES) {
    warnings.push(
      `PDF ${doc.numPages} 页,只 parse 前 ${MAX_PDF_PAGES} 页`
    );
  }

  const parts: string[] = [];
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const lineMap = new Map<number, string[]>();
    for (const item of content.items as Array<{
      str?: string;
      transform?: number[];
    }>) {
      if (!item.str) continue;
      const y = item.transform ? Math.round(item.transform[5]) : 0;
      const bucket = lineMap.get(y) ?? [];
      bucket.push(item.str);
      lineMap.set(y, bucket);
    }
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);
    const lines = sortedYs.map((y) => (lineMap.get(y) ?? []).join(" "));
    parts.push(lines.join("\n"));
    page.cleanup();
  }
  return parts.join("\n\n");
}

export async function parseResumeFile(file: File): Promise<ParseResult> {
  if (file.size > MAX_BYTES) {
    throw new ResumeParseError(
      `文件 ${(file.size / 1024 / 1024).toFixed(1)} MB 超过 5 MB 上限`
    );
  }

  const ext = getExt(file.name);
  const warnings: string[] = [];
  let raw = "";

  try {
    if (ext === "md" || ext === "txt") {
      raw = await parseText(file);
    } else if (ext === "docx") {
      raw = await parseDocx(file, warnings);
    } else if (ext === "pdf") {
      raw = await parsePdf(file, warnings);
    } else if (ext === "doc") {
      throw new ResumeParseError(
        "暂不支持 .doc 老格式,请另存为 .docx 或贴文本"
      );
    } else {
      throw new ResumeParseError(
        `不支持的文件类型 .${ext} — 只支持 .md / .txt / .docx / .pdf`
      );
    }
  } catch (err) {
    if (err instanceof ResumeParseError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ResumeParseError(`解析失败:${msg}`);
  }

  const text = cleanText(raw, warnings);
  if (text.length < 20) {
    throw new ResumeParseError(
      `解析出来只有 ${text.length} 字,看起来是空文件 / 扫描件 / 复杂排版`
    );
  }

  return {
    text,
    fileName: file.name,
    warnings,
  };
}
