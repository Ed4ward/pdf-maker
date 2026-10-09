import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { PageEntry, Replacement, TextBox } from "../src/contract.ts";

// 无外部 Worker 文件:注册 fake worker(主线程渲染,预览场景足够)
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;
void pdfjsLib;

/** 渲染所需的替换图最小结构(dataUrl 由面板从资源通道注入) */
export type RepLike = Pick<Replacement, "w" | "h" | "fit" | "scale" | "offsetX" | "offsetY"> & {
  dataUrl?: string;
};

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 与服务端 replacementRect 相同的排版换算(顶边原点坐标系) */
export function replacementRect(
  pageW: number,
  pageH: number,
  imgW: number,
  imgH: number,
  rep: RepLike,
): Rect {
  const par = pageW / pageH;
  const iar = imgW / imgH || 1;
  const base =
    rep.fit === "contain"
      ? par >= iar
        ? { w: iar / par, h: 1 }
        : { w: 1, h: par / iar }
      : par >= iar
        ? { w: 1, h: par / iar }
        : { w: iar / par, h: 1 };
  const w = base.w * pageW * rep.scale;
  const h = base.h * pageH * rep.scale;
  const cx = (0.5 + rep.offsetX * 0.5) * pageW;
  const cy = (0.5 + rep.offsetY * 0.5) * pageH;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

let sourceDoc: { id: string; doc: pdfjsLib.PDFDocumentProxy | null } = { id: "", doc: null };

export async function loadSource(docId: string, bytes: ArrayBuffer) {
  if (sourceDoc.id === docId && sourceDoc.doc) return sourceDoc.doc;
  await sourceDoc.doc?.destroy();
  sourceDoc = { id: docId, doc: null };
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  sourceDoc.doc = doc;
  return doc;
}

export function makeCanvas(pageW: number, pageH: number, targetWidth: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = Math.round((pageH / pageW) * targetWidth);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

export async function renderBase(
  doc: pdfjsLib.PDFDocumentProxy,
  entry: PageEntry,
  targetWidth: number,
): Promise<HTMLCanvasElement> {
  if (entry.srcIndex == null) {
    const { canvas } = makeCanvas(entry.w, entry.h, targetWidth);
    return canvas;
  }
  const page = await doc.getPage(entry.srcIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: targetWidth / vp1.width });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

export function drawReplacement(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pageW: number,
  pageH: number,
  rep: RepLike,
): void {
  const r = replacementRect(pageW, pageH, img.naturalWidth || rep.w, img.naturalHeight || rep.h, rep);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
}

export function drawTextLines(
  ctx: CanvasRenderingContext2D,
  pageW: number,
  pageH: number,
  text: Pick<TextBox, "x" | "y" | "text" | "size" | "color">,
): Rect {
  const fontSize = text.size * pageW;
  const lines = text.text.split("\n");
  ctx.font = `${fontSize}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = text.color;
  const lineHeight = fontSize * 1.3;
  const startY = text.y * pageH - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, i) => ctx.fillText(line, text.x * pageW, startY + i * lineHeight));
  const widest = Math.max(...lines.map((l) => l.length), 1);
  const w = Math.min(pageW * 0.9, widest * fontSize * 0.62);
  const h = lines.length * lineHeight;
  return { x: text.x * pageW - w / 2, y: text.y * pageH - h / 2, w, h };
}

export function hitTestText(
  boxes: Array<Pick<TextBox, "id" | "x" | "y" | "text" | "size" | "color">>,
  pageW: number,
  pageH: number,
  px: number,
  py: number,
): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const box = boxes[i];
    const fontSize = box.size * pageW;
    const lines = box.text.split("\n");
    const lineHeight = fontSize * 1.3;
    const widest = Math.max(...lines.map((l) => l.length), 1);
    const w = Math.min(pageW * 0.9, widest * fontSize * 0.62);
    const h = lines.length * lineHeight;
    const x = box.x * pageW - w / 2;
    const y = box.y * pageH - h / 2;
    if (px >= x && px <= x + w && py >= y && py <= y + h) return box.id;
  }
  return null;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

/** 合成某页:原始内容 + 替换图 + 文字,返回 JPEG dataURL(导出含文字页用) */
export async function compositePage(
  doc: pdfjsLib.PDFDocumentProxy,
  entry: PageEntry,
  rep: (RepLike & { dataUrl: string }) | undefined,
  texts: Array<Pick<TextBox, "id" | "pageId" | "x" | "y" | "text" | "size" | "color">>,
  targetWidth = 1600,
): Promise<string> {
  const base = await renderBase(doc, entry, targetWidth);
  const ctx = base.getContext("2d")!;
  if (rep) {
    const img = await loadImage(rep.dataUrl);
    drawReplacement(ctx, img, base.width, base.height, rep);
  }
  for (const box of texts) {
    drawTextLines(ctx, base.width, base.height, box);
  }
  return base.toDataURL("image/jpeg", 0.92);
}
