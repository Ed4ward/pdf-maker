import type { PDFDocumentProxy, PageEntry } from "../types";

const WHITE = "#ffffff";

/**
 * 将某一页(含旋转/自定义尺寸)渲染为 JPEG dataURL,位图按页面显示尺寸出图:
 * 原始内容先按「原始方向 + 附加旋转」渲染,再等比 contain 居中放入显示尺寸画布,
 * 与预览卡片、导出栅格路径共用同一几何,保证所见即所得。先铺白底避免透明变黑。
 */
export async function renderPageToDataUrl(
  doc: PDFDocumentProxy,
  entry: PageEntry,
  targetWidth: number,
  quality = 0.9
): Promise<string> {
  if (entry.srcIndex == null) return blankPageDataUrl(entry.w, entry.h, targetWidth);
  const page = await doc.getPage(entry.srcIndex + 1);
  const rotation = page.rotate + (entry.rotation ?? 0);

  // 内容自身(含内在旋转与附加旋转)在 1 倍下的尺寸
  const vp1 = page.getViewport({ scale: 1, rotation });
  // 显示尺寸画布(保持 entry.w 出图宽度)
  const W = Math.floor(targetWidth);
  const H = Math.floor((entry.h / entry.w) * targetWidth);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 2D 画布上下文");
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, W, H);

  // 内容等比 contain 居中:整数化渲染尺寸,避免 subpixel 接缝
  const scale = Math.min(W / vp1.width, H / vp1.height);
  const vp = page.getViewport({ scale, rotation });
  const content = document.createElement("canvas");
  content.width = Math.max(1, Math.floor(vp.width));
  content.height = Math.max(1, Math.floor(vp.height));
  const cctx = content.getContext("2d");
  if (!cctx) throw new Error("无法创建 2D 画布上下文");
  cctx.fillStyle = WHITE;
  cctx.fillRect(0, 0, content.width, content.height);
  await page.render({ canvasContext: cctx, viewport: vp }).promise;

  const dx = Math.round((W - content.width) / 2);
  const dy = Math.round((H - content.height) / 2);
  ctx.drawImage(content, dx, dy);
  return canvas.toDataURL("image/jpeg", quality);
}

/** 新建空白页的渲染:纯白画布,比例与页面一致 */
export function blankPageDataUrl(pageW: number, pageH: number, targetWidth: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round((pageH / pageW) * targetWidth);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL("image/jpeg", 0.85);
}
