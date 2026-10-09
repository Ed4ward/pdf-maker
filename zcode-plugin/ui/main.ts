import { api, host, onDocState, onTheme, readResourceBase64 } from "./bridge.ts";
import { DocError, type DocState } from "../src/contract.ts";
import {
  drawReplacement,
  drawTextLines,
  hitTestText,
  loadSource,
  renderPdfPage,
} from "./render.ts";

/* ---------------- 状态 ---------------- */

let doc: DocState | null = null;
let current = 0; // 位置序号
let compareMode = false;
let comparePos = 50;
let selectedTextId: string | null = null;
let assetImgCache = new Map<string, HTMLImageElement>();
let renderToken = 0;
let thumbToken = 0;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const els = {
  pathInput: $("#pathInput") as HTMLInputElement,
  loadBtn: $("#loadBtn") as HTMLButtonElement,
  exportBtn: $("#exportBtn") as HTMLButtonElement,
  exportPath: $("#exportPath") as HTMLInputElement,
  overwrite: $("#overwrite") as HTMLInputElement,
  thumbs: $("#thumbs") as HTMLDivElement,
  previewWrap: $("#previewWrap") as HTMLDivElement,
  previewBox: $("#previewBox") as HTMLDivElement,
  baseCanvas: $("#baseCanvas") as HTMLCanvasElement,
  editCanvas: $("#editCanvas") as HTMLCanvasElement,
  cmpDivider: $("#cmpDivider") as HTMLDivElement,
  pageNav: $("#pageNav") as HTMLDivElement,
  addTextBtn: $("#addTextBtn") as HTMLButtonElement,
  addPageBtn: $("#addPageBtn") as HTMLButtonElement,
  deletePageBtn: $("#deletePageBtn") as HTMLButtonElement,
  movePrevBtn: $("#movePrevBtn") as HTMLButtonElement,
  moveNextBtn: $("#moveNextBtn") as HTMLButtonElement,
  replaceInput: $("#replaceInput") as HTMLInputElement,
  replaceBtn: $("#replaceBtn") as HTMLButtonElement,
  clearRepBtn: $("#clearRepBtn") as HTMLButtonElement,
  fitContain: $("#fitContain") as HTMLButtonElement,
  fitCover: $("#fitCover") as HTMLButtonElement,
  scaleSlider: $("#scaleSlider") as HTMLInputElement,
  scaleVal: $("#scaleVal") as HTMLSpanElement,
  cmpToggle: $("#cmpToggle") as HTMLInputElement,
  textList: $("#textList") as HTMLDivElement,
  msg: $("#msg") as HTMLDivElement,
};

function msg(text: string, error = false) {
  els.msg.textContent = text;
  els.msg.classList.toggle("error", error);
  if (text) {
    setTimeout(() => {
      if (els.msg.textContent === text) els.msg.textContent = "";
    }, 3500);
  }
}

/* ---------------- 渲染 ---------------- */

const curEntry = () => doc?.pages[current] ?? null;
const curRep = () => {
  const e = curEntry();
  return e ? doc!.replacements[e.id] ?? null : null;
};

async function assetImage(docId: string, assetId: string): Promise<HTMLImageElement | null> {
  const key = `${docId}:${assetId}`;
  const cached = assetImgCache.get(key);
  if (cached) return cached.complete && cached.naturalWidth > 0 ? cached : null;
  const img = new Image();
  img.crossOrigin = "anonymous";
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("asset load failed"));
  });
  assetImgCache.set(key, img);
  try {
    const { bytes } = await readResourceBase64(`pdf://pdf-editor/${docId}/asset/${assetId}`);
    img.src = URL.createObjectURL(new Blob([bytes]));
    await loaded;
    return img;
  } catch {
    assetImgCache.delete(key);
    return null;
  }
}

async function renderPreview() {
  const token = ++renderToken;
  const entry = curEntry();
  const d0 = doc;
  if (!d0 || !entry) return;
  const wrapW = els.previewWrap.clientWidth || 600;
  const wrapH = els.previewWrap.clientHeight || 800;
  const targetW = Math.min(1400, Math.round(Math.max(wrapW, 320) * (window.devicePixelRatio || 1) * 0.9));

  const entryIndex = current;
  try {
    if (entry.srcIndex != null) {
      const source = await readResourceBase64(`pdf://pdf-editor/${d0.docId}/source`);
      const pdfDoc = await loadSource(d0.docId, source.bytes);
      await renderPdfPage(pdfDoc, entry.srcIndex, els.baseCanvas, targetW);
    } else {
      const ar = entry.h / entry.w;
      els.baseCanvas.width = targetW;
      els.baseCanvas.height = Math.round(targetW * ar);
      const ctx = els.baseCanvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, els.baseCanvas.width, els.baseCanvas.height);
    }
    if (token !== renderToken || current !== entryIndex) return;

    // 编辑层:替换图 + 文字
    const ctx = els.editCanvas.getContext("2d")!;
    els.editCanvas.width = els.baseCanvas.width;
    els.editCanvas.height = els.baseCanvas.height;
    ctx.clearRect(0, 0, els.editCanvas.width, els.editCanvas.height);
    const rep = d0.replacements[entry.id];
    if (rep) {
      const img = await assetImage(d0.docId, rep.assetId);
      if (img && token === renderToken) {
        drawReplacement(ctx, img, els.editCanvas.width, els.editCanvas.height, rep);
      }
    }
    for (const box of d0.textBoxes.filter((t) => t.pageId === entry.id)) {
      const r = drawTextLines(ctx, els.editCanvas.width, els.editCanvas.height, box);
      if (selectedTextId === box.id) {
        ctx.save();
        ctx.strokeStyle = "#2563eb";
        ctx.setLineDash([6, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x - 6, r.y - 6, r.w + 12, r.h + 12);
        ctx.restore();
      }
    }
    if (token !== renderToken) return;

    // 预览卡片尺寸跟随页面比例
    const ar = els.baseCanvas.height / els.baseCanvas.width;
    const maxW = Math.min(wrapW - 16, 720);
    const maxH = wrapH - 24;
    let w = maxW;
    let h = w * ar;
    if (h > maxH) {
      h = maxH;
      w = h / ar;
    }
    els.previewBox.style.width = `${Math.round(w)}px`;
    els.previewBox.style.height = `${Math.round(h)}px`;
    els.cmpDivider.style.left = `${comparePos}%`;
  } catch (err) {
    if (token === renderToken) msg(String(err), true);
  }
}

async function renderThumbs() {
  const token = ++thumbToken;
  els.thumbs.innerHTML = "";
  const d = doc;
  if (!d) return;
  for (let i = 0; i < d.pages.length; i++) {
    if (token !== thumbToken) return;
    const entry = d.pages[i];
    const item = document.createElement("div");
    item.className = "thumb" + (i === current ? " active" : "");
    item.dataset.pageIndex = String(i);
    const frame = document.createElement("div");
    frame.className = "thumb-frame";
    frame.style.aspectRatio = `${entry.w} / ${entry.h}`;
    const cv = document.createElement("canvas");
    cv.width = 120;
    cv.height = Math.round((entry.h / entry.w) * 120);
    frame.appendChild(cv);
    const label = document.createElement("div");
    label.className = "thumb-label";
    label.textContent = String(i + 1);
    if (entry.srcIndex == null) {
      const tag = document.createElement("span");
      tag.textContent = doc_i18n_new();
      label.appendChild(tag);
    }
    item.appendChild(frame);
    item.appendChild(label);
    item.addEventListener("click", () => {
      current = i;
      selectedTextId = null;
      void renderPreview();
      void renderThumbs();
      renderNav();
    });
    els.thumbs.appendChild(item);

    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    if (entry.srcIndex != null) {
      try {
        const source = await readResourceBase64(`pdf://pdf-editor/${d.docId}/source`);
        const pdfDoc = await loadSource(d.docId, source.bytes);
        if (token !== thumbToken) return;
        await renderPdfPage(pdfDoc, entry.srcIndex, cv, 120);
      } catch {
        /* 缩略图失败保持白底 */
      }
    }
    const rep = d.replacements[entry.id];
    if (rep) {
      const img = await assetImage(d.docId, rep.assetId);
      if (img && token === thumbToken) {
        drawReplacement(ctx, img, cv.width, cv.height, rep);
      }
    }
  }
}

function doc_i18n_new() {
  return "新";
}

function renderNav() {
  if (!doc) {
    els.pageNav.textContent = "";
    return;
  }
  els.pageNav.textContent = `${current + 1} / ${doc.pages.length}`;
  els.deletePageBtn.disabled = doc.pages.length <= 1;
  els.movePrevBtn.disabled = current <= 0;
  els.moveNextBtn.disabled = current >= doc.pages.length - 1;
  const rep = curRep();
  els.fitContain.disabled = !rep;
  els.fitCover.disabled = !rep;
  els.scaleSlider.disabled = !rep;
  els.clearRepBtn.disabled = !rep;
}

function renderAdjust() {
  const rep = curRep();
  els.fitContain.classList.toggle("on", rep?.fit === "contain");
  els.fitCover.classList.toggle("on", rep?.fit === "cover");
  els.scaleSlider.value = String(rep?.scale ?? 1);
  els.scaleVal.textContent = `${Math.round((rep?.scale ?? 1) * 100)}%`;
}

function renderTextList() {
  const entry = curEntry();
  const d = doc;
  els.textList.innerHTML = "";
  if (!d || !entry) return;
  const boxes = d.textBoxes.filter((t) => t.pageId === entry.id);
  for (const box of boxes) {
    const row = document.createElement("div");
    row.className = "text-row" + (box.id === selectedTextId ? " selected" : "");
    const input = document.createElement("input");
    input.type = "text";
    input.value = box.text;
    input.addEventListener("change", () => {
      void safeCall(() => api.updateText(d.docId, box.id, { text: input.value }));
      box.text = input.value;
      void renderPreview();
    });
    const del = document.createElement("button");
    del.textContent = "×";
    del.title = "删除文字";
    del.addEventListener("click", () => {
      void safeCall(() => api.removeText(d.docId, box.id));
      selectedTextId = null;
    });
    row.appendChild(input);
    row.appendChild(del);
    els.textList.appendChild(row);
  }
  if (boxes.length === 0) {
    const empty = document.createElement("div");
    empty.className = "text-empty";
    empty.textContent = "暂无文字,点「添加文字」";
    els.textList.appendChild(empty);
  }
}

async function safeCall(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    msg(err instanceof DocError ? `[${err.code}] ${err.message}` : String(err), true);
  }
}

/* ---------------- 状态刷新 ---------------- */

function applyState(next: DocState) {
  const docChanged = !doc || doc.docId !== next.docId;
  doc = next;
  if (docChanged) {
    current = 0;
    selectedTextId = null;
    compareMode = false;
    els.cmpToggle.checked = false;
    assetImgCache = new Map();
    els.exportPath.value = suggestExportPath(next.fileName);
  }
  if (current >= next.pages.length) current = next.pages.length - 1;
  renderNav();
  renderAdjust();
  renderTextList();
  void renderPreview();
  void renderThumbs();
}

function suggestExportPath(fileName: string) {
  return fileName.replace(/\.pdf$/i, "") + "-edited.pdf";
}

/* ---------------- 交互 ---------------- */

els.loadBtn.addEventListener("click", () => {
  const path = els.pathInput.value.trim();
  if (!path) return void msg("请输入 PDF 路径", true);
  void safeCall(() => api.load(path));
});

els.replaceBtn.addEventListener("click", () => {
  if (!doc) return;
  const path = els.replaceInput.value.trim();
  if (!path) return void msg("请输入替换图片路径", true);
  void safeCall(() => api.replace(doc!.docId, current, path));
});

els.clearRepBtn.addEventListener("click", () => {
  if (!doc) return;
  void safeCall(() => api.clearRep(doc!.docId, current));
});

els.fitContain.addEventListener("click", () => {
  if (!doc || !curRep()) return;
  void safeCall(() => api.setLayout(doc!.docId, current, { fit: "contain" }));
});
els.fitCover.addEventListener("click", () => {
  if (!doc || !curRep()) return;
  void safeCall(() => api.setLayout(doc!.docId, current, { fit: "cover" }));
});
els.scaleSlider.addEventListener("input", () => {
  const rep = curRep();
  if (!doc || !rep) return;
  rep.scale = Number(els.scaleSlider.value);
  els.scaleVal.textContent = `${Math.round(rep.scale * 100)}%`;
  void renderPreview();
});
els.scaleSlider.addEventListener("change", () => {
  if (!doc) return;
  void safeCall(() => api.setLayout(doc!.docId, current, { scale: Number(els.scaleSlider.value) }));
});

els.addTextBtn.addEventListener("click", () => {
  if (!doc) return;
  void safeCall(() => api.addText(doc!.docId, current, "输入文字"));
});

els.addPageBtn.addEventListener("click", () => {
  if (!doc) return;
  void safeCall(() => api.addBlank(doc!.docId, current));
});

els.deletePageBtn.addEventListener("click", () => {
  if (!doc) return;
  void safeCall(() => api.deletePage(doc!.docId, current));
});

els.movePrevBtn.addEventListener("click", () => {
  if (!doc || current <= 0) return;
  void safeCall(() => api.movePage(doc!.docId, current, current - 1));
});
els.moveNextBtn.addEventListener("click", () => {
  if (!doc || !curEntry() || current >= doc.pages.length - 1) return;
  void safeCall(() => api.movePage(doc!.docId, current, current + 1));
});

els.exportBtn.addEventListener("click", async () => {
  if (!doc) return;
  const path = els.exportPath.value.trim();
  if (!path) return void msg("请输入导出路径", true);
  try {
    // 含文字的页面:先在页面侧合成高分辨率位图
    for (const entry of doc.pages) {
      const texts = doc.textBoxes.filter((t) => t.pageId === entry.id);
      if (texts.length === 0) continue;
      const dataUrl = await compositePage(entry.id === curEntry()?.id ? null : doc.pages.indexOf(entry));
      await api.stage(doc.docId, entry.id, dataUrl);
    }
    const result = await api.exportPdf(doc.docId, path, els.overwrite.checked);
    msg(`已导出:${result.path}`);
  } catch (err) {
    msg(err instanceof DocError ? `[${err.code}] ${err.message}` : String(err), true);
  }
});

async function compositePage(pageIndex: number | null): Promise<string> {
  const idx = pageIndex ?? current;
  const entry = doc!.pages[idx];
  const canvas = document.createElement("canvas");
  const source = await readResourceBase64(`pdf://pdf-editor/${doc!.docId}/source`);
  const pdfDoc = await loadSource(doc!.docId, source.bytes);
  if (entry.srcIndex != null) {
    await renderPdfPage(pdfDoc, entry.srcIndex, canvas, 1600);
  } else {
    canvas.width = 1600;
    canvas.height = Math.round((entry.h / entry.w) * 1600);
    const c = canvas.getContext("2d")!;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  const ctx = canvas.getContext("2d")!;
  const rep = doc!.replacements[entry.id];
  if (rep) {
    const img = await assetImage(doc!.docId, rep.assetId);
    if (img) drawReplacement(ctx, img, canvas.width, canvas.height, rep);
  }
  for (const box of doc!.textBoxes.filter((t) => t.pageId === entry.id)) {
    drawTextLines(ctx, canvas.width, canvas.height, box);
  }
  return canvas.toDataURL("image/jpeg", 0.92);
}

// 预览:点选/拖动文字框
let dragging: { id: string; startX: number; startY: number; ox: number; oy: number } | null = null;

els.editCanvas.addEventListener("pointerdown", (e) => {
  if (!doc || !compareMode) return;
  const rect = els.editCanvas.getBoundingClientRect();
  const sx = els.editCanvas.width / rect.width;
  const sy = els.editCanvas.height / rect.height;
  const px = (e.clientX - rect.left) * sx;
  const py = (e.clientY - rect.top) * sy;
  const boxes = doc.textBoxes.filter((t) => t.pageId === curEntry()?.id);
  const id = hitTestText(boxes, els.editCanvas.width, els.editCanvas.height, px, py);
  selectedTextId = id;
  renderTextList();
  if (!id) return;
  const box = doc.textBoxes.find((t) => t.id === id)!;
  dragging = { id, startX: e.clientX, startY: e.clientY, ox: box.x, oy: box.y };
  els.editCanvas.setPointerCapture(e.pointerId);
});
els.editCanvas.addEventListener("pointermove", (e) => {
  if (!dragging || !doc) return;
  const rect = els.editCanvas.getBoundingClientRect();
  const box = doc.textBoxes.find((t) => t.id === dragging!.id);
  if (!box) return;
  box.x = Math.min(1, Math.max(0, dragging.ox + (e.clientX - dragging.startX) / rect.width));
  box.y = Math.min(1, Math.max(0, dragging.oy + (e.clientY - dragging.startY) / rect.height));
  void renderPreview();
});
els.editCanvas.addEventListener("pointerup", () => {
  if (!dragging || !doc) return;
  const d = dragging;
  dragging = null;
  const box = doc.textBoxes.find((t) => t.id === d.id);
  if (box && (box.x !== d.ox || box.y !== d.oy)) {
    void safeCall(() => api.updateText(doc!.docId, d.id, { x: box.x, y: box.y }));
  }
});

// 对比模式
els.cmpToggle.addEventListener("change", () => {
  compareMode = els.cmpToggle.checked;
  els.editCanvas.classList.toggle("cmp-top", compareMode);
  els.cmpDivider.classList.toggle("show", compareMode);
  els.baseCanvas.classList.toggle("cmp-base", compareMode);
  void renderPreview();
});
els.cmpDivider.addEventListener("pointerdown", (e) => {
  if (!compareMode) return;
  els.cmpDivider.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const rect = els.previewBox.getBoundingClientRect();
    comparePos = Math.min(100, Math.max(0, ((ev.clientX - rect.left) / rect.width) * 100));
    els.cmpDivider.style.left = `${comparePos}%`;
    els.editCanvas.style.clipPath = `inset(0 0 0 ${comparePos}%)`;
  };
  const up = () => {
    els.cmpDivider.removeEventListener("pointermove", move);
    els.cmpDivider.removeEventListener("pointerup", up);
  };
  els.cmpDivider.addEventListener("pointermove", move);
  els.cmpDivider.addEventListener("pointerup", up);
  els.editCanvas.style.clipPath = `inset(0 0 0 ${comparePos}%)`;
});

/* ---------------- 启动 ---------------- */

new ResizeObserver(() => void renderPreview()).observe(els.previewWrap);

onTheme(() => {
  document.documentElement.dataset.theme = host.theme();
});
document.documentElement.dataset.theme = host.theme();

onDocState((state) => applyState(state));
void restoreLast();
async function restoreLast() {
  // 面板重建时恢复最近文档(服务端进程存活期间)
  try {
    const state = await api.getLastDocument();
    if (state && !("empty" in state) && state.pages.length) applyState(state);
  } catch {
    /* 无文档时静默 */
  }
}
