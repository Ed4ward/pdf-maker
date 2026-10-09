import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "zh-CN" | "en";

const messages: Record<Locale, Record<string, string>> = {
  "zh-CN": {
    "app.title": "PDF编辑器 - 在线 PDF 图片替换、添加文字、页面对比工具",
    "lang.toggle": "EN",

    "topbar.open": "打开 PDF",
    "topbar.open.hint": "选择本地文件",
    "topbar.addText": "添加文字",
    "topbar.addText.hint": "在当前页插入文本框",
    "topbar.addPage": "新建页面",
    "topbar.addPage.hint": "在当前页后插入空白页",
    "topbar.replace": "用图片替换此页",
    "topbar.replace.hint": "选择图片替换当前页",
    "topbar.revert": "恢复原页",
    "topbar.revert.hint": "撤销此页的图片替换",
    "topbar.undo": "撤销",
    "topbar.undo.hint": "⌘Z",
    "topbar.delete": "删除此页",
    "topbar.delete.hint": "删除当前页(需确认)",
    "topbar.compare": "替换对比",
    "topbar.compare.hint": "对比替换前后内容",
    "topbar.export": "导出 PDF",
    "topbar.export.hint": "下载替换后的文件",

    "empty.drop": "拖拽 PDF 文件到此处",
    "empty.open": "打开 PDF 文件",

    "zoom.in": "放大",
    "zoom.out": "缩小",
    "zoom.reset": "恢复 100%",

    "drop.replace": "松开鼠标,替换当前页",
    "drop.openPdf": "松开鼠标,打开 PDF(当前替换内容将丢失)",

    "loading.parse": "正在解析 PDF…",
    "loading.export": "正在生成 PDF…",
    "loading.compare": "正在准备对比…",
    "loading.default": "正在加载…",

    "adjust.fitContain": "适应",
    "adjust.fitCover": "铺满",
    "adjust.scale": "缩放",
    "adjust.reset": "重置",
    "adjust.hint": "拖动图片调整位置",

    "cmp.side": "左右并排",
    "cmp.slider": "滑动对比",
    "cmp.toggle": "切换查看",
    "cmp.exit": "退出对比 (Esc)",
    "cmp.hint.side": "左侧为原始页面内容,右侧为替换后的图片内容",
    "cmp.hint.slider": "左右拖动分隔线,逐区域查看替换前后的内容差异",
    "cmp.hint.toggle.pre": "点击底部按钮或按",
    "cmp.hint.toggle.post": "在替换前 / 替换后之间切换",
    "key.space": "空格",
    "cmp.before": "替换前 · 原始页面",
    "cmp.after": "替换后 · 新图片",
    "cmp.corner.before": "◀ 替换前 · 原始页面",
    "cmp.corner.after": "替换后 · 新图片 ▶",
    "toggle.before": "替换前",
    "toggle.after": "替换后",

    "thumbs.title": "页面",
    "thumbs.count": "{n} 页",
    "thumbs.replaced": "已替换",
    "thumbs.new": "新建",

    "status.doc": "文档:",
    "status.pageOf": "第 {cur} / {total} 页",
    "status.replaced": "已替换 {n} 页",
    "status.zoom": "缩放 {z}%",

    "text.toolbar": "文字",
    "text.fontDec.title": "减小字号",
    "text.fontInc.title": "增大字号",
    "text.delete.title": "删除文字框 (Delete)",
    "text.hint": "双击文字编辑 · 拖动移动",

    "textbox.alt": "替换图:{name}",

    "confirm.deletePage": "确定删除第 {page} 页?该页的替换图与文字将一并移除(可通过撤销恢复)。",
    "confirm.openNew": "打开新文档将丢弃当前所有替换操作,确定继续?",
    "dialog.cancel": "取消",
    "dialog.deleteTitle": "删除此页?",
    "dialog.openNewTitle": "未保存的修改",
    "dialog.continue": "继续",
    "dialog.confirmDelete": "删除",

    "toast.opened": "已打开「{name}」,共 {n} 页",
    "toast.parseFailed": "PDF 解析失败,请换一个文件试试",
    "toast.needPdf": "请选择 PDF 文件",
    "toast.needImage": "请选择图片文件(PNG / JPG / WebP)",
    "toast.imageTooLarge": "图片超过 20MB,原型阶段暂不支持",
    "toast.replaced": "第 {page} 页已替换为图片「{name}」,可拖动图片或用底部工具调整",
    "toast.imageReadFailed": "图片读取失败",
    "toast.reverted": "第 {page} 页已恢复为原始内容",
    "toast.pageAdded": "已在第 {page} 页后插入空白页",
    "toast.pageMoved": "页面已从第 {from} 页移动到第 {to} 页",
    "toast.pageDeleted": "已删除第 {page} 页(⌘Z 可恢复)",
    "toast.keepOnePage": "至少需要保留一页",
    "toast.undone": "已撤销上一步操作",
    "toast.textDeleted": "已删除文字框(⌘Z 可恢复)",
    "toast.compareFailed": "对比准备失败",
    "toast.exportFailed": "导出失败,请查看控制台",
    "toast.exported": "已导出替换后的 PDF",
    "toast.initFailed": "初始化失败,请刷新重试",
    "toast.keepPdfFirst": "请先打开 PDF 文档",
    "panel.openHint": "打开工作区中的 PDF 开始编辑",
    "panel.pathPlaceholder": "工作区内路径,如 docs/report.pdf",
    "panel.openTitle": "打开 PDF",
    "panel.openDesc": "输入工作区内的 PDF 路径",
    "panel.replaceTitle": "替换此页图片",
    "panel.replaceDesc": "输入工作区内的图片路径(PNG/JPG)",
    "panel.exportTitle": "导出 PDF",
    "panel.exportDesc": "按当前顺序与编辑导出到工作区路径",
    "panel.overwrite": "覆盖已存在的文件",
    "panel.noUndo": "面板暂不支持撤销,请谨慎操作",
    "panel.dropUnsupported": "面板内请通过路径打开文件",
    "toast.needPath": "请输入路径",
    "toast.exportedTo": "已导出到 {path}",
    "toast.openedShort": "文档已打开",
    "toast.replacedShort": "此页已替换",
    "toast.pageAddedShort": "已插入空白页",
    "toast.pageDeletedShort": "页面已删除",
  },
  en: {
    "app.title": "PDF Editor – Replace PDF pages with images, add text, compare & export, 100% in your browser",
    "lang.toggle": "中文",

    "topbar.open": "Open PDF",
    "topbar.open.hint": "Choose a local file",
    "topbar.addText": "Add text",
    "topbar.addText.hint": "Insert a text box on this page",
    "topbar.addPage": "New page",
    "topbar.addPage.hint": "Insert a blank page after this one",
    "topbar.replace": "Replace page with image",
    "topbar.replace.hint": "Choose an image for this page",
    "topbar.revert": "Restore page",
    "topbar.revert.hint": "Undo the image replacement",
    "topbar.undo": "Undo",
    "topbar.undo.hint": "⌘Z",
    "topbar.delete": "Delete page",
    "topbar.delete.hint": "Delete the current page (with confirmation)",
    "topbar.compare": "Compare",
    "topbar.compare.hint": "Compare before & after",
    "topbar.export": "Export PDF",
    "topbar.export.hint": "Download the edited file",

    "empty.drop": "Drop a PDF file here",
    "empty.open": "Open a PDF file",

    "zoom.in": "Zoom in",
    "zoom.out": "Zoom out",
    "zoom.reset": "Fit 100%",

    "drop.replace": "Release to replace this page",
    "drop.openPdf": "Release to open the PDF (current edits will be lost)",

    "loading.parse": "Parsing PDF…",
    "loading.export": "Generating PDF…",
    "loading.compare": "Preparing comparison…",
    "loading.default": "Loading…",

    "adjust.fitContain": "Contain",
    "adjust.fitCover": "Cover",
    "adjust.scale": "Zoom",
    "adjust.reset": "Reset",
    "adjust.hint": "Drag the image to reposition",

    "cmp.side": "Side by side",
    "cmp.slider": "Slider",
    "cmp.toggle": "Toggle",
    "cmp.exit": "Exit compare (Esc)",
    "cmp.hint.side": "Left: original page · Right: replacement image",
    "cmp.hint.slider": "Drag the divider to inspect the change region by region",
    "cmp.hint.toggle.pre": "Click the buttons below or press",
    "cmp.hint.toggle.post": "to switch before / after",
    "key.space": "Space",
    "cmp.before": "Before · Original page",
    "cmp.after": "After · New image",
    "cmp.corner.before": "◀ Before · Original page",
    "cmp.corner.after": "After · New image ▶",
    "toggle.before": "Before",
    "toggle.after": "After",

    "thumbs.title": "Pages",
    "thumbs.count": "{n} pages",
    "thumbs.replaced": "Replaced",
    "thumbs.new": "New",

    "status.doc": "File:",
    "status.pageOf": "Page {cur} / {total}",
    "status.replaced": "{n} page(s) replaced",
    "status.zoom": "Zoom {z}%",

    "text.toolbar": "Text",
    "text.fontDec.title": "Smaller font",
    "text.fontInc.title": "Larger font",
    "text.delete.title": "Delete text box (Delete)",
    "text.hint": "Double-click to edit · Drag to move",

    "textbox.alt": "Replacement image: {name}",

    "confirm.deletePage": "Delete page {page}? Its replacement image and text boxes will be removed (undoable).",
    "confirm.openNew": "Opening a new document will discard all edits. Continue?",
    "dialog.cancel": "Cancel",
    "dialog.deleteTitle": "Delete this page?",
    "dialog.openNewTitle": "Unsaved changes",
    "dialog.continue": "Continue",
    "dialog.confirmDelete": "Delete",

    "toast.opened": "Opened “{name}”, {n} pages",
    "toast.parseFailed": "Failed to parse the PDF, try another file",
    "toast.needPdf": "Please choose a PDF file",
    "toast.needImage": "Please choose an image file (PNG / JPG / WebP)",
    "toast.imageTooLarge": "Images over 20MB are not supported in this prototype",
    "toast.replaced": "Page {page} replaced with “{name}” — drag the image or use the toolbar to adjust",
    "toast.imageReadFailed": "Failed to read the image",
    "toast.reverted": "Page {page} restored to original content",
    "toast.pageAdded": "Blank page inserted after page {page}",
    "toast.pageMoved": "Page moved from {from} to {to}",
    "toast.pageDeleted": "Page {page} deleted (⌘Z to undo)",
    "toast.keepOnePage": "Keep at least one page",
    "toast.undone": "Undone",
    "toast.textDeleted": "Text box deleted (⌘Z to undo)",
    "toast.compareFailed": "Failed to prepare comparison",
    "toast.exportFailed": "Export failed, see the console",
    "toast.exported": "Edited PDF exported",
    "toast.initFailed": "Init failed, please refresh",
    "toast.keepPdfFirst": "Open a PDF document first",
    "panel.openHint": "Open a PDF from the workspace to start editing",
    "panel.pathPlaceholder": "Workspace path, e.g. docs/report.pdf",
    "panel.openTitle": "Open PDF",
    "panel.openDesc": "Enter a PDF path inside the workspace",
    "panel.replaceTitle": "Replace page image",
    "panel.replaceDesc": "Enter an image path inside the workspace (PNG/JPG)",
    "panel.exportTitle": "Export PDF",
    "panel.exportDesc": "Export to a workspace path with all edits applied",
    "panel.overwrite": "Overwrite existing file",
    "panel.noUndo": "Undo is not available in the panel yet",
    "panel.dropUnsupported": "Use the path input to open files in the panel",
    "toast.needPath": "Please enter a path",
    "toast.exportedTo": "Exported to {path}",
    "toast.openedShort": "Document opened",
    "toast.replacedShort": "Page replaced",
    "toast.pageAddedShort": "Blank page inserted",
    "toast.pageDeletedShort": "Page deleted",
  },
};

const STORAGE_KEY = "pdfmaker-locale";

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh-CN" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** 取文案;{param} 占位符用 params 替换;缺失时回退中文,再退 key */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => detectLocale());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => setLocaleState(l), []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      let s = messages[locale][key] ?? messages["zh-CN"][key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          s = s.replace(`{${k}}`, String(v));
        }
      }
      return s;
    },
    [locale]
  );

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(I18nContext);
  if (!v) throw new Error("useI18n must be used within I18nProvider");
  return v;
}
