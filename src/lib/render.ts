import type { PDFDocumentProxy } from "../types";

/**
 * 将某一页渲染为 JPEG dataURL。
 * 先铺白底再渲染,避免透明区域在 JPEG 中变黑。
 */
export async function renderPageToDataUrl(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetWidth: number,
  quality = 0.9
): Promise<string> {
  const page = await doc.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: targetWidth / vp1.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 2D 画布上下文");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas.toDataURL("image/jpeg", quality);
}

/** 新建空白页的渲染:纯白画布,比例与页面一致 */
export function blankPageDataUrl(pageW: number, pageH: number, targetWidth: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round((pageH / pageW) * targetWidth);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.85);
}
