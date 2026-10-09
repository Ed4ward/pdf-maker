import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { Replacement } from "../src/contract.ts";

// 无外部 Worker 文件:注册 fake worker(主线程渲染,预览场景足够)
(globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;
void pdfjsLib;

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
  rep: Replacement,
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
  sourceDoc?.doc?.destroy();
  sourceDoc = { id: docId, doc: null };
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  sourceDoc.doc = doc;
  return doc;
}

export async function renderPdfPage(
  doc: pdfjsLib.PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  targetWidth: number,
): Promise<void> {
  const page = await doc.getPage(pageIndex + 1);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: targetWidth / vp1.width });
  canvas.width = Math.floor(vp.width);
  canvas.height = Math.floor(vp.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
}

export function drawReplacement(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  pageW: number,
  pageH: number,
  rep: Replacement,
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
  text: { x: number; y: number; text: string; size: number; color: string },
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

/** 页面文本框命中测试(与 drawTextLines 的估算框一致) */
export function hitTestText(
  boxes: Array<{ id: string } & Parameters<typeof drawTextLines>[3]>,
  pageW: number,
  pageH: number,
  px: number,
  py: number,
): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const r = drawTextLinesEstimate(pageW, pageH, boxes[i]);
    if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return boxes[i].id;
  }
  return null;
}

function drawTextLinesEstimate(
  pageW: number,
  pageH: number,
  text: { x: number; y: number; text: string; size: number; color: string },
): Rect {
  const fontSize = text.size * pageW;
  const lines = text.text.split("\n");
  const lineHeight = fontSize * 1.3;
  const widest = Math.max(...lines.map((l) => l.length), 1);
  const w = Math.min(pageW * 0.9, widest * fontSize * 0.62);
  const h = lines.length * lineHeight;
  return { x: text.x * pageW - w / 2, y: text.y * pageH - h / 2, w, h };
}
