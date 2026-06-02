/**
 * mammoth 浏览器构建无 type declarations,这里加最小 shim 覆盖我们用到的 API。
 * 仅供 lib/docx-extract.ts 使用。
 */

declare module "mammoth/mammoth.browser" {
  export type MammothMessage = { type: string; message: string };

  export type ExtractRawTextResult = {
    value: string;
    messages: MammothMessage[];
  };

  export function extractRawText(input: {
    arrayBuffer: ArrayBuffer;
  }): Promise<ExtractRawTextResult>;
}
