import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Columns2, MoveHorizontal, Trash2, ToggleLeft, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ReplacedImage from "@/components/ReplacedImage";
import TextBoxLayer from "@/components/TextBoxLayer";
import { cn } from "@/lib/utils";
import type { CompareMode, PageInfo, Replacement, ReplacementPatch, TextBox, TextBoxPatch } from "@/types";

/** 原地对比模式的状态(由 App 持有) */
export interface CompareView {
  index: number;
  mode: CompareMode;
  before: string;
  after: Replacement;
}

const MODES: Array<{ value: CompareMode; label: string; icon: typeof Columns2 }> = [
  { value: "side", label: "左右并排", icon: Columns2 },
  { value: "slider", label: "滑动对比", icon: MoveHorizontal },
  { value: "toggle", label: "切换查看", icon: ToggleLeft },
];

interface WorkspaceProps {
  hasDoc: boolean;
  docLoading: boolean;
  loadingText: string;
  pageInfo?: PageInfo;
  previewSrc: string;
  /** 当前页的替换(含排版参数),无替换为 null */
  replacement: Replacement | null;
  /** 当前页的文字框 */
  textBoxes: TextBox[];
  selectedTextId: string | null;
  editingTextId: string | null;
  zoom: number;
  compare: CompareView | null;
  onZoom: (value: number) => void;
  /** 调整替换图排版;pushUndo=true 时记入撤销栈 */
  onAdjust: (patch: ReplacementPatch, pushUndo: boolean) => void;
  onSelectText: (id: string | null) => void;
  onStartEditText: (id: string) => void;
  onCommitText: (id: string, text: string) => void;
  onMoveText: (id: string, x: number, y: number, pushUndo: boolean) => void;
  onPatchText: (id: string, patch: TextBoxPatch) => void;
  onRemoveText: (id: string) => void;
  onCompareMode: (mode: CompareMode) => void;
  onExitCompare: () => void;
  onOpen: () => void;
  onDropFile: (file: File) => void;
}

export default function Workspace({
  hasDoc,
  docLoading,
  loadingText,
  pageInfo,
  previewSrc,
  replacement,
  textBoxes,
  selectedTextId,
  editingTextId,
  zoom,
  compare,
  onZoom,
  onAdjust,
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
}: WorkspaceProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [dropHint, setDropHint] = useState<null | "image" | "pdf">(null);
  const [pos, setPos] = useState(50);
  const [isAfter, setIsAfter] = useState(false);
  const draggingRef = useRef(false);
  // 替换图调整:拖动中的实时偏移 / 滑杆中的实时缩放(松手才提交并入撤销栈)
  const [liveOffset, setLiveOffset] = useState<{ x: number; y: number } | null>(null);
  const [liveScale, setLiveScale] = useState<number | null>(null);
  const liveOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const liveScaleRef = useRef<number | null>(null);
  const panRef = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null);

  // 生效中的替换参数(合并未提交的实时调整)
  const effRep: Replacement | null = replacement
    ? {
        ...replacement,
        scale: liveScale ?? replacement.scale,
        offsetX: liveOffset?.x ?? replacement.offsetX,
        offsetY: liveOffset?.y ?? replacement.offsetY,
      }
    : null;

  // 切页/换图后丢弃未提交的实时调整
  useEffect(() => {
    setLiveOffset(null);
    setLiveScale(null);
    liveOffsetRef.current = null;
    liveScaleRef.current = null;
    panRef.current = null;
  }, [replacement?.dataUrl]);

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

  const selectedTextBox = textBoxes.find((t) => t.id === selectedTextId) ?? null;

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

  // 常规预览 & 滑动/切换对比共用:按"适应窗口 × 缩放"计算卡片尺寸
  const cardStyle = useMemo<CSSProperties | null>(() => {
    if (!pageInfo || box.w === 0) return null;
    const pad = 56;
    const fit = Math.min((box.w - pad) / pageInfo.w, (box.h - pad) / pageInfo.h);
    const s = fit * zoom;
    return { width: Math.round(pageInfo.w * s), height: Math.round(pageInfo.h * s) };
  }, [pageInfo, box, zoom]);

  // 左右并排:两列各占一半,标签占一行高度
  const sideStyle = useMemo(() => {
    if (!pageInfo || box.w === 0) return null;
    const pad = 56, gap = 24, labelH = 40;
    const availH = box.h - pad - labelH;
    const ar = pageInfo.w / pageInfo.h;
    let w = Math.min((box.w - pad - gap) / 2, 560);
    let h = w / ar;
    if (h > availH) {
      h = availH;
      w = h * ar;
    }
    return { w: Math.floor(w), h: Math.floor(h) };
  }, [pageInfo, box]);

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

  /* -- 替换图拖动调位 -- */
  const handlePanStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 点在文字框上时由文字框自己处理
    if ((e.target as HTMLElement).closest("[data-textbox]")) return;
    onSelectText(null);
    if (!replacement) return;
    panRef.current = { px: e.clientX, py: e.clientY, ox: replacement.offsetX, oy: replacement.offsetY };
    liveOffsetRef.current = { x: replacement.offsetX, y: replacement.offsetY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setLiveOffset({ x: replacement.offsetX, y: replacement.offsetY });
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
    liveOffsetRef.current = next;
    setLiveOffset(next);
  };
  const handlePanEnd = () => {
    const p = panRef.current;
    if (!p) return;
    panRef.current = null;
    const cur = liveOffsetRef.current;
    liveOffsetRef.current = null;
    if (cur && (cur.x !== p.ox || cur.y !== p.oy)) {
      onAdjust({ offsetX: cur.x, offsetY: cur.y }, true);
    }
    setLiveOffset(null);
  };

  /* -- 缩放滑杆提交(松手/失焦才记撤销) -- */
  const commitScale = () => {
    const cur = liveScaleRef.current;
    if (cur != null) {
      liveScaleRef.current = null;
      onAdjust({ scale: cur }, true);
    }
    setLiveScale(null);
  };

  const stageCardClass =
    "relative shrink-0 overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.10)] ring-1 ring-slate-900/5";

  return (
    <section
      ref={areaRef}
      className={cn(
        "workspace-dots relative flex min-w-0 flex-1 items-center justify-center overflow-auto transition-colors",
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
      {!hasDoc && !docLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5">
          <BrandMark className="size-20 drop-shadow-xl shadow-blue-600/20" />
          <div className="text-base font-semibold text-slate-800">拖拽 PDF 文件到此处</div>
          <div className="mt-1">
            <Button onClick={onOpen}>打开 PDF 文件</Button>
          </div>
        </div>
      )}

      {/* 常规预览(有替换图时可拖动调位) */}
      {hasDoc && !compare && pageInfo && cardStyle && (
        <div
          className={cn(
            stageCardClass,
            replacement && "cursor-grab touch-none active:cursor-grabbing",
            dropHint === "image" && "outline-3 outline-dashed -outline-offset-2 outline-blue-600"
          )}
          style={cardStyle}
          onPointerDown={handlePanStart}
          onPointerMove={handlePanMove}
          onPointerUp={handlePanEnd}
          onPointerCancel={handlePanEnd}
        >
          {effRep ? (
            <div className="absolute inset-0 overflow-hidden">
              <ReplacedImage pageW={pageInfo.w} pageH={pageInfo.h} rep={effRep} />
            </div>
          ) : (
            previewSrc && (
              <img
                src={previewSrc}
                alt="页面预览"
                className="block h-full w-full select-none"
                draggable={false}
              />
            )
          )}
          <TextBoxLayer
            boxes={textBoxes}
            interactive
            selectedId={selectedTextId}
            editingId={editingTextId}
            onSelect={onSelectText}
            onStartEdit={onStartEditText}
            onEditCommit={onCommitText}
            onMove={onMoveText}
          />
          {dropHint === "image" && (
            <div className="absolute inset-0 grid place-items-center bg-blue-600/10">
              <span className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-lg">
                松开鼠标,替换当前页
              </span>
            </div>
          )}
          {dropHint === "pdf" && (
            <div className="absolute inset-0 grid place-items-center bg-slate-900/10">
              <span className="rounded-full bg-slate-900/85 px-4 py-1.5 text-sm font-medium text-white shadow-lg">
                松开鼠标,打开 PDF(当前替换内容将丢失)
              </span>
            </div>
          )}
        </div>
      )}

      {/* 替换图调整工具条 */}
      {hasDoc && !compare && replacement && (
        <div className="absolute bottom-4 left-1/2 z-[5] flex -translate-x-1/2 items-center gap-3 rounded-xl border bg-background/95 px-3 py-2 shadow-lg backdrop-blur">
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            <button
              data-action="fit-contain"
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium",
                replacement.fit === "contain"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
              onClick={() => onAdjust({ fit: "contain" }, true)}
            >
              适应
            </button>
            <button
              data-action="fit-cover"
              className={cn(
                "h-7 cursor-pointer rounded-md px-3 text-xs font-medium",
                replacement.fit === "cover"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              )}
              onClick={() => onAdjust({ fit: "cover" }, true)}
            >
              铺满
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">缩放</span>
            <input
              data-action="replace-scale"
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={effRep?.scale ?? 1}
              onChange={(e) => {
                const v = Number(e.target.value);
                liveScaleRef.current = v;
                setLiveScale(v);
              }}
              onPointerUp={commitScale}
              onKeyUp={commitScale}
              onBlur={commitScale}
              className="w-28 accent-primary"
            />
            <span className="w-10 text-xs text-slate-700 tabular-nums">
              {Math.round((effRep?.scale ?? 1) * 100)}%
            </span>
          </div>
          <button
            data-action="adjust-reset"
            className="cursor-pointer text-xs text-slate-500 hover:text-slate-900"
            onClick={() => onAdjust({ fit: "contain", scale: 1, offsetX: 0, offsetY: 0 }, true)}
          >
            重置
          </button>
          <div className="h-4 w-px bg-border" />
          <span className="text-xs text-slate-400">拖动图片调整位置</span>
        </div>
      )}

      {/* 原地对比:滑动 */}
      {compare && compare.mode === "slider" && cardStyle && pageInfo && (
        <div
          className="relative cursor-ew-resize touch-none overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(16,24,40,0.06),0_8px_24px_rgba(16,24,40,0.10)] ring-1 ring-slate-900/5 select-none"
          style={cardStyle}
          {...stagePointer}
        >
          <img
            src={compare.before}
            alt="替换前"
            className="absolute inset-0 h-full w-full bg-white object-contain"
            draggable={false}
          />
          <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
            <ReplacedImage pageW={pageInfo.w} pageH={pageInfo.h} rep={compare.after} />
            <TextBoxLayer boxes={textBoxes} />
          </div>
          <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-slate-900/75 px-2.5 py-0.5 text-[11.5px] font-semibold text-white backdrop-blur">
            ◀ 替换前 · 原始页面
          </span>
          <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-emerald-600/85 px-2.5 py-0.5 text-[11.5px] font-semibold text-white backdrop-blur">
            替换后 · 新图片 ▶
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
      {compare && compare.mode === "toggle" && cardStyle && pageInfo && (
        <div className={stageCardClass} style={cardStyle}>
          <img
            src={compare.before}
            alt="替换前"
            className="absolute inset-0 h-full w-full bg-white object-contain transition-opacity duration-150"
            style={{ opacity: isAfter ? 0 : 1 }}
            draggable={false}
          />
          <div
            className="absolute inset-0 transition-opacity duration-150"
            style={{ opacity: isAfter ? 1 : 0 }}
          >
            <ReplacedImage pageW={pageInfo.w} pageH={pageInfo.h} rep={compare.after} />
            <TextBoxLayer boxes={textBoxes} />
          </div>
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-0.5 rounded-full bg-slate-900/85 p-1 backdrop-blur">
            <button
              onClick={() => setIsAfter(false)}
              className={cn(
                "h-[30px] cursor-pointer rounded-full px-4 text-[13px] font-medium",
                !isAfter ? "bg-white text-slate-900" : "text-slate-300"
              )}
            >
              替换前
            </button>
            <button
              onClick={() => setIsAfter(true)}
              className={cn(
                "h-[30px] cursor-pointer rounded-full px-4 text-[13px] font-medium",
                isAfter ? "bg-emerald-600 text-white" : "text-slate-300"
              )}
            >
              替换后
            </button>
          </div>
        </div>
      )}

      {/* 原地对比:左右并排 */}
      {compare && compare.mode === "side" && sideStyle && (
        <div className="flex items-center justify-center gap-6">
          {(
            [
              { kind: "before", label: "替换前 · 原始页面", src: compare.before },
              { kind: "after", label: "替换后 · 新图片", src: compare.after.dataUrl },
            ] as const
          ).map(({ kind, label, src }) => (
            <div key={kind} className="flex flex-col items-center gap-2">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[12px] font-semibold",
                  kind === "before" ? "bg-slate-100 text-slate-500" : "bg-emerald-50 text-emerald-600"
                )}
              >
                {label}
              </span>
              <div className={stageCardClass} style={{ width: sideStyle.w, height: sideStyle.h }}>
                <img
                  src={src}
                  alt={label}
                  className="absolute inset-0 h-full w-full bg-white object-contain"
                  draggable={false}
                />
                {kind === "after" && <TextBoxLayer boxes={textBoxes} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 文字工具条 */}
      {!compare && selectedTextBox && (
        <div className="absolute top-4 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-background/95 px-2.5 py-1.5 shadow-lg backdrop-blur">
          <span className="pl-1 text-xs font-medium text-slate-500">文字</span>
          <button
            className="h-7 min-w-7 cursor-pointer rounded-md px-1.5 text-xs font-bold text-slate-600 hover:bg-accent"
            data-action="text-font-dec"
            title="减小字号"
            onClick={() => onPatchText(selectedTextBox.id, { size: Math.max(0.02, selectedTextBox.size / 1.25) })}
          >
            A−
          </button>
          <button
            className="h-7 min-w-7 cursor-pointer rounded-md px-1.5 text-sm font-bold text-slate-600 hover:bg-accent"
            data-action="text-font-inc"
            title="增大字号"
            onClick={() => onPatchText(selectedTextBox.id, { size: Math.min(0.3, selectedTextBox.size * 1.25) })}
          >
            A+
          </button>
          <div className="flex items-center gap-1">
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
          <div className="h-4 w-px bg-border" />
          <button
            className="grid size-7 cursor-pointer place-items-center rounded-md text-red-500 hover:bg-red-50"
            data-action="text-delete"
            title="删除文字框 (Delete)"
            onClick={() => onRemoveText(selectedTextBox.id)}
          >
            <Trash2 className="size-4" />
          </button>
          <span className="pr-1 text-xs text-slate-400">双击文字编辑 · 拖动移动</span>
        </div>
      )}

      {/* 对比模式悬浮条 */}
      {compare && (
        <div className="absolute top-4 left-1/2 z-[6] flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-background/95 p-1 shadow-lg backdrop-blur">
          <Tabs value={compare.mode} onValueChange={(v) => onCompareMode(v as CompareMode)}>
            <TabsList className="h-8 gap-0.5 rounded-lg p-0.5">
              {MODES.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  data-action={`cmp-${value}`}
                  className="h-7 gap-1.5 rounded-md px-3 text-xs"
                >
                  <Icon className="size-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button
            onClick={onExitCompare}
            data-action="cmp-exit"
            className="grid size-7 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-accent hover:text-slate-900"
            title="退出对比 (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* 缩放条(并排模式下隐藏,固定右下角) */}
      {hasDoc && (!compare || compare.mode !== "side") && (
        <div className="absolute right-4 bottom-4 z-[5] flex items-center rounded-full bg-slate-900/85 p-1 text-slate-200 shadow-lg backdrop-blur">
          <button
            className="grid size-7 cursor-pointer place-items-center rounded-full text-base hover:bg-white/15"
            onClick={() => onZoom(zoom - 0.25)}
            data-action="zoom-out"
            title="缩小"
          >
            −
          </button>
          <button
            className="min-w-[52px] cursor-pointer text-center text-xs tabular-nums hover:text-white"
            onClick={() => onZoom(1)}
            data-action="zoom-reset"
            title="恢复 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            className="grid size-7 cursor-pointer place-items-center rounded-full text-base hover:bg-white/15"
            onClick={() => onZoom(zoom + 0.25)}
            data-action="zoom-in"
            title="放大"
          >
            +
          </button>
        </div>
      )}

      {docLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3.5 bg-slate-100/75 backdrop-blur-[2px]">
          <div className="spinner" />
          <div className="text-[13px] text-slate-500">{loadingText || "正在加载…"}</div>
        </div>
      )}
    </section>
  );
}
