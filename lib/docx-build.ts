/**
 * Server-side markdown → .docx 生成
 *
 * plan §E.1 版式 lock:
 *   - 1 页(尽量;长度由内容决定,这里不强制截)
 *   - 中文字体: 思源黑体 → 苹方 → 微软雅黑 fallback(docx 用 fontFallback 写多个 name)
 *   - 名字 18pt 加粗 居中
 *   - 章节标题 12pt 加粗
 *   - 正文 10.5pt
 *   - 1.2 行距
 *   - 全黑(无彩色)
 *
 * 输入: markdown 字符串(/api/m3/finalize-resume 的输出)
 * 输出: Buffer
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const FONT = "Noto Sans SC"; // 思源黑体 (Noto Sans SC) → docx 会内部 fallback
const FONT_FALLBACK = "PingFang SC"; // 苹方
// Word 自己会有 系统默认 / 微软雅黑 fallback

const SIZE_NAME = 36; // 18pt = 36 half-points
const SIZE_HEADING = 24; // 12pt
const SIZE_BODY = 21; // 10.5pt
const LINE_SPACING = 288; // 1.2 倍行距 = 240 * 1.2 = 288 (twentieths)

type ParseLine =
  | { kind: "name"; text: string }
  | { kind: "subline"; text: string }
  | { kind: "section"; text: string }
  | { kind: "bold"; text: string }    // 实习公司 / 项目名等
  | { kind: "italic"; text: string }  // 技术栈等
  | { kind: "bullet"; text: string }
  | { kind: "body"; text: string }
  | { kind: "empty" };

function parseMarkdown(md: string): ParseLine[] {
  const lines = md.split("\n");
  const out: ParseLine[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push({ kind: "empty" });
      continue;
    }
    if (line.startsWith("# ")) {
      out.push({ kind: "name", text: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      out.push({ kind: "section", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      out.push({ kind: "bullet", text: line.slice(2).trim() });
    } else if (line.startsWith("**") && line.endsWith("**")) {
      out.push({ kind: "bold", text: line.slice(2, -2) });
    } else if (line.startsWith("*") && line.endsWith("*")) {
      out.push({ kind: "italic", text: line.slice(1, -1) });
    } else if (line.startsWith("**") && line.includes("**")) {
      // 含粗体的混合行(简化:整行用 inline 解析)
      out.push({ kind: "body", text: line });
    } else {
      out.push({ kind: "body", text: line });
    }
  }
  return out;
}

// 简单行内 ** 加粗 拆分(单行内)
function parseInlineRuns(text: string): TextRun[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return new TextRun({
        text: p.slice(2, -2),
        bold: true,
        size: SIZE_BODY,
        font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
      });
    }
    return new TextRun({
      text: p,
      size: SIZE_BODY,
      font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
    });
  });
}

export async function buildDocx(markdown: string): Promise<Buffer> {
  const parsed = parseMarkdown(markdown);
  const children: Paragraph[] = [];

  for (const line of parsed) {
    if (line.kind === "name") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { line: LINE_SPACING, after: 80 },
          children: [
            new TextRun({
              text: line.text,
              bold: true,
              size: SIZE_NAME,
              font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
            }),
          ],
        })
      );
    } else if (line.kind === "subline") {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { line: LINE_SPACING, after: 40 },
          children: [
            new TextRun({
              text: line.text,
              size: SIZE_BODY,
              font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
            }),
          ],
        })
      );
    } else if (line.kind === "section") {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100, line: LINE_SPACING },
          border: {
            bottom: { color: "000000", size: 6, space: 1, style: "single" },
          },
          children: [
            new TextRun({
              text: line.text,
              bold: true,
              size: SIZE_HEADING,
              font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
            }),
          ],
        })
      );
    } else if (line.kind === "bullet") {
      children.push(
        new Paragraph({
          spacing: { line: LINE_SPACING, after: 40 },
          indent: { left: 360 },
          children: [
            new TextRun({
              text: "• ",
              size: SIZE_BODY,
              font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
            }),
            ...parseInlineRuns(line.text),
          ],
        })
      );
    } else if (line.kind === "italic") {
      children.push(
        new Paragraph({
          spacing: { line: LINE_SPACING, after: 40 },
          children: [
            new TextRun({
              text: line.text,
              italics: true,
              size: SIZE_BODY,
              font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
            }),
          ],
        })
      );
    } else if (line.kind === "bold") {
      children.push(
        new Paragraph({
          spacing: { line: LINE_SPACING, after: 40 },
          children: [
            new TextRun({
              text: line.text,
              bold: true,
              size: SIZE_BODY,
              font: { name: FONT, eastAsia: FONT, hAnsi: FONT, ascii: FONT, cs: FONT },
            }),
          ],
        })
      );
    } else if (line.kind === "body") {
      children.push(
        new Paragraph({
          spacing: { line: LINE_SPACING, after: 40 },
          children: parseInlineRuns(line.text),
        })
      );
    } else if (line.kind === "empty") {
      children.push(new Paragraph({ spacing: { after: 40 } }));
    }
  }

  const doc = new Document({
    creator: "Offer 捕手",
    title: "Resume",
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: SIZE_BODY,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // 2 cm
              right: 1134,
              bottom: 1134,
              left: 1134,
            },
          },
        },
        children,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
