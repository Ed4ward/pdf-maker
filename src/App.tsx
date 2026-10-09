import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import TopBar from "@/components/TopBar";
import Workspace, { type CompareView } from "@/components/Workspace";
import ThumbPanel from "@/components/ThumbPanel";
import StatusBar from "@/components/StatusBar";
import { pdfjsLib } from "@/lib/pdfSetup";
import { blankPageDataUrl, renderPageToDataUrl } from "@/lib/render";
import { buildReplacedPdf } from "@/lib/exportPdf";
import { loadImage, readAsDataUrl } from "@/lib/image";
import type {
  CompareMode,
  PageEntry,
  PDFDocumentProxy,
  Replacement,
  ReplacementPatch,
  TextBox,
  TextBoxPatch,
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
  | { type: "zoom"; value: number };

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
  }
}

/* ---------------- 应用主体 ---------------- */

export default function App() {
  return (
    <TooltipProvider>
      <EditorApp />
      <Toaster position="bottom-center" richColors />
    </TooltipProvider>
  );
}

function EditorApp() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [docLoading, setDocLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [previewSrc, setPreviewSrc] = useState("");
  const [compare, setCompare] = useState<CompareView | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const loadTokenRef = useRef(0);

  const hasDoc = !!state.doc;
  const currentEntry = state.pageList[state.current];
  const currentReplacement = currentEntry ? state.replacements[currentEntry.id] ?? null : null;
  const replacedCount = Object.keys(state.replacements).length;
  // 当前页的文字框(对比打开时 compare.index === current)
  const currentTexts = currentEntry
    ? state.textBoxes.filter((t) => t.pageId === currentEntry.id)
    : [];

  /* -- 文档打开 -- */
  const openDocument = useCallback(async (bytes: Uint8Array, fileName: string) => {
    const token = ++loadTokenRef.current;
    setDocLoading(true);
    setLoadingText("正在解析 PDF…");
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
      toast.success(`已打开「${fileName}」,共 ${doc.numPages} 页`);
    } catch (err) {
      console.error(err);
      if (token === loadTokenRef.current) {
        setDocLoading(false);
        toast.error("PDF 解析失败,请换一个文件试试");
      }
    }
  }, []);

  const handlePdfFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
        toast.error("请选择 PDF 文件");
        return;
      }
      if (Object.keys(state.replacements).length > 0 && !confirm("打开新文档将丢弃当前所有替换操作,确定继续?")) {
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await openDocument(bytes, file.name);
    },
    [openDocument, state.replacements]
  );

  /* -- 替换 / 恢复 / 撤销 -- */
  const handleImageFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        toast.error("请选择图片文件(PNG / JPG / WebP)");
        return;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error("图片超过 20MB,原型阶段暂不支持");
        return;
      }
      try {
        const dataUrl = await readAsDataUrl(file);
        const img = await loadImage(dataUrl);
        setCompare(null);
        dispatch({
          type: "replace",
          id: currentEntry.id,
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
        toast.success(`第 ${state.current + 1} 页已替换为图片「${file.name}」,可拖动图片或用底部工具调整`);
      } catch (err) {
        console.error(err);
        toast.error("图片读取失败");
      }
    },
    [currentEntry]
  );

  /* -- 替换图排版调整(contain/cover、缩放、拖动位置) -- */
  const handleAdjust = useCallback(
    (patch: ReplacementPatch, pushUndo: boolean) => {
      dispatch({ type: "adjust", id: currentEntry.id, patch, pushUndo });
    },
    [currentEntry]
  );

  const handleRevert = useCallback(() => {
    if (!(currentEntry.id in state.replacements)) return;
    setCompare(null);
    dispatch({ type: "revert", id: currentEntry.id });
    toast.info(`第 ${state.current + 1} 页已恢复为原始内容`);
  }, [currentEntry, state.current, state.replacements]);

  /* -- 新建页面 / 拖拽排序 -- */
  const handleAddPage = useCallback(() => {
    setCompare(null);
    setSelectedTextId(null);
    setEditingTextId(null);
    dispatch({ type: "addPage", afterIdx: state.current });
    toast.success(`已在第 ${state.current + 1} 页后插入空白页`);
  }, [state.current]);

  const handleMovePage = useCallback(
    (from: number, to: number, pushUndo: boolean) => {
      if (from === to) return;
      setCompare(null);
      dispatch({ type: "movePage", from, to, pushUndo });
      toast.success(`页面已从第 ${from + 1} 页移动到第 ${to + 1} 页`);
    },
    []
  );

  const handleDeletePage = useCallback(() => {
    if (state.pageList.length <= 1) {
      toast.info("至少需要保留一页");
      return;
    }
    // 二次确认:该页的替换图与文字会一并删除
    if (!confirm(`确定删除第 ${state.current + 1} 页?该页的替换图与文字将一并移除(可通过撤销恢复)。`)) {
      return;
    }
    setCompare(null);
    setSelectedTextId(null);
    setEditingTextId(null);
    dispatch({ type: "deletePage", idx: state.current });
    toast.success(`已删除第 ${state.current + 1} 页(⌘Z 可恢复)`);
  }, [state.current, state.pageList.length]);

  const handleUndo = useCallback(() => {
    if (state.past.length === 0) return;
    dispatch({ type: "undo" });
    toast.info("已撤销上一步操作");
  }, [state.past]);

  /* -- 文字框 -- */
  const handleAddText = useCallback(() => {
    setCompare(null);
    const box: TextBox = {
      id: `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      pageId: currentEntry.id,
      x: 0.5,
      y: 0.45,
      text: "输入文字",
      size: 0.06,
      color: "#1e293b",
    };
    dispatch({ type: "addText", box });
    setSelectedTextId(box.id);
    setEditingTextId(box.id);
  }, [currentEntry]);

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
      toast.info("已删除文字框(⌘Z 可恢复)");
    },
    []
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
    setLoadingText("正在生成 PDF…");
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
      toast.success("已导出替换后的 PDF");
    } catch (err) {
      console.error(err);
      toast.error("导出失败,请查看控制台");
    } finally {
      setDocLoading(false);
    }
  }, [state.pdfBytes, state.pageList, state.replacements, state.textBoxes, state.fileName, replacedCount, getPageRender]);

  /* -- 对比(在预览区原地展示) -- */
  const openCompare = useCallback(
    async (idx = state.current, mode: CompareMode = "side") => {
      const entry = state.pageList[idx];
      const rep = entry ? state.replacements[entry.id] : undefined;
      if (!rep || !state.doc || !entry) return;
      setDocLoading(true);
      setLoadingText("正在准备对比…");
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
        toast.error("对比准备失败");
      } finally {
        setDocLoading(false);
      }
    },
    [state.current, state.doc, state.fulls, state.pageList, state.replacements]
  );

  // 切页即退出对比,避免画面与新选中页不一致
  useEffect(() => {
    if (compare && state.current !== compare.index) setCompare(null);
  }, [compare, state.current]);

  /* -- 当前页预览渲染 -- */
  const pageInfo = currentEntry;
  useEffect(() => {
    if (!state.doc || !currentEntry) {
      setPreviewSrc("");
      return;
    }
    const id = currentEntry.id;
    const rep = state.replacements[id];
    if (rep) {
      setPreviewSrc(rep.dataUrl);
      return;
    }
    const cached = state.fulls[id];
    if (cached) {
      setPreviewSrc(cached);
      return;
    }
    // 先显示缩略图,高清图后台渲染
    setPreviewSrc(state.thumbs[id] ?? "");
    let cancelled = false;
    const url =
      currentEntry.srcIndex != null
        ? renderPageToDataUrl(state.doc, currentEntry.srcIndex, 1600, 0.92)
        : Promise.resolve(blankPageDataUrl(currentEntry.w, currentEntry.h, 1600));
    url.then((data) => {
      if (!cancelled) dispatch({ type: "full", id, dataUrl: data });
    });
    return () => {
      cancelled = true;
    };
  }, [state.doc, currentEntry, state.replacements, state.fulls, state.thumbs]);

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
    (file: File) => {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        handlePdfFile(file);
      } else if (file.type.startsWith("image/")) {
        if (!state.doc) {
          toast.info("请先打开 PDF 文档");
          return;
        }
        handleImageFile(file);
      }
    },
    [handlePdfFile, handleImageFile, state.doc]
  );

  /* -- 启动:空状态,等待用户打开 PDF -- */

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <TopBar
        hasDoc={hasDoc}
        canRevert={!!currentReplacement}
        canCompare={!!currentReplacement}
        canUndo={state.past.length > 0}
        canExport={hasDoc && (replacedCount > 0 || state.textBoxes.length > 0)}
        canDeletePage={hasDoc && state.pageList.length > 1}
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

      <main className="flex min-h-0 flex-1">
        <Workspace
          hasDoc={hasDoc}
          docLoading={docLoading}
          loadingText={loadingText}
          pageInfo={pageInfo}
          previewSrc={previewSrc}
          replacement={currentReplacement}
          textBoxes={currentTexts}
          selectedTextId={selectedTextId}
          editingTextId={editingTextId}
          zoom={state.zoom}
          compare={compare}
          onZoom={(value) => dispatch({ type: "zoom", value })}
          onAdjust={handleAdjust}
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
