import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Columns2,
  Download,
  Focus,
  FolderOpen,
  Save,
  ImageOff,
  ImagePlus,
  MoveHorizontal,
  Plus,
  Proportions,
  RectangleVertical,
  RotateCcw,
  RotateCw,
  ToggleLeft,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";
import ReplacedImage from "@/components/ReplacedImage";
import TextBoxLayer from "@/components/TextBoxLayer";
import { cn } from "@/lib/utils";
import type { CompareMode, FitMode, Replacement, ReplacementPatch, TextBox, TextBoxPatch, ViewMode } from "@/types";

/** 快捷键提示的平台前缀(mac 显示 ⌘,其余显示 Ctrl+) */
const IS_MAC = typeof navigator !== "undefined" && /Mac|iP(hone|pad|od)/.test(navigator.userAgent);
const MOD_KEY = IS_MAC ? "⌘" : "Ctrl+";

/** 原地对比模式的状态(由 App 持有) */
export interface CompareView {
  index: number;
  mode: CompareMode;
  before: string;
  after: Replacement;
}

/** 预览区的一页;App 按单/双页模式算好可见页集合传入 */
export interface SpreadPage {
  /** 文档顺序位置(0 起) */
  index: number;
  id: string;
  /** 页面尺寸(pt) */
  w: number;
  h: number;
  src: string;
  replacement: Replacement | null;
  texts: TextBox[];
  /** 是否为当前选中页(替换图调整工具条只跟随它) */
  active: boolean;
}

const MODES: Array<{ value: CompareMode; icon: typeof Columns2 }> = [
  { value: "side", icon: Columns2 },
  { value: "slider", icon: MoveHorizontal },
  { value: "toggle", icon: ToggleLeft },
];

/** 页面操作栏按钮:图标 + 悬停提示(kbd 快捷键) */
function BarButton({
  action,
  icon,
  label,
  shortcut,
  disabled,
  onClick,
  danger,
}: {
  action: string;
  icon: ReactNode;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          data-action={action}
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={onClick}
          className={cn("size-8 shrink-0", danger && "text-red-500 hover:bg-red-50 hover:text-red-600")}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="flex items-center gap-2">
        <span className="text-xs">{label}</span>
        {shortcut && (
          <KbdGroup>
            {shortcut.split(" ").map((part) => (
              <Kbd key={part}>{part}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** 操作栏分组分隔线 */
function BarDivider() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" />;
}

interface WorkspaceProps {
  hasDoc: boolean;
  docLoading: boolean;
  loadingText: string;
  /** 可见页集合:单页 1 项,双页 1~2 项 */
  pages: SpreadPage[];
  zoom: number;
  compare: CompareView | null;
  onZoom: (value: number) => void;
  onSelectPage: (index: number) => void;
  /** 调整指定页的替换图排版;pushUndo=true 时记入撤销栈 */
  onAdjust: (id: string, patch: ReplacementPatch, pushUndo: boolean) => void;
  selectedTextId: string | null;
  editingTextId: string | null;
  onSelectText: (id: string | null) => void;
  onStartEditText: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onMoveText: (id: string, x: number, y: number, pushUndo: boolean) => void;
  onPatchText: (id: string, patch: TextBoxPatch) => void;
  onRemoveText: (id: string) => void;
  onCompareMode: (mode: CompareMode) => void;
  onExitCompare: () => void;
  onOpen: () => void;
  /** pageId 指定图片落点页(双页模式按所在卡片);缺省为当前页 */
  onDropFile: (file: File, pageId?: string) => void;
  /** 页面操作栏 */
  onReplace: () => void;
  onAddText: () => void;
  onRotate: (delta: 90 | -90) => void;
  onOpenPageSize: () => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  canDeletePage: boolean;
  onRevert: () => void;
  onCompare: () => void;
  onUndo: () => void;
  canUndo: boolean;
  /** 文件:打开(内部处理未保存确认)/ 导出 / 另存为 */
  onExport: () => void;
  onSaveAs: () => void;
  canExport: boolean;
  /** 视图:单页/双页滑块(Zen 为第三段)+ Zen 回调 */
  viewMode: ViewMode;
  onViewMode: (value: ViewMode) => void;
  /** Zen 模式当前状态(滑块选中态) */
  zen?: boolean;
  onToggleZen?: () => void;
}

export default function Workspace({
  hasDoc,
  docLoading,
  loadingText,
  pages,
  zoom,
  compare,
  onZoom,
  onSelectPage,
  onAdjust,
  selectedTextId,
  editingTextId,
  onSelectText,
  onStartEditText,
  onCommitText,
  onMoveText,
  onPatchText,
  onRemoveText,
  onCompareMode,
  onExitCompare,
  onOpen,
  onDropFile,
  onReplace,
  onAddText,
  onRotate,
  onOpenPageSize,
  onAddPage,
  onDeletePage,
  canDeletePage,
  onRevert,
  onCompare,
  onUndo,
  canUndo,
  onExport,
  onSaveAs,
  canExport,
  viewMode,
  onViewMode,
  zen,
  onToggleZen,
}: WorkspaceProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dropHint, setDropHint] = useState<null | "image" | "pdf">(null);
  const [pos, setPos] = useState(50);
  const [isAfter, setIsAfter] = useState(false);
  const { t } = useI18n();
  const draggingRef = useRef(false);
  // 替换图调整:按页面 id 记录拖动中的实时偏移 / 滑杆中的实时缩放(松手才提交并入撤销栈)
  const [liveOffsets, setLiveOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [liveScales, setLiveScales] = useState<Record<string, number>>({});
  const liveOffsetsRef = useRef<Record<string, { x: number; y: number }>>({});
  const liveScalesRef = useRef<Record<string, number>>({});
  const panRef = useRef<{ id: string; px: number; py: number; ox: number; oy: number } | null>(null);

  const activePage = pages.find((p) => p.active) ?? null;

  // 生效中的替换参数(合并未提交的实时调整)
  const effRepOf = (p: SpreadPage): Replacement | null =>
    p.replacement
      ? {
          ...p.replacement,
          scale: liveScales[p.id] ?? p.replacement.scale,
          offsetX: liveOffsets[p.id]?.x ?? p.replacement.offsetX,
          offsetY: liveOffsets[p.id]?.y ?? p.replacement.offsetY,
        }
      : null;

  // 切换可见页集合或某页换图后,丢弃未提交的实时调整
  const liveResetKey = `${pages.map((p) => p.id).join(",")}|${pages
    .map((p) => p.replacement?.dataUrl ?? "")
    .join("|")}`;
  useEffect(() => {
    setLiveOffsets({});
    setLiveScales({});
    liveOffsetsRef.current = {};
    liveScalesRef.current = {};
    panRef.current = null;
  }, [liveResetKey]);

  // 选中文字框后按 Delete/Backspace 删除(编辑态除外)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selectedTextId || editingTextId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onRemoveText(selectedTextId);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedTextId, editingTextId, onRemoveText]);

  const selectedTextBox = activePage?.texts.find((t) => t.id === selectedTextId) ?? null;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 常规预览(单页=双页公式的 1 项特例):按"适应窗口 × 缩放"求公共缩放系数
  const spreadDimsKey = pages.map((p) => `${p.id}:${p.w}x${p.h}`).join(",");
  const spreadScale = useMemo(() => {
    if (pages.length === 0 || box.w === 0) return null;
    const pad = box.w < 640 ? 20 : 56;
    const gap = pages.length > 1 ? 24 : 0;
    const totalW = pages.reduce((acc, p) => acc + p.w, 0);
    const maxH = Math.max(...pages.map((p) => p.h));
    return Math.min((box.w - pad - gap) / totalW, (box.h - pad) / maxH) * zoom;
  }, [spreadDimsKey, pages, box, zoom]);

  // 对比视图恒为单页:按当前页尺寸计算卡片
  const cardStyle = useMemo<CSSProperties | null>(() => {
    if (!activePage || box.w === 0) return null;
    const pad = box.w < 640 ? 20 : 56;
    const fit = Math.min((box.w - pad) / activePage.w, (box.h - pad) / activePage.h);
    const s = fit * zoom;
    return { width: Math.round(activePage.w * s), height: Math.round(activePage.h * s) };
  }, [activePage, box, zoom]);

  // 左右并排:两列各占一半,标签占一行高度
  const sideStyle = useMemo(() => {
    if (!activePage || box.w === 0) return null;
    const pad = 56, gap = 24, labelH = 40;
    const availH = box.h - pad - labelH;
    const ar = activePage.w / activePage.h;
    let w = Math.min((box.w - pad - gap) / 2, 560);
    let h = w / ar;
    if (h > availH) {
      h = availH;
      w = h * ar;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  }, [activePage, box]);

  // 切页后重置对比内部状态
  useEffect(() => {
    setPos(50);
    setIsAfter(false);
  }, [compare?.index]);

  // 对比模式键盘:1/2/3 切模式,空格切换前后,Esc 退出
  useEffect(() => {
    if (!compare) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitCompare();
      else if (e.key === "1") onCompareMode("side");
      else if (e.key === "2") onCompareMode("slider");
      else if (e.key === "3") onCompareMode("toggle");
      else if (e.key === " ") {
        e.preventDefault();
        if (compare.mode === "toggle") setIsAfter((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [compare, onCompareMode, onExitCompare]);

  const updatePos = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100)));
  };

  const stagePointer = {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => {
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      updatePos(e);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current) updatePos(e);
    },
    onPointerUp: () => {
      draggingRef.current = false;
    },
  };

  // 拖拽悬停时识别内容类型,给出对应的放置提示
  const dragKind = (e: DragEvent<HTMLElement>): "image" | "pdf" => {
    const items = e.dataTransfer.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== "file") continue;
      if (items[i].type.startsWith("image/")) return "image";
      if (items[i].type === "application/pdf") return "pdf";
    }
    return "image";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDropHint(null);
    const file = e.dataTransfer.files[0];
    if (file) onDropFile(file);
  };

  /* -- 替换图拖动调位(按页面 id 记录实时偏移) -- */
  const handlePanStart = (p: SpreadPage) => (e: ReactPointerEvent<HTMLDivElement>) => {
    // 点在文字框上时由文字框自己处理
    if ((e.target as HTMLElement).closest("[data-textbox]")) return;
    if (!p.active) onSelectPage(p.index);
    onSelectText(null);
    if (!p.replacement) return;
    panRef.current = { id: p.id, px: e.clientX, py: e.clientY, ox: p.replacement.offsetX, oy: p.replacement.offsetY };
    const l = { x: p.replacement.offsetX, y: p.replacement.offsetY };
    liveOffsetsRef.current = { ...liveOffsetsRef.current, [p.id]: l };
    e.currentTarget.setPointerCapture(e.pointerId);
    setLiveOffsets((prev) => ({ ...prev, [p.id]: l }));
  };
  const handlePanMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = panRef.current;
    if (!p) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(-1, v));
    const next = {
      x: clamp(p.ox + ((e.clientX - p.px) / rect.width) * 2),
      y: clamp(p.oy + ((e.clientY - p.py) / rect.height) * 2),
    };
    liveOffsetsRef.current = { ...liveOffsetsRef.current, [p.id]: next };
    setLiveOffsets((prev) => ({ ...prev, [p.id]: next }));
  };
  const handlePanEnd = () => {
    const p = panRef.current;
    if (!p) return;
    panRef.current = null;
    const cur = liveOffsetsRef.current[p.id];
    delete liveOffsetsRef.current[p.id];
    setLiveOffsets((prev) => {
      if (!(p.id in prev)) return prev;
      const next = { ...prev };
      delete next[p.id];
      return next;
    });
    if (cur && (cur.x !== p.ox || cur.y !== p.oy)) {
      onAdjust(p.id, { offsetX: cur.x, offsetY: cur.y }, true);
    }
  };

  /* -- 缩放滑杆提交(松手/失焦才记撤销) -- */
  const commitScale = () => {
    const id = activePage?.id;
    if (!id) return;
    const cur = liveScalesRef.current[id];
    if (cur != null) {
      delete liveScalesRef.current[id];
      setLiveScales((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      onAdjust(id, { scale: cur }, true);
    }
  };

  const stageCardClass =
    "relative shrink-0 overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.10)] ring-1 ring-slate-900/5";

  const activeEffRep = activePage ? effRepOf(activePage) : null;
  const canRevert = !!activeEffRep;
  const canCompare = !!activeEffRep;
  /** 操作栏上下文:选中文字框 → 文字调整;否则当前页有替换图 → 排版调整 */
  const context: "text" | "replace" | null = selectedTextBox
    ? "text"
    : activeEffRep
      ? "replace"
      : null;

  return (
    <section
      className={cn(
        "relative flex min-w-0 flex-1 flex-col transition-colors",
        dropHint && "bg-blue-50 outline-3 outline-dashed -outline-offset-3 outline-blue-600"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDropHint(dragKind(e));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropHint(null);
      }}
      onDrop={handleDrop}
    >
      {/* 预览舞台:页面卡片 / 对比视图 */}
      <div
        ref={areaRef}
        className="workspace-dots relative flex min-w-0 flex-1 items-center justify-center overflow-auto"
      >
      {!hasDoc && !docLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5">
          <BrandMark className="size-20 drop-shadow-xl shadow-blue-600/20" />
          <div className="text-base font-semibold text-slate-800">{t("empty.drop")}</div>
          <div className="mt-1">
            <Button onClick={onOpen}>{t("empty.open")}</Button>
          </div>
        </div>
      )}

      {/* 常规预览:单页或对页并排(有替换图时可拖动调位,点另一页即选中) */}
      {hasDoc && !compare && pages.length > 0 && spreadScale != null && (
        <div className="flex items-center justify-center" style={{ gap: pages.length > 1 ? 24 : 0 }}>
          {pages.map((p) => {
            const effRep = effRepOf(p);
            return (
              <div
                key={p.id}
                data-page-index={p.index}
                data-active={p.active ? "true" : "false"}
                className={cn(
                  stageCardClass,
                  p.replacement ? "cursor-grab touch-none active:cursor-grabbing" : !p.active && "cursor-pointer",
                  dropHint === "image" && "outline-3 outline-dashed -outline-offset-2 outline-blue-600"
                )}
                style={{ width: Math.round(p.w * spreadScale), height: Math.round(p.h * spreadScale) }}
                onPointerDown={handlePanStart(p)}
                onPointerMove={handlePanMove}
                onPointerUp={handlePanEnd}
                onPointerCancel={handlePanEnd}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropHint(null);
                  const file = e.dataTransfer.files[0];
                  if (file) onDropFile(file, p.id);
                }}
              >
                {effRep ? (
                  <div className="absolute inset-0 overflow-hidden">
                    <ReplacedImage pageW={p.w} pageH={p.h} rep={effRep} />
                  </div>
                ) : (
                  p.src && (
                    <img
                      src={p.src}
                      alt={t("preview.page")}
                      className="block h-full w-full select-none"
                      draggable={false}
                    />
                  )
                )}
                <TextBoxLayer
                  boxes={p.texts}
                  interactive
                  selectedId={selectedTextId}
                  editingId={editingTextId}
                  onSelect={(id) => {
                    if (!p.active) onSelectPage(p.index);
                    onSelectText(id);
                  }}
                  onStartEdit={(id) => {
                    if (!p.active) onSelectPage(p.index);
                    onStartEditText(id);
                  }}
                  onEditCommit={onCommitText}
                  onMove={onMoveText}
                />
                {dropHint === "image" && (
                  <div className="absolute inset-0 grid place-items-center bg-blue-600/10">
                    <span className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg">{t("drop.replace")}</span>
                  </div>
                )}
                {dropHint === "pdf" && (
                  <div className="absolute inset-0 grid place-items-center bg-slate-900/10">
                    <span className="rounded-full bg-slate-900/85 px-4 py-1.5 text-sm font-medium text-white shadow-lg">{t("drop.openPdf")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 原地对比:滑动 */}
      {compare && compare.mode === "slider" && cardStyle && activePage && (
        <div
          className="relative cursor-ew-resize touch-none overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.10)] ring-1 ring-slate-900/5 select-none"
          style={cardStyle}
          {...stagePointer}
        >
          <img
            src={compare.before}
            alt={t("toggle.before")}
            className="absolute inset-0 h-full w-full bg-white object-contain"
            draggable={false}
          />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
            <ReplacedImage pageW={activePage.w} pageH={activePage.h} rep={compare.after} />
            <TextBoxLayer boxes={activePage.texts} />
          </div>
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-slate-900/75 px-2.5 py-0.5 text-[11.5px] font-semibold text-white backdrop-blur">
            {t("cmp.corner.before")}
          </span>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-emerald-600/85 px-2.5 py-0.5 text-[11.5px] font-semibold text-white backdrop-blur">
            {t("cmp.corner.after")}
          </span>
          <div className="pointer-events-none absolute top-0 bottom-0 z-[5] w-0" style={{ left: `${pos}%` }}>
            <div className="absolute top-0 bottom-0 -left-[1.5px] w-[3px] bg-white shadow-[0_0_6px_rgba(15,23,42,0.5)]" />
            <div className="cmp-slider-knob absolute top-1/2 left-0 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-[10px] text-slate-500 shadow-[0_2px_10px_rgba(15,23,42,0.35)]">
              ◄►
            </div>
          </div>
        </div>
      )}

      {/* 原地对比:切换查看 */}
      {compare && compare.mode === "toggle" && cardStyle && activePage && (
        <div className={stageCardClass} style={cardStyle}>
          <img
            src={compare.before}
            alt={t("toggle.before")}
            className="absolute inset-0 h-full w-full bg-white object-contain transition-opacity duration-150"
            style={{ opacity: isAfter ? 0 : 1 }}
            draggable={false}
          />
          <div
            className="absolute inset-0 transition-opacity duration-150"
            style={{ opacity: isAfter ? 1 : 0 }}
          >
            <ReplacedImage pageW={activePage.w} pageH={activePage.h} rep={compare.after} />
            <TextBoxLayer boxes={activePage.texts} />
          </div>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-slate-900/85 p-1 backdrop-blur">
            <button
              onClick={() => setIsAfter(false)}
              className={cn(
                "h-[30px] cursor-pointer rounded-full px-4 text-[13px] font-medium",
                !isAfter ? "bg-white text-slate-900" : "text-slate-300"
              )}
            >
              {t("toggle.before")}
            </button>
            <button
              onClick={() => setIsAfter(true)}
              className={cn(
                "h-[30px] cursor-pointer rounded-full px-4 text-[13px] font-medium",
                isAfter ? "bg-emerald-600 text-white" : "text-slate-300"
              )}
            >
              {t("toggle.after")}
            </button>
          </div>
        </div>
      )}

      {/* 原地对比:左右并排 */}
      {compare && compare.mode === "side" && sideStyle && (
        <div className="flex items-center justify-center gap-6">
          {(
            [
              { kind: "before", label: t("cmp.before"), src: compare.before },
              { kind: "after", label: t("cmp.after"), src: compare.after.dataUrl },
            ] as const
          ).map(({ kind, label, src }) => (
            <div key={kind} className="flex flex-col items-center gap-2">
              <Badge
                variant={kind === "before" ? "secondary" : "outline"}
                className={cn(
                  "rounded-full px-3 py-0.5 text-[12px] font-semibold",
                  kind === "after" && "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
              >
                {label}
              </Badge>
              <div className={stageCardClass} style={{ width: sideStyle.w, height: sideStyle.h }}>
                <img
                  src={src}
                  alt={label}
                  className="absolute inset-0 h-full w-full bg-white object-contain"
                  draggable={false}
                />
                {kind === "after" && <TextBoxLayer boxes={activePage?.texts ?? []} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 对比模式悬浮条 */}
      {compare && (
        <div className="absolute top-4 left-1/2 z-[6] flex max-w-[calc(100%-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
          <Tabs value={compare.mode} onValueChange={(v) => onCompareMode(v as CompareMode)}>
            <TabsList className="h-8 gap-0.5 rounded-lg p-0.5">
              {MODES.map(({ value, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  data-action={`cmp-${value}`}
                  className="h-7 gap-1.5 rounded-md px-3 text-xs"
                >
                  <Icon className="size-3.5" />
                  {t(`cmp.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button
            onClick={onExitCompare}
            data-action="cmp-exit"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-accent hover:text-slate-900"
            title={t("cmp.exit")}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 对比模式操作提示 */}
      {compare && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[5] -translate-x-1/2 rounded-full bg-slate-900/70 px-3.5 py-1 text-xs text-slate-200 backdrop-blur">
          {compare.mode === "toggle" ? (
            <>
              {t("cmp.hint.toggle.pre")} <span className="font-medium text-white">{t("key.space")}</span>{" "}
              {t("cmp.hint.toggle.post")}
            </>
          ) : (
            t(`cmp.hint.${compare.mode}`)
          )}
        </div>
      )}

      </div>

      {/* 页面操作栏:页面相关操作集中于此,随宽度自动换行,不遮挡页面。
          Zen 模式下隐藏(沉浸预览,经右上角按钮或 Esc 退出);
          上下文区:选中文字框时显示文字调整,当前页有替换图时显示排版调整 */}
      {hasDoc && !zen && (
        <div className="shrink-0 border-t bg-background/95 backdrop-blur">
          <div className="flex min-h-11 flex-wrap items-center justify-end gap-y-1 px-2 py-1">
            <BarButton action="replace-image" icon={<ImagePlus />} label={t("topbar.replace")} shortcut="R" disabled={!hasDoc} onClick={onReplace} />
            <BarButton action="add-text" icon={<Type />} label={t("topbar.addText")} shortcut="T" disabled={!hasDoc} onClick={onAddText} />
            <BarDivider />
            <BarButton action="rotate-left" icon={<RotateCcw />} label={t("topbar.rotateLeft")} shortcut="[" disabled={!hasDoc} onClick={() => onRotate(-90)} />
            <BarButton action="rotate-right" icon={<RotateCw />} label={t("topbar.rotateRight")} shortcut="]" disabled={!hasDoc} onClick={() => onRotate(90)} />
            <BarButton action="page-size" icon={<Proportions />} label={t("topbar.pageSize")} shortcut="S" disabled={!hasDoc} onClick={onOpenPageSize} />
            <BarDivider />
            <BarButton action="add-page" icon={<Plus />} label={t("topbar.addPage")} shortcut="N" disabled={!hasDoc} onClick={onAddPage} />
            <BarButton action="undo" icon={<Undo2 />} label={t("topbar.undo")} shortcut={`${MOD_KEY} Z`} disabled={!canUndo} onClick={onUndo} />
            <BarButton action="delete-page" icon={<Trash2 />} label={t("topbar.delete")} shortcut={IS_MAC ? "⌘ ⌫" : "Ctrl ⌫"} disabled={!canDeletePage} onClick={onDeletePage} danger />
            {!compare && context === "replace" && activePage && activeEffRep && (
              <>
                <BarDivider />
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={activeEffRep.fit}
                  onValueChange={(v) => {
                    if (v) onAdjust(activePage.id, { fit: v as FitMode }, true);
                  }}
                  className="gap-0 rounded-lg bg-slate-100 p-0.5"
                >
                  <ToggleGroupItem
                    value="contain"
                    data-action="fit-contain"
                    className="h-7 cursor-pointer border-none px-2.5 text-xs font-medium data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm"
                  >
                    {t("adjust.fitContain")}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="cover"
                    data-action="fit-cover"
                    className="h-7 cursor-pointer border-none px-2.5 text-xs font-medium data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm"
                  >
                    {t("adjust.fitCover")}
                  </ToggleGroupItem>
                </ToggleGroup>
                <div className="flex items-center gap-1.5 pl-1.5">
                  <span className="hidden text-xs text-slate-500 sm:inline">{t("adjust.scale")}</span>
                  <Slider
                    data-action="replace-scale"
                    min={0.5}
                    max={3}
                    step={0.05}
                    value={[activeEffRep.scale]}
                    onValueChange={(v) => {
                      liveScalesRef.current = { ...liveScalesRef.current, [activePage.id]: v[0] };
                      setLiveScales((prev) => ({ ...prev, [activePage.id]: v[0] }));
                    }}
                    onValueCommit={commitScale}
                    className="w-24 sm:w-28"
                  />
                  <span className="w-10 text-xs text-slate-700 tabular-nums">
                    {Math.round(activeEffRep.scale * 100)}%
                  </span>
                </div>
                <button
                  data-action="adjust-reset"
                  className="cursor-pointer rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-accent hover:text-slate-900"
                  onClick={() => onAdjust(activePage.id, { fit: "contain", scale: 1, offsetX: 0, offsetY: 0 }, true)}
                >{t("adjust.reset")}</button>
                <BarButton action="revert-page" icon={<ImageOff />} label={t("topbar.revert")} shortcut="⇧ R" disabled={!canRevert} onClick={onRevert} />
                <BarButton action="toggle-compare" icon={<Columns2 />} label={t("topbar.compare")} shortcut="C" disabled={!canCompare} onClick={onCompare} />
              </>
            )}
            {!compare && context === "text" && selectedTextBox && (
              <>
                <BarDivider />
                <span className="hidden pl-1 text-xs font-medium text-slate-500 sm:inline">{t("text.toolbar")}</span>
                <button
                  className="h-8 min-w-8 cursor-pointer rounded-md px-1.5 text-xs font-bold text-slate-600 hover:bg-accent"
                  data-action="text-font-dec"
                  title={t("text.fontDec.title")}
                  onClick={() => onPatchText(selectedTextBox.id, { size: Math.max(0.02, selectedTextBox.size / 1.25) })}
                >
                  A−
                </button>
                <button
                  className="h-8 min-w-8 cursor-pointer rounded-md px-1.5 text-sm font-bold text-slate-600 hover:bg-accent"
                  data-action="text-font-inc"
                  title={t("text.fontInc.title")}
                  onClick={() => onPatchText(selectedTextBox.id, { size: Math.min(0.3, selectedTextBox.size * 1.25) })}
                >
                  A+
                </button>
                <div className="flex items-center gap-1 pl-0.5">
                  {["#1e293b", "#2563eb", "#dc2626", "#ffffff"].map((c) => (
                    <button
                      key={c}
                      data-action="text-color"
                      data-color={c}
                      title={c}
                      className={cn(
                        "size-5 cursor-pointer rounded-full border border-slate-300",
                        selectedTextBox.color === c && "ring-2 ring-blue-500 ring-offset-1"
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => onPatchText(selectedTextBox.id, { color: c })}
                    />
                  ))}
                </div>
                <BarButton action="text-delete" icon={<Trash2 />} label={t("text.delete.title")} shortcut="Del" onClick={() => onRemoveText(selectedTextBox.id)} danger />
              </>
            )}
            {/* 右对齐:视图滑块(单页/双页/Zen)/ 缩放 / 打开 / 导出 */}
            <BarDivider />
            <ToggleGroup
              type="single"
              value={zen ? "zen" : viewMode}
              onValueChange={(v) => {
                if (!v) return;
                if (v === "zen") {
                  onToggleZen?.();
                  return;
                }
                onViewMode(v as ViewMode);
                if (zen) onToggleZen?.();
              }}
              disabled={!hasDoc}
              className="gap-0 rounded-lg bg-slate-100 p-0.5"
            >
              {/* Tooltip 挂在外层 span 上:直接 asChild 会用 data-state="closed" 覆盖滑块选中态 */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <ToggleGroupItem
                      value="single"
                      data-action="view-single"
                      aria-label={t("topbar.viewSingle")}
                      className="size-7 cursor-pointer rounded-md border-none data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm"
                    >
                      <RectangleVertical className="size-4" />
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex items-center gap-2">
                  <span className="text-xs">{t("topbar.viewSingle")}</span>
                  <Kbd>1</Kbd>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <ToggleGroupItem
                      value="double"
                      data-action="view-double"
                      aria-label={t("topbar.viewDouble")}
                      className="size-7 cursor-pointer rounded-md border-none data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm"
                    >
                      <BookOpen className="size-4" />
                    </ToggleGroupItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="flex items-center gap-2">
                  <span className="text-xs">{t("topbar.viewDouble")}</span>
                  <Kbd>2</Kbd>
                </TooltipContent>
              </Tooltip>
              {onToggleZen && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <ToggleGroupItem
                        value="zen"
                        data-action="toggle-zen"
                        aria-label={t("topbar.zen")}
                        className="size-7 cursor-pointer rounded-md border-none data-[state=on]:bg-white data-[state=on]:text-slate-900 data-[state=on]:shadow-sm"
                      >
                        <Focus className="size-4" />
                      </ToggleGroupItem>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="flex items-center gap-2">
                    <span className="text-xs">{t("topbar.zen")}</span>
                    <Kbd>Z</Kbd>
                  </TooltipContent>
                </Tooltip>
              )}
            </ToggleGroup>
            <BarDivider />
            {/* 缩放 */}
            <BarButton action="zoom-out" icon={<span className="text-base leading-none">−</span>} label={t("zoom.out")} onClick={() => onZoom(zoom - 0.25)} />
            <button
              className="min-w-[52px] cursor-pointer rounded-md px-1 py-1.5 text-center text-xs tabular-nums text-slate-600 hover:bg-accent hover:text-slate-900"
              onClick={() => onZoom(1)}
              data-action="zoom-reset"
              title={`${t("zoom.reset")} · 0`}
            >
              {Math.round(zoom * 100)}%
            </button>
            <BarButton action="zoom-in" icon={<span className="text-base leading-none">+</span>} label={t("zoom.in")} onClick={() => onZoom(zoom + 0.25)} />
            <BarDivider />
            <BarButton action="open-pdf" icon={<FolderOpen />} label={t("topbar.open")} shortcut="O" onClick={onOpen} />
            <BarButton action="export-pdf" icon={<Download />} label={t("topbar.export")} disabled={!canExport} onClick={onExport} />
            <BarButton action="export-pdf-as" icon={<Save />} label={t("topbar.saveAs")} disabled={!canExport} onClick={onSaveAs} />
          </div>
        </div>
      )}

      {docLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3.5 bg-slate-100/75 backdrop-blur-[2px]">
          <div className="spinner" />
          <div className="text-[13px] text-slate-500">{loadingText || t("loading.default")}</div>
        </div>
      )}
    </section>
  );
}
