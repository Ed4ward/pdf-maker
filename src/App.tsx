import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import TopBar from "@/components/TopBar";
import Workspace, { type CompareView, type SpreadPage } from "@/components/Workspace";
import ThumbPanel from "@/components/ThumbPanel";
import StatusBar from "@/components/StatusBar";
import { pdfjsLib } from "@/lib/pdfSetup";
import { blankPageDataUrl, renderPageToDataUrl } from "@/lib/render";
import { buildReplacedPdf } from "@/lib/exportPdf";
import { loadImage, readAsDataUrl } from "@/lib/image";
import { I18nProvider, useI18n } from "@/i18n";
import type {
  CompareMode,
  PageEntry,
  PDFDocumentProxy,
  Replacement,
  ReplacementPatch,
  TextBox,
  TextBoxPatch,
  ViewMode,
} from "@/types";

/* ---------------- 状态与 reducer ---------------- */

/** 快照式撤销:一次快照覆盖页面顺序/图片替换/文字三类编辑 */
interface Snapshot {
  pageList: PageEntry[];
  replacements: Record<string, Replacement>;
  textBoxes: TextBox[];
}

interface State {
  doc: PDFDocumentProxy | null;
  fileName: string | null;
  pdfBytes: Uint8Array | null;
  /** 当前页面顺序(id 稳定,插入/重排后替换图与文字自动跟随) */
  pageList: PageEntry[];
  thumbs: Record<string, string>;
  fulls: Record<string, string>;
  /** 当前选中页的位置序号 */
  current: number;
  replacements: Record<string, Replacement>;
  textBoxes: TextBox[];
  past: Snapshot[];
  zoom: number;
  /** 预览视图模式:单页 / 双页并排(视图偏好,不属于文档编辑,不进撤销栈) */
  viewMode: ViewMode;
}

const initialState: State = {
  doc: null,
  fileName: null,
  pdfBytes: null,
  pageList: [],
  thumbs: {},
  fulls: {},
  current: 0,
  replacements: {},
  textBoxes: [],
  past: [],
  zoom: 1,
  viewMode: "single",
};

type Action =
  | { type: "docLoaded"; doc: PDFDocumentProxy; fileName: string; bytes: Uint8Array; entries: PageEntry[] }
  | { type: "thumb"; id: string; dataUrl: string }
  | { type: "full"; id: string; dataUrl: string }
  | { type: "select"; idx: number }
  | { type: "addPage"; afterIdx: number }
  | { type: "deletePage"; idx: number }
  | { type: "movePage"; from: number; to: number; pushUndo: boolean }
  | { type: "replace"; id: string; rep: Replacement }
  | { type: "adjust"; id: string; patch: ReplacementPatch; pushUndo: boolean }
  | { type: "revert"; id: string }
  | { type: "addText"; box: TextBox }
  | { type: "updateText"; id: string; patch: TextBoxPatch; pushUndo: boolean }
  | { type: "removeText"; id: string }
  | { type: "undo" }
  | { type: "zoom"; value: number }
  | { type: "viewMode"; value: ViewMode };

const snapshot = (s: State): Snapshot => ({
  pageList: s.pageList,
  replacements: s.replacements,
  textBoxes: s.textBoxes,
});

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "docLoaded":
      return {
        ...state,
        doc: action.doc,
        fileName: action.fileName,
        pdfBytes: action.bytes,
        pageList: action.entries,
        thumbs: {},
        fulls: {},
        current: 0,
        replacements: {},
        textBoxes: [],
        past: [],
        zoom: 1,
      };
    case "thumb":
      return { ...state, thumbs: { ...state.thumbs, [action.id]: action.dataUrl } };
    case "full":
      return { ...state, fulls: { ...state.fulls, [action.id]: action.dataUrl } };
    case "select":
      return { ...state, current: action.idx };
    case "addPage": {
      const entry: PageEntry = {
        id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        srcIndex: null,
        w: 595.28,
        h: 841.89, // A4
      };
      const pageList = [...state.pageList];
      pageList.splice(action.afterIdx + 1, 0, entry);
      return {
        ...state,
        pageList,
        current: action.afterIdx + 1,
        past: [...state.past, snapshot(state)],
      };
    }
    case "deletePage": {
      // 至少保留一页
      if (state.pageList.length <= 1) return state;
      const pageList = [...state.pageList];
      const [removed] = pageList.splice(action.idx, 1);
      const replacements = { ...state.replacements };
      delete replacements[removed.id];
      const textBoxes = state.textBoxes.filter((t) => t.pageId !== removed.id);
      // 选中位置保持不变(后页前移);若删的是最后一页则退到新的最后一页
      const current = Math.min(state.current, pageList.length - 1);
      return {
        ...state,
        pageList,
        replacements,
        textBoxes,
        current,
        past: [...state.past, snapshot(state)],
      };
    }
    case "movePage": {
      const { from, to } = action;
      if (from === to || from < 0 || to < 0 || from >= state.pageList.length || to >= state.pageList.length) {
        return state;
      }
      const pageList = [...state.pageList];
      const [moved] = pageList.splice(from, 1);
      pageList.splice(to, 0, moved);
      // 当前选中页跟随移动,其余位置相应平移
      let current = state.current;
      if (from === current) current = to;
      else if (from < current && to >= current) current -= 1;
      else if (from > current && to <= current) current += 1;
      return {
        ...state,
        pageList,
        current,
        past: action.pushUndo ? [...state.past, snapshot(state)] : state.past,
      };
    }
    case "replace":
      return {
        ...state,
        replacements: { ...state.replacements, [action.id]: action.rep },
        past: [...state.past, snapshot(state)],
      };
    case "adjust": {
      const cur = state.replacements[action.id];
      if (!cur) return state;
      return {
        ...state,
        replacements: {
          ...state.replacements,
          [action.id]: { ...cur, ...action.patch },
        },
        past: action.pushUndo ? [...state.past, snapshot(state)] : state.past,
      };
    }
    case "revert": {
      if (!(action.id in state.replacements)) return state;
      const replacements = { ...state.replacements };
      delete replacements[action.id];
      return { ...state, replacements, past: [...state.past, snapshot(state)] };
    }
    case "addText":
      return {
        ...state,
        textBoxes: [...state.textBoxes, action.box],
        past: [...state.past, snapshot(state)],
      };
    case "updateText": {
      const target = state.textBoxes.find((t) => t.id === action.id);
      if (!target) return state;
      return {
        ...state,
        textBoxes: state.textBoxes.map((t) => (t.id === action.id ? { ...t, ...action.patch } : t)),
        past: action.pushUndo ? [...state.past, snapshot(state)] : state.past,
      };
    }
    case "removeText":
      return {
        ...state,
        textBoxes: state.textBoxes.filter((t) => t.id !== action.id),
        past: [...state.past, snapshot(state)],
      };
    case "undo": {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        pageList: prev.pageList,
        replacements: prev.replacements,
        textBoxes: prev.textBoxes,
        past: state.past.slice(0, -1),
      };
    }
    case "zoom":
      return { ...state, zoom: Math.min(3, Math.max(0.25, action.value)) };
    case "viewMode":
      return state.viewMode === action.value ? state : { ...state, viewMode: action.value };
  }
}

/* ---------------- 应用主体 ---------------- */

export default function App() {
  return (
    <I18nProvider>
      <TooltipProvider>
        <EditorApp />
        <Toaster position="bottom-center" richColors />
      </TooltipProvider>
    </I18nProvider>
  );
}

function EditorApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [docLoading, setDocLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  /** 预览区可见页的高清图,按页面 id 索引(双页模式需同时备好两页) */
  const [previewSrcs, setPreviewSrcs] = useState<Record<string, string>>({});
  const [compare, setCompare] = useState<CompareView | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const loadTokenRef = useRef(0);
  const { t } = useI18n();

  const hasDoc = !!state.doc;
  const currentEntry = state.pageList[state.current];
  const currentReplacement = currentEntry ? state.replacements[currentEntry.id] ?? null : null;
  const replacedCount = Object.keys(state.replacements).length;

  /* -- 预览可见页(单页 = 当前页;双页 = 当前页所在 (0,1)(2,3)… 对页) -- */
  const spreadStart = state.viewMode === "double" ? state.current - (state.current % 2) : state.current;
  const spreadIndices: number[] = [];
  if (state.viewMode === "double") {
    for (const idx of [spreadStart, spreadStart + 1]) {
      if (idx >= 0 && idx < state.pageList.length) spreadIndices.push(idx);
    }
  } else if (state.pageList.length > 0) {
    spreadIndices.push(state.current);
  }
  const spreadKey = spreadIndices.join(",");

  /* -- 文档打开 -- */
  const openDocument = useCallback(async (bytes: Uint8Array, fileName: string) => {
    const token = ++loadTokenRef.current;
    setDocLoading(true);
    setLoadingText(t("loading.parse"));
    try {
      // pdf.js 会转移 ArrayBuffer,传入副本
      const doc = await pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
      const entries: PageEntry[] = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1 });
        entries.push({ id: `p${i}`, srcIndex: i - 1, w: vp.width, h: vp.height });
      }
      if (token !== loadTokenRef.current) return;
      dispatch({ type: "docLoaded", doc, fileName, bytes, entries });
      setDocLoading(false);
      // 缩略图后台逐页渲染(新建空白页直接生成白底)
      for (const entry of entries) {
        if (token !== loadTokenRef.current) return;
        const url =
          entry.srcIndex != null
            ? await renderPageToDataUrl(doc, entry.srcIndex, 460, 0.82)
            : blankPageDataUrl(entry.w, entry.h, 460);
        dispatch({ type: "thumb", id: entry.id, dataUrl: url });
      }
      toast.success(t("toast.opened", { name: fileName, n: doc.numPages }));
    } catch (err) {
      console.error(err);
      if (token === loadTokenRef.current) {
        setDocLoading(false);
        toast.error(t("toast.parseFailed"));
      }
    }
  }, [t]);

  const handlePdfFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        toast.error(t("toast.needPdf"));
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await openDocument(bytes, file.name);
    },
    [openDocument, state.replacements, t]
  );

  /* -- 替换 / 恢复 / 撤销 -- */
  const handleImageFile = useCallback(
    async (file: File | undefined, pageId?: string) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error(t("toast.needImage"));
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(t("toast.imageTooLarge"));
        return;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        const img = await loadImage(dataUrl);
        // 双页模式下拖放落在哪页就替换哪页;缺省为当前页
        const idx = pageId ? state.pageList.findIndex((p) => p.id === pageId) : state.current;
        const entry = state.pageList[idx];
        if (!entry) return;
        setCompare(null);
        dispatch({
          type: "replace",
          id: entry.id,
          rep: {
            dataUrl,
            w: img.naturalWidth,
            h: img.naturalHeight,
            name: file.name,
            fit: "contain",
            scale: 1,
            offsetX: 0,
            offsetY: 0,
          },
        });
        toast.success(t("toast.replaced", { page: idx + 1, name: file.name }));
      } catch (err) {
        console.error(err);
        toast.error(t("toast.imageReadFailed"));
      }
    },
    [state.current, state.pageList, t]
  );

  /* -- 替换图排版调整(contain/cover、缩放、拖动位置),按页面 id 定位 -- */
  const handleAdjust = useCallback((id: string, patch: ReplacementPatch, pushUndo: boolean) => {
    dispatch({ type: "adjust", id, patch, pushUndo });
  }, []);

  const handleRevert = useCallback(() => {
    if (!(currentEntry.id in state.replacements)) return;
    setCompare(null);
    dispatch({ type: "revert", id: currentEntry.id });
    toast.info(t("toast.reverted", { page: state.current + 1 }));
  }, [currentEntry, state.current, state.replacements, t]);

  /* -- 新建页面 / 拖拽排序 -- */
  const handleAddPage = useCallback(() => {
    setCompare(null);
    setSelectedTextId(null);
    setEditingTextId(null);
    dispatch({ type: "addPage", afterIdx: state.current });
    toast.success(t("toast.pageAdded", { page: state.current + 1 }));
  }, [state.current, t]);

  const handleMovePage = useCallback(
    (from: number, to: number, pushUndo: boolean) => {
      if (from === to) return;
      setCompare(null);
      dispatch({ type: "movePage", from, to, pushUndo });
      toast.success(t("toast.pageMoved", { from: from + 1, to: to + 1 }));
    },
    [t]
  );

  const handleDeletePage = useCallback(() => {
    if (state.pageList.length <= 1) {
      toast.info(t("toast.keepOnePage"));
      return;
    }
    setCompare(null);
    setSelectedTextId(null);
    setEditingTextId(null);
    dispatch({ type: "deletePage", idx: state.current });
    toast.success(t("toast.pageDeleted", { page: state.current + 1 }));
  }, [state.current, state.pageList.length, t]);

  const handleUndo = useCallback(() => {
    if (state.past.length === 0) return;
    dispatch({ type: "undo" });
    toast.info(t("toast.undone"));
  }, [state.past, t]);

  /* -- 文字框 -- */
  const addTextWithData = useCallback(
    (
      text: string,
      opts: { x?: number; y?: number; size?: number; color?: string } = {},
    ) => {
      if (!state.doc || !currentEntry) return;
      const box: TextBox = {
        id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        pageId: currentEntry.id,
        x: opts.x ?? 0.5,
        y: opts.y ?? 0.45,
        text,
        size: opts.size ?? 0.06,
        color: opts.color ?? "#1e293b",
      };
      dispatch({ type: "addText", box });
      setSelectedTextId(box.id);
      setEditingTextId(box.id);
    },
    [state.doc, currentEntry]
  );

  const handleAddText = useCallback(() => {
    setCompare(null);
    addTextWithData("输入文字");
  }, [addTextWithData]);

  const handleSelectText = useCallback((id: string | null) => {
    setSelectedTextId(id);
    if (id === null) setEditingTextId(null);
  }, []);

  const handleStartEditText = useCallback((id: string) => {
    setSelectedTextId(id);
    setEditingTextId(id);
  }, []);

  const handleCommitText = useCallback((id: string, text: string) => {
    setEditingTextId(null);
    dispatch({ type: "updateText", id, patch: { text }, pushUndo: true });
  }, []);

  const handleMoveText = useCallback((id: string, x: number, y: number, pushUndo: boolean) => {
    dispatch({ type: "updateText", id, patch: { x, y }, pushUndo });
  }, []);

  const handlePatchText = useCallback((id: string, patch: TextBoxPatch) => {
    dispatch({ type: "updateText", id, patch, pushUndo: true });
  }, []);

  const handleRemoveText = useCallback(
    (id: string) => {
      setSelectedTextId(null);
      setEditingTextId(null);
      dispatch({ type: "removeText", id });
      toast.info(t("toast.textDeleted"));
    },
    [t]
  );

  /* -- 导出 -- */
  const getPageRender = useCallback(
    async (id: string): Promise<string> => {
      if (state.fulls[id]) return state.fulls[id];
      const entry = state.pageList.find((p) => p.id === id);
      if (!entry || !state.doc) throw new Error(`页面不存在:${id}`);
      const url =
        entry.srcIndex != null
          ? await renderPageToDataUrl(state.doc, entry.srcIndex, 1600, 0.92)
          : blankPageDataUrl(entry.w, entry.h, 1600);
      dispatch({ type: "full", id, dataUrl: url });
      return url;
    },
    [state.doc, state.fulls, state.pageList]
  );

  const handleExport = useCallback(async () => {
    if (!state.pdfBytes || (replacedCount === 0 && state.textBoxes.length === 0)) return;
    setDocLoading(true);
    setLoadingText(t("loading.export"));
    try {
      const bytes = await buildReplacedPdf(
        state.pdfBytes,
        state.pageList,
        state.replacements,
        state.textBoxes,
        getPageRender
      );
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const base = (state.fileName ?? "document").replace(/\.pdf$/i, "");
      a.href = url;
      a.download = `${base}-替换版.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toast.exported"));
    } catch (err) {
      console.error(err);
      toast.error(t("toast.exportFailed"));
    } finally {
      setDocLoading(false);
    }
  }, [state.pdfBytes, state.pageList, state.replacements, state.textBoxes, state.fileName, replacedCount, getPageRender, t]);

  /* -- 对比(在预览区原地展示) -- */
  const openCompare = useCallback(
    async (idx = state.current, mode: CompareMode = "side") => {
      const entry = state.pageList[idx];
      const rep = entry ? state.replacements[entry.id] : undefined;
      if (!rep || !state.doc || !entry) return;
      setDocLoading(true);
      setLoadingText(t("loading.compare"));
      try {
        const before =
          state.fulls[entry.id] ??
          (entry.srcIndex != null
            ? await renderPageToDataUrl(state.doc, entry.srcIndex, 1600, 0.92)
            : blankPageDataUrl(entry.w, entry.h, 1600));
        dispatch({ type: "full", id: entry.id, dataUrl: before });
        setCompare({ index: idx, mode, before, after: rep });
      } catch (err) {
        console.error(err);
        toast.error(t("toast.compareFailed"));
      } finally {
        setDocLoading(false);
      }
    },
    [state.current, state.doc, state.fulls, state.pageList, state.replacements, t]
  );

  // 切页即退出对比,避免画面与新选中页不一致
  useEffect(() => {
    if (compare && state.current !== compare.index) setCompare(null);
  }, [compare, state.current]);

  /* -- 可见页预览渲染(缩略图先行,高清图后台补) -- */
  useEffect(() => {
    if (!state.doc || spreadIndices.length === 0) {
      setPreviewSrcs({});
      return;
    }
    let cancelled = false;
    const next: Record<string, string> = {};
    const pending: PageEntry[] = [];
    for (const idx of spreadIndices) {
      const entry = state.pageList[idx];
      if (!entry) continue;
      const rep = state.replacements[entry.id];
      if (rep) {
        next[entry.id] = rep.dataUrl;
        continue;
      }
      const cached = state.fulls[entry.id];
      if (cached) {
        next[entry.id] = cached;
        continue;
      }
      next[entry.id] = state.thumbs[entry.id] ?? "";
      pending.push(entry);
    }
    setPreviewSrcs(next);
    for (const entry of pending) {
      const url =
        entry.srcIndex != null
          ? renderPageToDataUrl(state.doc, entry.srcIndex, 1600, 0.92)
          : Promise.resolve(blankPageDataUrl(entry.w, entry.h, 1600));
      url.then((data) => {
        if (!cancelled) dispatch({ type: "full", id: entry.id, dataUrl: data });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [state.doc, spreadKey, state.pageList, state.replacements, state.fulls, state.thumbs]);

  /* -- 键盘快捷键 -- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (compare) return; // 对比模式下由 Workspace 处理
      if (editingTextId) return; // 文字编辑中不响应页面级快捷键
      if (!state.doc) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        handleUndo();
      } else if (e.key === "ArrowLeft" && state.current > 0) {
        dispatch({ type: "select", idx: state.current - 1 });
      } else if (e.key === "ArrowRight" && state.current < state.pageList.length - 1) {
        dispatch({ type: "select", idx: state.current + 1 });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compare, editingTextId, state.doc, state.current, state.pageList.length, handleUndo]);

  /* -- 拖拽 -- */
  const handleDropFile = useCallback(
    (file: File, pageId?: string) => {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        if ((replacedCount > 0 || state.textBoxes.length > 0) && !confirm(t("confirm.openNew"))) {
          return;
        }
        handlePdfFile(file);
      } else if (file.type.startsWith("image/")) {
        if (!state.doc) {
          toast.info(t("toast.keepPdfFirst"));
          return;
        }
        handleImageFile(file, pageId);
      }
    },
    [handlePdfFile, handleImageFile, state.doc, state.textBoxes, replacedCount, t]
  );

  /* -- 启动:空状态,等待用户打开 PDF -- */

  const spreadPages: SpreadPage[] = [];
  for (const idx of spreadIndices) {
    const entry = state.pageList[idx];
    if (!entry) continue;
    spreadPages.push({
      index: idx,
      id: entry.id,
      w: entry.w,
      h: entry.h,
      src: previewSrcs[entry.id] ?? "",
      replacement: state.replacements[entry.id] ?? null,
      texts: state.textBoxes.filter((tb) => tb.pageId === entry.id),
      active: idx === state.current,
    });
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar
        hasDoc={hasDoc}
        canRevert={!!currentReplacement}
        canCompare={!!currentReplacement}
        canUndo={state.past.length > 0}
        canExport={hasDoc && (replacedCount > 0 || state.textBoxes.length > 0)}
        canDeletePage={hasDoc && state.pageList.length > 1}
        hasEdits={replacedCount > 0 || state.textBoxes.length > 0}
        currentPage={state.current + 1}
        viewMode={state.viewMode}
        onViewMode={(value) => dispatch({ type: "viewMode", value })}
        onOpen={() => filePdfRef.current?.click()}
        onAddPage={handleAddPage}
        onAddText={handleAddText}
        onReplace={() => fileImageRef.current?.click()}
        onRevert={handleRevert}
        onDeletePage={handleDeletePage}
        onCompare={() => (compare ? setCompare(null) : openCompare())}
        onUndo={handleUndo}
        onExport={handleExport}
      />

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <Workspace
          hasDoc={hasDoc}
          docLoading={docLoading}
          loadingText={loadingText}
          pages={spreadPages}
          zoom={state.zoom}
          compare={compare}
          onZoom={(value) => dispatch({ type: "zoom", value })}
          onAdjust={handleAdjust}
          selectedTextId={selectedTextId}
          editingTextId={editingTextId}
          onSelectPage={(idx) => dispatch({ type: "select", idx })}
          onSelectText={handleSelectText}
          onStartEditText={handleStartEditText}
          onCommitText={handleCommitText}
          onMoveText={handleMoveText}
          onPatchText={handlePatchText}
          onRemoveText={handleRemoveText}
          onCompareMode={(mode) => setCompare((c) => (c ? { ...c, mode } : c))}
          onExitCompare={() => setCompare(null)}
          onOpen={() => filePdfRef.current?.click()}
          onDropFile={handleDropFile}
        />
        {hasDoc && (
          <ThumbPanel
            entries={state.pageList}
            thumbs={state.thumbs}
            replacements={state.replacements}
            textBoxes={state.textBoxes}
            current={state.current}
            onSelect={(idx) => dispatch({ type: "select", idx })}
            onMovePage={handleMovePage}
          />
        )}
      </main>

      <StatusBar
        fileName={state.fileName}
        current={state.current}
        total={state.pageList.length}
        replacedCount={replacedCount}
        zoom={state.zoom}
      />

      <input
        ref={filePdfRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          handlePdfFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={fileImageRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleImageFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
