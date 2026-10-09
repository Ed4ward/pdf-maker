import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PDFDocument, rgb } from "pdf-lib";
import {
  DocError,
  assetResourceUri,
  type DocState,
  type PageEntry,
  type Replacement,
  type TextBox,
} from "./contract.ts";

const A4: [number, number] = [595.28, 841.89];

interface Asset {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
  w: number;
  h: number;
}

interface InternalDoc {
  docId: string;
  fileName: string;
  sourceBytes: Uint8Array;
  sourcePath: string;
  pageList: PageEntry[];
  replacements: Map<string, Replacement>;
  assets: Map<string, Asset>;
  textBoxes: TextBox[];
  composites: Map<string, Uint8Array>; // pageId -> jpeg
  lastExport?: string;
}

const newId = (prefix: string) => `${prefix}${randomUUID().slice(0, 8)}`;

export class DocStore {
  private docs = new Map<string, InternalDoc>();

  private get(docId: string): InternalDoc {
    const doc = this.docs.get(docId);
    if (!doc) throw new DocError("not_found", `未知文档:${docId},请先 load_pdf`);
    return doc;
  }

  resolveWorkspace(path: string, workspaceRoot: string): string {
    const p = path.startsWith("~")
      ? undefined // 不展开 home,限定在工作区内
      : resolve(isAbsolute(path) ? path : join(workspaceRoot, path));
    if (!p) throw new DocError("invalid_input", `仅支持工作区内的相对路径:${path}`);
    return p;
  }

  async load(absPath: string, relName: string, workspaceRoot: string): Promise<DocState> {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(absPath));
    } catch {
      throw new DocError("io_error", `无法读取文件:${relName}`);
    }
    let pdf: PDFDocument;
    try {
      pdf = await PDFDocument.load(bytes.slice(0));
    } catch {
      throw new DocError("invalid_input", `不是有效的 PDF:${relName}`);
    }
    const docId = newId("d");
    const pageList: PageEntry[] = [];
    for (let i = 0; i < pdf.getPageCount(); i++) {
      const { width, height } = pdf.getPage(i).getSize();
      pageList.push({ id: `p${i + 1}`, srcIndex: i, w: width, h: height });
    }
    const doc: InternalDoc = {
      docId,
      fileName: relName,
      sourceBytes: bytes,
      sourcePath: absPath,
      pageList,
      replacements: new Map(),
      assets: new Map(),
      textBoxes: [],
      composites: new Map(),
    };
    this.docs.set(docId, doc);
    return this.state(doc, workspaceRoot);
  }

  state(doc: InternalDoc, workspaceRoot: string): DocState {
    void workspaceRoot;
    return {
      docId: doc.docId,
      fileName: doc.fileName,
      pageCount: doc.pageList.length,
      pages: doc.pageList,
      replacements: Object.fromEntries(doc.replacements),
      textBoxes: doc.textBoxes,
      compositesPending: [...doc.composites.keys()],
      exportedTo: doc.lastExport,
    };
  }

  lastDocId(): string | undefined {
    const ids = [...this.docs.keys()];
    return ids[ids.length - 1];
  }

  peek(docId: string, workspaceRoot: string): DocState {
    return this.state(this.get(docId), workspaceRoot);
  }

  sourceBytes(docId: string): Uint8Array {
    return this.get(docId).sourceBytes;
  }

  assetBytes(docId: string, assetId: string): { bytes: Uint8Array; mime: string } | undefined {
    const asset = this.get(docId).assets.get(assetId);
    return asset && { bytes: asset.bytes, mime: asset.mime };
  }

  private pageAt(doc: InternalDoc, pageIndex: number): PageEntry {
    if (!Number.isInteger(pageIndex) || pageIndex < 0 || pageIndex >= doc.pageList.length) {
      throw new DocError("out_of_range", `页码越界:${pageIndex}(共 ${doc.pageList.length} 页)`);
    }
    return doc.pageList[pageIndex];
  }

  private registerAsset(doc: InternalDoc, bytes: Uint8Array): Replacement["assetId"] {
    const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
    const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
    if (!isPng && !isJpeg) {
      throw new DocError("invalid_input", "仅支持 PNG / JPG 图片(WebP 请先转换)");
    }
    const assetId = newId("a");
    doc.assets.set(assetId, { bytes, mime: isPng ? "image/png" : "image/jpeg", w: 0, h: 0 });
    return assetId;
  }

  private assetSize(doc: InternalDoc, assetId: string): { w: number; h: number } {
    const asset = doc.assets.get(assetId);
    if (!asset) throw new DocError("not_found", `资源不存在:${assetId}`);
    return { w: asset.w, h: asset.h };
  }

  async replacePage(
    docId: string,
    pageIndex: number,
    imageAbsPath: string,
    imageName: string,
  ): Promise<void> {
    const doc = this.get(docId);
    const page = this.pageAt(doc, pageIndex);
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await readFile(imageAbsPath));
    } catch {
      throw new DocError("io_error", `无法读取图片:${imageName}`);
    }
    const probe = await PDFDocument.create();
    let w = 0;
    let h = 0;
    try {
      const img = bytes[0] === 0x89 ? await probe.embedPng(bytes) : await probe.embedJpg(bytes);
      w = img.width;
      h = img.height;
    } catch {
      throw new DocError("invalid_input", "图片解码失败,仅支持 PNG / JPG");
    }
    const assetId = this.registerAsset(doc, bytes);
    const asset = doc.assets.get(assetId)!;
    asset.w = w;
    asset.h = h;
    const rep: Replacement = {
      assetId,
      name: imageName,
      w,
      h,
      fit: "contain",
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    };
    doc.replacements.set(page.id, rep);
    doc.composites.delete(page.id);
  }

  clearReplacement(docId: string, pageIndex: number): void {
    const doc = this.get(docId);
    const page = this.pageAt(doc, pageIndex);
    doc.replacements.delete(page.id);
  }

  setLayout(
    docId: string,
    pageIndex: number,
    patch: Partial<Pick<Replacement, "fit" | "scale" | "offsetX" | "offsetY">>,
  ): void {
    const doc = this.get(docId);
    const page = this.pageAt(doc, pageIndex);
    const rep = doc.replacements.get(page.id);
    if (!rep) throw new DocError("not_found", `第 ${pageIndex + 1} 页没有替换图`);
    if (patch.fit) rep.fit = patch.fit;
    if (patch.scale != null) rep.scale = Math.min(3, Math.max(0.5, patch.scale));
    if (patch.offsetX != null) rep.offsetX = Math.min(1, Math.max(-1, patch.offsetX));
    if (patch.offsetY != null) rep.offsetY = Math.min(1, Math.max(-1, patch.offsetY));
    doc.composites.delete(page.id);
  }

  assetUriFor(docId: string, pageIndex: number): string | undefined {
    const doc = this.get(docId);
    const page = doc.pageList[pageIndex];
    const assetId = page && doc.replacements.get(page.id)?.assetId;
    return assetId ? assetResourceUri(docId, assetId) : undefined;
  }

  addText(
    docId: string,
    pageIndex: number,
    text: string,
    opts: { x?: number; y?: number; size?: number; color?: string } = {},
  ): TextBox {
    const doc = this.get(docId);
    const page = this.pageAt(doc, pageIndex);
    const box: TextBox = {
      id: newId("t"),
      pageId: page.id,
      x: opts.x ?? 0.5,
      y: opts.y ?? 0.45,
      text,
      size: opts.size ?? 0.06,
      color: opts.color ?? "#1e293b",
    };
    doc.textBoxes.push(box);
    doc.composites.delete(page.id);
    return box;
  }

  updateText(docId: string, textId: string, patch: Partial<Omit<TextBox, "id" | "pageId">>): void {
    const doc = this.get(docId);
    const box = doc.textBoxes.find((t) => t.id === textId);
    if (!box) throw new DocError("not_found", `文字框不存在:${textId}`);
    Object.assign(box, patch);
    doc.composites.delete(box.pageId);
  }

  removeText(docId: string, textId: string): void {
    const doc = this.get(docId);
    const box = doc.textBoxes.find((t) => t.id === textId);
    if (!box) throw new DocError("not_found", `文字框不存在:${textId}`);
    doc.textBoxes = doc.textBoxes.filter((t) => t.id !== textId);
    doc.composites.delete(box.pageId);
  }

  addBlankPage(docId: string, afterIndex: number): void {
    const doc = this.get(docId);
    if (afterIndex < -1 || afterIndex >= doc.pageList.length) {
      throw new DocError("out_of_range", `插入位置越界:${afterIndex}`);
    }
    doc.pageList.splice(afterIndex + 1, 0, {
      id: newId("n"),
      srcIndex: null,
      w: A4[0],
      h: A4[1],
    });
  }

  deletePage(docId: string, pageIndex: number): void {
    const doc = this.get(docId);
    if (doc.pageList.length <= 1) throw new DocError("out_of_range", "至少需要保留一页");
    const page = this.pageAt(doc, pageIndex);
    doc.pageList = doc.pageList.filter((p) => p.id !== page.id);
    doc.replacements.delete(page.id);
    doc.textBoxes = doc.textBoxes.filter((t) => t.pageId !== page.id);
    doc.composites.delete(page.id);
  }

  movePage(docId: string, from: number, to: number): void {
    const doc = this.get(docId);
    this.pageAt(doc, from);
    this.pageAt(doc, to);
    const list = [...doc.pageList];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    doc.pageList = list;
  }

  stageComposite(docId: string, pageId: string, dataUrl: string): void {
    const doc = this.get(docId);
    if (!doc.pageList.some((p) => p.id === pageId)) {
      throw new DocError("not_found", `页面不存在:${pageId}`);
    }
    const m = /^data:image\/jpeg;base64,(.+)$/.exec(dataUrl);
    if (!m) throw new DocError("invalid_input", "需要 data:image/jpeg;base64 格式");
    doc.composites.set(pageId, new Uint8Array(Buffer.from(m[1], "base64")));
  }

  async export(
    docId: string,
    outRel: string,
    workspaceRoot: string,
    overwrite: boolean,
  ): Promise<{ path: string; bytes: number; rasterPages: string[] }> {
    const doc = this.get(docId);
    const outPath = this.resolveWorkspace(outRel, workspaceRoot);
    const out = await PDFDocument.create();
    const src = await PDFDocument.load(doc.sourceBytes.slice(0));
    const copied =
      src.getPageCount() > 0
        ? await out.copyPages(src, Array.from({ length: src.getPageCount() }, (_, i) => i))
        : [];
    for (const entry of doc.pageList) {
      if (entry.srcIndex != null) out.addPage(copied[entry.srcIndex]);
      else out.addPage(A4);
    }

    const rasterPages: string[] = [];
    const imageCache = new Map<string, Awaited<ReturnType<typeof out.embedPng>>>();
    const embedAsset = async (assetId: string) => {
      const cached = imageCache.get(assetId);
      if (cached) return cached;
      const asset = doc.assets.get(assetId);
      if (!asset) throw new DocError("not_found", `资源不存在:${assetId}`);
      const img =
        asset.mime === "image/png" ? await out.embedPng(asset.bytes) : await out.embedJpg(asset.bytes);
      imageCache.set(assetId, img);
      return img;
    };
    const rect = (
      pw: number,
      ph: number,
      iw: number,
      ih: number,
      rep: Replacement,
    ) => {
      const par = pw / ph;
      const iar = iw / ih;
      const base =
        rep.fit === "contain"
          ? par >= iar
            ? { w: iar / par, h: 1 }
            : { w: 1, h: par / iar }
          : par >= iar
            ? { w: 1, h: par / iar }
            : { w: iar / par, h: 1 };
      const w = base.w * pw * rep.scale;
      const h = base.h * ph * rep.scale;
      const cx = (0.5 + rep.offsetX * 0.5) * pw;
      const cy = (0.5 + rep.offsetY * 0.5) * ph;
      return { x: cx - w / 2, y: cy - h / 2, w, h };
    };

    for (let i = 0; i < doc.pageList.length; i++) {
      const entry = doc.pageList[i];
      const page = out.getPage(i);
      const { width, height } = page.getSize();
      const rep = doc.replacements.get(entry.id);
      const texts = doc.textBoxes.filter((t) => t.pageId === entry.id);
      if (!rep && texts.length === 0) continue;

      if (texts.length > 0) {
        // 含文字的页:必须由页面合成高分辨率位图(浏览器侧渲染,保证中文)
        const staged = doc.composites.get(entry.id);
        if (!staged) throw new DocError("composite_required", `第 ${i + 1} 页含文字,需要面板先合成预览图`);
        const jpg = await out.embedJpg(staged);
        page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
        page.drawImage(jpg, { x: 0, y: 0, width, height });
        rasterPages.push(String(i + 1));
        continue;
      }

      if (rep) {
        const img = await embedAsset(rep.assetId);
        const size = this.assetSize(doc, rep.assetId);
        const r = rect(width, height, size.w || img.width, size.h || img.height, rep);
        page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(1, 1, 1) });
        page.drawImage(img, { x: r.x, y: height - r.y - r.h, width: r.w, height: r.h });
      }
    }

    const bytes = await out.save();
    if (!overwrite) {
      try {
        await readFile(outPath);
        throw new DocError("file_exists", `目标文件已存在:${outRel}(overwrite: true 可覆盖)`);
      } catch (e) {
        if (e instanceof DocError) throw e;
      }
    }
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, bytes);
    doc.lastExport = outRel;
    return { path: outRel, bytes: bytes.byteLength, rasterPages };
  }
}
