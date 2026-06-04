/**
 * 客户端图片压缩 — 纯 Canvas,无第三方依赖
 *
 * 用法:
 *   const dataUrl = await compressImage(file, 1920, 0.85);
 *   // dataUrl 是 base64 JPEG data URL,可直接 <img src={...}> 或写 localStorage
 *
 * 默认 1920px max width + JPEG quality 0.85 → 大多数手机照片输出 100-400 KB
 *
 * plan §8.20 §C.2 lock
 */

const TARGET_MAX_BYTES = 500 * 1024; // 500 KB hard cap(localStorage 友好)

export type CompressResult = {
  dataUrl: string;
  width: number;
  height: number;
  sizeKB: number;
  /** 压缩失败(原图就 > 500KB 且无法降到下) → 抛 throw,caller 捕获 */
};

/**
 * 压缩单个 File → base64 data URL
 *
 * @param file       原始 File(<input type=file accept="image/*">)
 * @param maxWidth   max 宽度(px),超过等比缩
 * @param quality    JPEG 质量 0-1,默认 0.85
 * @throws Error    if 文件不是图片,或压缩后仍 > 500KB
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.85
): Promise<CompressResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("只支持图片文件(JPG / PNG / WEBP / GIF)");
  }

  const img = await loadImage(file);

  // 计算目标尺寸
  let { width, height } = img;
  if (width > maxWidth) {
    height = Math.round((height * maxWidth) / width);
    width = maxWidth;
  }

  // 画到 canvas 再 toDataURL
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("浏览器不支持 Canvas 2D");
  ctx.drawImage(img, 0, 0, width, height);

  // 优先 JPEG(压得更小);PNG with alpha 用 PNG
  const hasAlpha = file.type === "image/png" || file.type === "image/gif";
  let dataUrl = canvas.toDataURL(hasAlpha ? "image/png" : "image/jpeg", quality);

  // size check + 必要时递降 quality
  let actualQuality = quality;
  while (estimateDataUrlBytes(dataUrl) > TARGET_MAX_BYTES && actualQuality > 0.4) {
    actualQuality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", actualQuality);
  }

  const sizeBytes = estimateDataUrlBytes(dataUrl);
  if (sizeBytes > TARGET_MAX_BYTES) {
    throw new Error(
      `这张图压缩后还有 ${Math.round(sizeBytes / 1024)} KB,试试小一点的图(< 5 MB)`
    );
  }

  return {
    dataUrl,
    width,
    height,
    sizeKB: Math.round(sizeBytes / 1024),
  };
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败,可能格式不支持"));
    };
    img.src = url;
  });
}

/** base64 data URL 大约字节数(base64 比 raw 大 33%)*/
function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx < 0) return dataUrl.length;
  const b64 = dataUrl.substring(commaIdx + 1);
  return Math.floor(b64.length * 0.75);
}
