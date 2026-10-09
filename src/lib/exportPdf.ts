import { PDFDocument, degrees, rgb, type PDFPage } from "pdf-lib";
import type { PageEntry, Replacement, TextBox } from "../types";
import { dataUrlToPngBytes, loadImage } from "./image";

const norm360 = (a: number) => ((a % 360) + 360) % 360;
/** pt 尺寸比较容差 */
const SIZE_EPS = 0.5;

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

/**
 * 单页导出计划:能用矢量保留的页绝不栅格化。
 * - untouched:原样拷贝;
 * - rotateOnly:拷贝后叠加 /Rotate(矢量内容不动,阅读器整体旋转);
 * - resizeOnly:拷贝后等比缩放内容并在新页面盒内居中(contain);
 * - repVector:仅替换图(白底覆盖 + 矢量绘制图片);
 * - raster:其余组合(含文字、旋转/改尺寸与替换图叠加、内在 /Rotate 页改排版)
 *   新建目标尺寸页面,将「原始内容位图(已按显示尺寸烘焙)+ 替换图 + 文字」整页合成;
 * - blank:新建空白页,替换图走矢量绘制,含文字时栅格合成。
 */
type PagePlan =
  | { kind: "untouched"; srcIndex: number }
  | { kind: "rotateOnly"; srcIndex: number; srcRotation: number }
  | { kind: "resizeOnly"; srcIndex: number }
  | { kind: "repVector"; srcIndex: number; rep: Replacement }
  | { kind: "raster"; rep: Replacement | null; texts: TextBox[] }
  | { kind: "blank"; rep: Replacement | null; texts: TextBox[] };

/**
 * 按当前页面顺序重建文档并应用全部编辑后导出:
 * 1. 只拷贝实际引用的原始页,按 pageList 顺序(含新建空白页)重新组装;
 * 2. 旋转/改尺寸优先走矢量路径(叠加 /Rotate 或缩放内容流);
 * 3. 需要合成的页将 原始页面位图 + 替换图 + 文字 在画布上合成高分辨率位图,
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

  const srcRot = new Map<number, number>();
  /** 原始页显示尺寸(mediabox 经内在 /Rotate 互换后,与预览 entry.w/h 同基准) */
  const srcDims = new Map<number, { w: number; h: number }>();

  const plans: Array<{ entry: PageEntry; plan: PagePlan }> = [];
  for (const entry of pageList) {
    const rep = replacements[entry.id] ?? null;
    const texts = textBoxes.filter((t) => t.pageId === entry.id);
    if (entry.srcIndex == null || entry.srcIndex < 0 || entry.srcIndex >= srcCount) {
      plans.push({ entry, plan: { kind: "blank", rep, texts } });
      continue;
    }
    const srcIndex = entry.srcIndex;
    if (!srcRot.has(srcIndex)) {
      const page = src.getPage(srcIndex);
      const angle = norm360(page.getRotation().angle);
      const { width, height } = page.getSize();
      srcRot.set(srcIndex, angle);
      srcDims.set(srcIndex, angle % 180 === 90 ? { w: height, h: width } : { w: width, h: height });
    }
    const dims = srcDims.get(srcIndex)!;
    // entry.w/h 为显示尺寸;与原始尺寸比较前先还原旋转互换
    const swapForCompare = (entry.rotation ?? 0) % 180 !== 0;
    const baseW = swapForCompare ? entry.h : entry.w;
    const baseH = swapForCompare ? entry.w : entry.h;
    const resized = Math.abs(dims.w - baseW) > SIZE_EPS || Math.abs(dims.h - baseH) > SIZE_EPS;
    const rotated = (entry.rotation ?? 0) % 360 !== 0;
    const intrinsic = (srcRot.get(srcIndex) ?? 0) % 360 !== 0;

    let plan: PagePlan;
    if (rep && texts.length === 0 && !resized && !rotated && !intrinsic) {
      plan = { kind: "repVector", srcIndex, rep };
    } else if (!rep && texts.length === 0 && !resized && !rotated) {
      plan = { kind: "untouched", srcIndex };
    } else if (!rep && texts.length === 0 && resized && !rotated && !intrinsic) {
      plan = { kind: "resizeOnly", srcIndex };
    } else if (!rep && texts.length === 0 && !resized && rotated) {
      plan = { kind: "rotateOnly", srcIndex, srcRotation: srcRot.get(srcIndex) ?? 0 };
    } else {
      plan = { kind: "raster", rep, texts };
    }
    plans.push({ entry, plan });
  }

  // 仅为矢量路径拷贝原始页;栅格页用新建页面承载,避免未引用页写入文件
  const copyIndices: number[] = [];
  for (const { plan } of plans) {
    if (
      plan.kind === "untouched" ||
      plan.kind === "rotateOnly" ||
      plan.kind === "resizeOnly" ||
      plan.kind === "repVector"
    ) {
      copyIndices.push(plan.srcIndex);
    }
  }
  const copied = copyIndices.length > 0 ? await out.copyPages(src, copyIndices) : [];
  let copyCursor = 0;
  const nextCopy = () => copied[copyCursor++];

  for (const { entry, plan } of plans) {
    switch (plan.kind) {
      case "untouched": {
        out.addPage(nextCopy());
        break;
      }
      case "rotateOnly": {
        const page = out.addPage(nextCopy());
        page.setRotation(degrees(norm360(plan.srcRotation + (entry.rotation ?? 0))));
        break;
      }
      case "resizeOnly": {
        const page = out.addPage(nextCopy());
        const { width: ow, height: oh } = page.getSize();
        const s = Math.min(entry.w / ow, entry.h / oh);
        page.scaleContent(s, s);
        page.translateContent((entry.w - ow * s) / 2, (entry.h - oh * s) / 2);
        page.setSize(entry.w, entry.h);
        break;
      }
      case "repVector": {
        const page = out.addPage(nextCopy());
        const pngBytes = await dataUrlToPngBytes(plan.rep.dataUrl);
        const img = await out.embedPng(pngBytes);
        const { width, height } = page.getSize();
        page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
        const r = replacementRect(width, height, img.width, img.height, plan.rep);
        page.drawImage(img, { x: r.x, y: height - r.y - r.h, width: r.w, height: r.h });
        break;
      }
      case "blank": {
        const page = out.addPage([entry.w, entry.h]);
        if (plan.rep && plan.texts.length === 0) {
          const pngBytes = await dataUrlToPngBytes(plan.rep.dataUrl);
          const img = await out.embedPng(pngBytes);
          page.drawRectangle({ x: 0, y: 0, width: entry.w, height: entry.h, color: rgb(1, 1, 1) });
          const r = replacementRect(entry.w, entry.h, img.width, img.height, plan.rep);
          page.drawImage(img, { x: r.x, y: entry.h - r.y - r.h, width: r.w, height: r.h });
        } else if (plan.texts.length > 0) {
          await rasterizeOnto(out, page, entry, plan.rep, plan.texts, getPageRender);
        }
        break;
      }
      case "raster": {
        const page = out.addPage([entry.w, entry.h]);
        await rasterizeOnto(out, page, entry, plan.rep, plan.texts, getPageRender);
        break;
      }
    }
  }

  return out.save();
}

/**
 * 画布合成:原始内容位图(render.ts 已按显示尺寸烘焙旋转与 contain)+
 * 替换图 + 文字框 → 整页高清 JPEG 铺满目标页面,与预览逐像素同构。
 */
async function rasterizeOnto(
  out: PDFDocument,
  page: PDFPage,
  entry: PageEntry,
  rep: Replacement | null,
  texts: TextBox[],
  getPageRender: (id: string) => Promise<string>
): Promise<void> {
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
  const { width, height } = page.getSize();
  page.drawImage(raster, { x: 0, y: 0, width, height });
}
