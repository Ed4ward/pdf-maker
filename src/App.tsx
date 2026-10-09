import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import TopBar from "@/components/TopBar";
import Workspace, { type CompareView, type SpreadPage } from "@/components/Workspace";
import ThumbPanel from "@/components/ThumbPanel";
import StatusBar from "@/components/StatusBar";
import PageSizeDialog from "@/components/PageSizeDialog";
import { pdfjsLib } from "@/lib/pdfSetup";
import { renderPageToDataUrl } from "@/lib/render";
import { buildReplacedPdf } from "@/lib/exportPdf";
import { loadImage, readAsDataUrl } from "@/lib/image";
import { clearSession, loadSession, saveSession, type StoredSession } from "@/lib/session";
import { pageGeoKey, pageGeometryEdited } from "@/lib/utils";
import { I18nProvider, useI18n } from "@/i18n";
import type {
  CompareMode,
  PageEntry,
  PageRotation,
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
  /** Zen 模式:隐藏顶栏/缩略图/状态栏的沉浸预览(视图偏好,不进撤销栈) */
  zen: boolean;
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
  zen: false,
};

type Action =
  | { type: "docLoaded"; doc: PDFDocumentProxy; fileName: string; bytes: Uint8Array; entries: PageEntry[] }
  | { type: "sessionRestored"; doc: PDFDocumentProxy; session: StoredSession }
  | { type: "thumb"; key: string; dataUrl: string }
  | { type: "full"; key: string; dataUrl: string }
  | { type: "select"; idx: number }
  | { type: "addPage"; afterIdx: number }
  | { type: "deletePage"; idx: number }
  | { type: "movePage"; from: number; to: number; pushUndo: boolean }
  | { type: "rotatePage"; idx: number; delta: 90 | -90 }
  | { type: "resizePage"; idx: number; w: number; h: number }
  | { type: "resizeAllPages"; w: number; h: number }
  | { type: "replace"; id: string; rep: Replacement }
  | { type: "adjust"; id: string; patch: ReplacementPatch; pushUndo: boolean }
  | { type: "revert"; id: string }
  | { type: "addText"; box: TextBox }
  | { type: "updateText"; id: string; patch: TextBoxPatch; pushUndo: boolean }
  | { type: "removeText"; id: string }
  | { type: "undo" }
  | { type: "zoom"; value: number }
  | { type: "viewMode"; value: ViewMode }
  | { type: "zen"; value: boolean };

const snapshot = (s: State): Snapshot => ({
  pageList: s.pageList,
  replacements: s.replacements,
  textBoxes: s.textBoxes,
});

/** 规范化到 0/90/180/270 */
const normRotation = (deg: number): PageRotation => (((((deg % 360) + 360) % 360) || 0) as PageRotation);

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
    case "sessionRestored":
      return {
        ...state,
        doc: action.doc,
        fileName: action.session.fileName,
        pdfBytes: action.session.pdfBytes,
        pageList: action.session.pageList,
        replacements: action.session.replacements,
        textBoxes: action.session.textBoxes,
        current: Math.min(action.session.current, action.session.pageList.length - 1),
        viewMode: action.session.viewMode,
        zoom: action.session.zoom,
        thumbs: {},
        fulls: {},
        past: [],
      };
    case "thumb":
      return { ...state, thumbs: { ...state.thumbs, [action.key]: action.dataUrl } };
    case "full":
      return { ...state, fulls: { ...state.fulls, [action.key]: action.dataUrl } };
    case "select":
      return { ...state, current: action.idx };
    case "addPage": {
      const entry: PageEntry = {
        id: `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        srcIndex: null,
        w: 595.28,
        h: 841.89, // A4
        rotation: 0,
        origW: 595.28,
        origH: 841.89,
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
    case "rotatePage": {
      const cur = state.pageList[action.idx];
      if (!cur) return state;
      // 旋转只作用于原始内容;90/270 时显示宽高互换,替换图/文字保持在显示坐标系
      const swap = action.delta % 180 !== 0;
      const pageList = state.pageList.map((p, i) =>
        i === action.idx
          ? {
              ...p,
              rotation: normRotation((p.rotation ?? 0) + action.delta),
              w: swap ? p.h : p.w,
              h: swap ? p.w : p.h,
            }
          : p
      );
      return { ...state, pageList, past: [...state.past, snapshot(state)] };
    }
    case "resizePage": {
      const cur = state.pageList[action.idx];
      if (!cur) return state;
      const pageList = state.pageList.map((p, i) =>
        i === action.idx ? { ...p, w: action.w, h: action.h } : p
      );
      return { ...state, pageList, past: [...state.past, snapshot(state)] };
    }
    case "resizeAllPages": {
      const pageList = state.pageList.map((p) => ({ ...p, w: action.w, h: action.h }));
      return { ...state, pageList, past: [...state.past, snapshot(state)] };
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
    case "zen":
      return state.zen === action.value ? state : { ...state, zen: action.value };
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
  /** 「打开新文档」确认弹窗(页面操作栏打开按钮触发) */
  const [openConfirmOpen, setOpenConfirmOpen] = useState(false);
  /** 「删除此页」确认弹窗(⌘⌫ 快捷键与页面操作栏共用) */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  /** 页面尺寸对话框(页面操作栏打开) */
  const [sizeOpen, setSizeOpen] = useState(false);
  const filePdfRef = useRef<HTMLInputElement>(null);
  const fileImageRef = useRef<HTMLInputElement>(null);
  const loadTokenRef = useRef(0);
  /** 在途缩略图渲染(按几何键),避免 effect 重复派发 */
  const thumbInFlightRef = useRef<Set<string>>(new Set());
  const { t } = useI18n();

  const hasDoc = !!state.doc;
  const currentEntry = state.pageList[state.current];
  const currentReplacement = currentEntry ? state.replacements[currentEntry.id] ?? null : null;
  const replacedCount = Object.keys(state.replacements).length;
  const geometryEdited = useMemo(
    () => state.pageList.some(pageGeometryEdited),
    [state.pageList]
  );
  // 新增空白页(srcIndex === null)同样属于需要导出的编辑
  const hasBlankPage = useMemo(() => state.pageList.some((p) => p.srcIndex === null), [state.pageList]);
  const hasEdits = replacedCount > 0 || state.textBoxes.length > 0 || geometryEdited || hasBlankPage;

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
        entries.push({
          id: `p${i}`,
          srcIndex: i - 1,
          w: vp.width,
          h: vp.height,
          rotation: 0,
          origW: vp.width,
          origH: vp.height,
        });
      }
      if (token !== loadTokenRef.current) return;
      dispatch({ type: "docLoaded", doc, fileName, bytes, entries });
      setDocLoading(false);
      // 缩略图由下方的 effect 按「id + 尺寸 + 旋转」几何键统一渲染
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

  /* -- 旋转 / 页面尺寸 -- */
  const handleRotate = useCallback(
    (delta: 90 | -90) => {
      if (!currentEntry) return;
      setCompare(null);
      dispatch({ type: "rotatePage", idx: state.current, delta });
      toast.success(t("toast.rotated", { page: state.current + 1, deg: delta > 0 ? 90 : -90 }));
    },
    [currentEntry, state.current, t]
  );

  const handleResize = useCallback(
    (w: number, h: number, all: boolean) => {
      if (!currentEntry) return;
      setCompare(null);
      if (all) {
        dispatch({ type: "resizeAllPages", w, h });
        toast.success(t("toast.resizedAll", { n: state.pageList.length, w: Math.round(w), h: Math.round(h) }));
      } else {
        dispatch({ type: "resizePage", idx: state.current, w, h });
        toast.success(t("toast.resizedPage", { page: state.current + 1, w: Math.round(w), h: Math.round(h) }));
      }
    },
    [currentEntry, state.current, state.pageList.length, t]
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

  /* -- Zen 模式切换:进入时请求浏览器全屏,退出时还原(需用户手势,失败静默) -- */
  const handleToggleZen = useCallback(() => {
    const entering = !state.zen;
    dispatch({ type: "zen", value: entering });
    try {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
        webkitExitFullscreen?: () => void;
      };
      const root = doc.documentElement as HTMLElement & {
        webkitRequestFullscreen?: () => void;
      };
      if (entering) {
        if (doc.fullscreenElement ?? doc.webkitFullscreenElement) return;
        (root.requestFullscreen?.() ?? root.webkitRequestFullscreen?.())?.catch(() => {});
      } else if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
        (document.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch?.(() => {});
      }
    } catch {
      /* 全屏不可用时静默降级为纯 Zen 模式 */
    }
  }, [state.zen]);

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
    addTextWithData(t("text.defaultText"));
  }, [addTextWithData, t]);

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
      const entry = state.pageList.find((p) => p.id === id);
      if (!entry || !state.doc) throw new Error(`页面不存在:${id}`);
      const key = pageGeoKey(entry);
      if (state.fulls[key]) return state.fulls[key];
      const url = await renderPageToDataUrl(state.doc, entry, 1600, 0.92);
      dispatch({ type: "full", key, dataUrl: url });
      return url;
    },
    [state.doc, state.fulls, state.pageList]
  );

  const handleExport = useCallback(async () => {
    if (!state.pdfBytes || !hasEdits) return;
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
      a.download = `${base}-${t("export.fileSuffix")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("toast.exported"));
    } catch (err) {
      console.error(err);
      toast.error(t("toast.exportFailed"));
    } finally {
      setDocLoading(false);
    }
  }, [state.pdfBytes, state.pageList, state.replacements, state.textBoxes, state.fileName, hasEdits, getPageRender, t]);

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
          state.fulls[pageGeoKey(entry)] ??
          (await renderPageToDataUrl(state.doc, entry, 1600, 0.92));
        dispatch({ type: "full", key: pageGeoKey(entry), dataUrl: before });
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
      const key = pageGeoKey(entry);
      const cached = state.fulls[key];
      if (cached) {
        next[entry.id] = cached;
        continue;
      }
      next[entry.id] = state.thumbs[key] ?? "";
      pending.push(entry);
    }
    setPreviewSrcs(next);
    for (const entry of pending) {
      const key = pageGeoKey(entry);
      // 先补一张 460px 缩略图顶位(旋转/改尺寸后缓存全部失效,避免长时间白屏),
      // 高清图随后替换
      let thumbUrl = state.thumbs[key];
      const needThumb = !thumbUrl && !thumbInFlightRef.current.has(key);
      if (needThumb) {
        thumbInFlightRef.current.add(key);
        renderPageToDataUrl(state.doc, entry, 460, 0.82)
          .then((data) => {
            dispatch({ type: "thumb", key, dataUrl: data });
          })
          .catch((err) => console.error("缩略图渲染失败", err))
          .finally(() => thumbInFlightRef.current.delete(key));
      }
      renderPageToDataUrl(state.doc, entry, 1600, 0.92).then((data) => {
        if (!cancelled) dispatch({ type: "full", key, dataUrl: data });
      });
    }
    return () => {
      cancelled = true;
    };
  }, [state.doc, spreadKey, state.pageList, state.replacements, state.fulls, state.thumbs]);

  /* -- 缩略图渲染:按「id + 尺寸 + 旋转」几何键缓存,
       旋转 / 改尺寸 / 撤销 / 换文档后自动重渲。
       不用 cleanup 取消在途链(dispatch 后 effect 会重跑,取消会让未执行页被
       in-flight 集合挡住而饿死);换文档场景由 loadTokenRef 守卫 -- */
  useEffect(() => {
    if (!state.doc) return;
    const doc = state.doc;
    const token = loadTokenRef.current;
    let chain: Promise<void> = Promise.resolve();
    for (const entry of state.pageList) {
      const key = pageGeoKey(entry);
      if (state.thumbs[key] || thumbInFlightRef.current.has(key)) continue;
      thumbInFlightRef.current.add(key);
      chain = chain.then(async () => {
        try {
          if (loadTokenRef.current !== token) return;
          const url = await renderPageToDataUrl(doc, entry, 460, 0.82);
          if (loadTokenRef.current === token) {
            dispatch({ type: "thumb", key, dataUrl: url });
          }
        } catch (err) {
          console.error("缩略图渲染失败", err);
        } finally {
          thumbInFlightRef.current.delete(key);
        }
      });
    }
  }, [state.doc, state.pageList, state.thumbs]);

  /* -- 会话本地持久化:编辑状态变化后防抖写入 IndexedDB,刷新后自动还原。
       位图缓存(thumbs/fulls)不入库,还原后按几何键自动重渲 -- */
  useEffect(() => {
    if (!state.doc || !state.pdfBytes || !state.fileName) return;
    const { fileName, pdfBytes } = state;
    const timer = setTimeout(() => {
      void saveSession({
        version: 1,
        savedAt: Date.now(),
        fileName,
        pdfBytes,
        pageList: state.pageList,
        replacements: state.replacements,
        textBoxes: state.textBoxes,
        current: state.current,
        viewMode: state.viewMode,
        zoom: state.zoom,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [
    state.doc,
    state.fileName,
    state.pdfBytes,
    state.pageList,
    state.replacements,
    state.textBoxes,
    state.current,
    state.viewMode,
    state.zoom,
  ]);

  /* -- 启动时还原上次会话(成功后置位 restoredRef,StrictMode 双挂载下也只还原一次) -- */
  const restoredRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const session = await loadSession();
      if (!session || cancelled || restoredRef.current) return;
      restoredRef.current = true;
      setDocLoading(true);
      setLoadingText(t("loading.restore"));
      try {
        const doc = await pdfjsLib.getDocument({ data: session.pdfBytes.slice(0) }).promise;
        if (cancelled) return;
        dispatch({ type: "sessionRestored", doc, session });
        toast.info(t("toast.restored"));
      } catch (err) {
        console.error("会话还原失败", err);
        void clearSession();
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  /* -- 键盘快捷键(与菜单栏提示一致;文字编辑态 / 表单输入 / 对比模式不响应) -- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (compare) return; // 对比模式:1/2/3、空格、Esc 由 Workspace 处理
      if (editingTextId) return; // 文字编辑中不响应页面级快捷键
      if (e.key === "Escape" && state.zen) {
        e.preventDefault();
        dispatch({ type: "zen", value: false });
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return; // 表单输入(页面尺寸、路径等)中不触发快捷键
      }
      if (!state.doc) return;
      const last = state.pageList.length - 1;
      const go = (idx: number) => dispatch({ type: "select", idx: Math.min(last, Math.max(0, idx)) });
      // 双页模式下 PageUp/PageDown 一次翻一个对页,←/→ 始终逐页
      const step = state.viewMode === "double" ? 2 : 1;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      // ⌘Z / ⌘⌫ 与浏览器无冲突;⌘O(浏览器打开文件)、⌘S(保存网页)让还给 Chrome
      if (mod && key === "z") {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.key === "Backspace") {
        e.preventDefault();
        if (last > 0) setDeleteConfirmOpen(true);
      } else if (mod || e.altKey) {
        return; // 其余组合键交还浏览器(⌘C / ⌘O / ⌘S / ⌘R / ⌘T 等)
      } else if (e.key === "ArrowLeft" && state.current > 0) {
        e.preventDefault();
        go(state.current - 1);
      } else if (e.key === "ArrowRight" && state.current < last) {
        e.preventDefault();
        go(state.current + 1);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        go(state.current - step);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        go(state.current + step);
      } else if (e.key === "Home") {
        e.preventDefault();
        go(0);
      } else if (e.key === "End") {
        e.preventDefault();
        go(last);
      } else if (e.key === "n") {
        handleAddPage();
      } else if (e.key === "t") {
        handleAddText();
      } else if (e.key === "r") {
        fileImageRef.current?.click();
      } else if (e.key === "R") {
        handleRevert(); // ⇧R 恢复原页
      } else if (e.key === "s") {
        setSizeOpen(true); // S 页面尺寸
      } else if (e.key === "o") {
        // O 打开 PDF(有未保存编辑时先确认);⌘O 仍让还给浏览器
        if (hasEdits) setOpenConfirmOpen(true);
        else filePdfRef.current?.click();
      } else if (e.key === "[") {
        handleRotate(-90);
      } else if (e.key === "]") {
        handleRotate(90);
      } else if (e.key === "c" && currentReplacement) {
        void openCompare();
      } else if (e.key === "1" && state.viewMode !== "single") {
        dispatch({ type: "viewMode", value: "single" });
      } else if (e.key === "2" && state.viewMode !== "double") {
        dispatch({ type: "viewMode", value: "double" });
      } else if (e.key === "z") {
        handleToggleZen();
      } else if (e.key === "+" || e.key === "=") {
        dispatch({ type: "zoom", value: state.zoom + 0.25 });
      } else if (e.key === "-") {
        dispatch({ type: "zoom", value: state.zoom - 0.25 });
      } else if (e.key === "0") {
        dispatch({ type: "zoom", value: 1 });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    compare,
    editingTextId,
    state.doc,
    state.current,
    state.pageList.length,
    state.viewMode,
    state.zen,
    state.zoom,
    currentReplacement,
    hasEdits,
    handleUndo,
    handleAddPage,
    handleAddText,
    handleRotate,
    handleToggleZen,
    handleRevert,
    openCompare,
  ]);

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
    <div className="relative flex h-dvh flex-col overflow-hidden">
      {!state.zen && <TopBar />}

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
          onOpen={() => (hasEdits ? setOpenConfirmOpen(true) : filePdfRef.current?.click())}
          onDropFile={handleDropFile}
          onReplace={() => fileImageRef.current?.click()}
          onAddText={handleAddText}
          onRotate={handleRotate}
          onOpenPageSize={() => setSizeOpen(true)}
          onAddPage={handleAddPage}
          onDeletePage={() => {
            setCompare(null);
            setSelectedTextId(null);
            setEditingTextId(null);
            setDeleteConfirmOpen(true);
          }}
          canDeletePage={hasDoc && state.pageList.length > 1}
          onRevert={handleRevert}
          onCompare={() => (compare ? setCompare(null) : openCompare())}
          onUndo={handleUndo}
          canUndo={state.past.length > 0}
          onExport={handleExport}
          canExport={hasDoc && hasEdits}
          viewMode={state.viewMode}
          onViewMode={(value) => dispatch({ type: "viewMode", value })}
          zen={state.zen}
          onToggleZen={handleToggleZen}
        />
        {hasDoc && !state.zen && (
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

      {hasDoc && !state.zen && (
        <StatusBar
          fileName={state.fileName}
          current={state.current}
          total={state.pageList.length}
          replacedCount={replacedCount}
          zoom={state.zoom}
          onPrevPage={() => dispatch({ type: "select", idx: Math.max(0, state.current - 1) })}
          onNextPage={() => dispatch({ type: "select", idx: Math.min(state.pageList.length - 1, state.current + 1) })}
        />
      )}

      {state.zen && (
        <button
          data-action="exit-zen"
          type="button"
          title={t("zen.exit")}
          aria-label={t("zen.exit")}
          onClick={() => dispatch({ type: "zen", value: false })}
          className="absolute top-3 right-3 z-40 grid size-8 cursor-pointer place-items-center rounded-full bg-slate-900/55 text-white/85 opacity-30 shadow-lg backdrop-blur transition-opacity hover:bg-slate-900/80 hover:opacity-100"
        >
          <X className="size-4" />
        </button>
      )}

      {/* 「打开新文档」确认(页面操作栏打开按钮触发) */}
      <AlertDialog open={openConfirmOpen} onOpenChange={setOpenConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog.openNewTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirm.openNew")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-action="cancel-open-new">{t("dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction data-action="confirm-open-new" onClick={() => filePdfRef.current?.click()}>
              {t("dialog.continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 页面尺寸对话框(页面操作栏打开) */}
      {currentEntry && (
        <PageSizeDialog
          open={sizeOpen}
          onOpenChange={setSizeOpen}
          pageW={currentEntry.w}
          pageH={currentEntry.h}
          origW={currentEntry.origW}
          origH={currentEntry.origH}
          onResize={handleResize}
        />
      )}

      {/* 「删除此页」确认(页面操作栏与快捷键 ⌘⌫ 共用) */}
      <AlertDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialog.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirm.deletePage", { page: state.current + 1 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-action="cancel-delete">{t("dialog.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-action="confirm-delete"
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDeletePage}
            >
              {t("dialog.confirmDelete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
