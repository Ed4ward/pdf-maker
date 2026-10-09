import { PDFDocument, rgb } from "pdf-lib";
import type { PageEntry, Replacement, TextBox } from "../types";
import { dataUrlToPngBytes, loadImage } from "./image";

/**
 * 与前端 replacedImageStyle 相同的排版换算:
 * contain 取小比率,cover 取大比率,再乘 scale;
 * 中心点 = (50% + offset×50%)。返回顶边原点坐标系(与 canvas 一致)。
 */
function replacementRect(
  pageW: number,
  pageH: number,
  imgW: number,
  imgH: number,
  rep: Replacement
): { x: number; y: number; w: number; h: number } {
  const pageAR = pageW / pageH;
  const imgAR = imgW / imgH;
  const base =
    rep.fit === "contain"
      ? pageAR >= imgAR
        ? { w: imgAR / pageAR, h: 1 }
        : { w: 1, h: pageAR / imgAR }
      : pageAR >= imgAR
        ? { w: 1, h: pageAR / imgAR }
        : { w: imgAR / pageAR, h: 1 };
  const w = base.w * pageW * rep.scale;
  const h = base.h * pageH * rep.scale;
  const cx = (0.5 + rep.offsetX * 0.5) * pageW;
  const cy = (0.5 + rep.offsetY * 0.5) * pageH;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

const A4: [number, number] = [595.28, 841.89];

/**
 * 按当前页面顺序重建文档并应用全部编辑后导出:
 * 1. copyPages 拷贝原始 PDF 的全部页,按 pageList 顺序(含新建空白页)重新组装;
 * 2. 仅有图片替换的页:白底覆盖 + 按排版参数绘制图片(保持矢量与清晰度);
 * 3. 含文字框的页:将 原始页面 + 替换图 + 文字 在画布上合成高分辨率位图,
 *    与预览完全一致(中文等任意文字无需嵌入字体)。
 */
export async function buildReplacedPdf(
  originalBytes: Uint8Array,
  pageList: PageEntry[],
  replacements: Record<string, Replacement>,
  textBoxes: TextBox[],
  getPageRender: (id: string) => Promise<string>
): Promise<Uint8Array> {
  const src = await PDFDocument.load(originalBytes.slice(0));
  const out = await PDFDocument.create();

  const srcCount = src.getPageCount();
  const copied = srcCount > 0 ? await out.copyPages(src, Array.from({ length: srcCount }, (_, i) => i)) : [];
  for (const entry of pageList) {
    if (entry.srcIndex != null) out.addPage(copied[entry.srcIndex]);
    else out.addPage(A4);
  }

  for (let i = 0; i < pageList.length; i++) {
    const entry = pageList[i];
    const rep = replacements[entry.id];
    const texts = textBoxes.filter((t) => t.pageId === entry.id);
    if (!rep && texts.length === 0) continue;
    const page = out.getPage(i);
    const { width, height } = page.getSize();

    if (rep && texts.length === 0) {
      const pngBytes = await dataUrlToPngBytes(rep.dataUrl);
      const img = await out.embedPng(pngBytes);
      page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
      const r = replacementRect(width, height, img.width, img.height, rep);
      page.drawImage(img, { x: r.x, y: height - r.y - r.h, width: r.w, height: r.h });
      continue;
    }

    // ---- 画布合成(含文字) ----
    const baseSrc = await getPageRender(entry.id);
    const base = await loadImage(baseSrc);
    const W = base.naturalWidth;
    const H = base.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法创建 2D 画布上下文");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(base, 0, 0);

    if (rep) {
      const repImg = await loadImage(rep.dataUrl);
      const r = replacementRect(W, H, repImg.naturalWidth, repImg.naturalHeight, rep);
      ctx.drawImage(repImg, r.x, r.y, r.w, r.h);
    }

    for (const tb of texts) {
      const fontSize = tb.size * W;
      const lines = tb.text.split("\n");
      ctx.font = `${fontSize}px -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = tb.color;
      if (tb.color.toLowerCase() === "#ffffff") {
        ctx.shadowColor = "rgba(0,0,0,0.4)";
        ctx.shadowBlur = fontSize * 0.06;
      }
      const lineHeight = fontSize * 1.3;
      const startY = tb.y * H - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, i) => {
        ctx.fillText(line, tb.x * W, startY + i * lineHeight);
      });
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
    }

    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("JPEG 编码失败"))), "image/jpeg", 0.92)
    );
    const rasterBytes = new Uint8Array(await blob.arrayBuffer());
    const raster = await out.embedJpg(rasterBytes);
    page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
    page.drawImage(raster, { x: 0, y: 0, width, height });
  }

  return out.save();
}
