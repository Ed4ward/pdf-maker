import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/utils";
import type { TextBox } from "@/types";

interface TextBoxLayerProps {
  boxes: TextBox[];
  /** true = 预览态:可选中/拖动/双击编辑;false = 缩略图与对比等只读场景 */
  interactive?: boolean;
  selectedId?: string | null;
  editingId?: string | null;
  onSelect?: (id: string) => void;
  onStartEdit?: (id: string) => void;
  onEditCommit?: (id: string, text: string) => void;
  /** 拖动结束提交位置;pushUndo=false 表示拖动过程中的实时更新 */
  onMove?: (id: string, x: number, y: number, pushUndo: boolean) => void;
}

/**
 * 页面文字框图层。根元素铺满页面框并声明为 container,
 * 字号用 cqw(容器宽度百分比)表达,任意渲染尺寸下与导出结果一致。
 */
export default function TextBoxLayer({
  boxes,
  interactive = false,
  selectedId,
  editingId,
  onSelect,
  onStartEdit,
  onEditCommit,
  onMove,
}: TextBoxLayerProps) {
  const [live, setLive] = useState<{ id: string; x: number; y: number } | null>(null);
  const liveRef = useRef<{ id: string; x: number; y: number } | null>(null);
  const dragRef = useRef<{ id: string; px: number; py: number; ox: number; oy: number } | null>(null);
  const editRef = useRef<HTMLSpanElement>(null);

  // 进入编辑态时聚焦并全选。
  // 延迟到下一帧:浏览器双击的默认选词行为会先清掉程序化选区
  useEffect(() => {
    if (!editingId) return;
    const timer = setTimeout(() => {
      const el = editRef.current;
      if (!el) return;
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }, 0);
    return () => clearTimeout(timer);
  }, [editingId]);

  if (boxes.length === 0) return null;

  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

  const startDrag = (e: ReactPointerEvent<HTMLSpanElement>, tb: TextBox) => {
    if (!interactive || editingId === tb.id) return;
    e.stopPropagation();
    onSelect?.(tb.id);
    dragRef.current = { id: tb.id, px: e.clientX, py: e.clientY, ox: tb.x, oy: tb.y };
    const l = { id: tb.id, x: tb.x, y: tb.y };
    liveRef.current = l;
    setLive(l);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const moveDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const rect = e.currentTarget.parentElement!.getBoundingClientRect();
    const next = {
      id: d.id,
      x: clamp01(d.ox + (e.clientX - d.px) / rect.width),
      y: clamp01(d.oy + (e.clientY - d.py) / rect.height),
    };
    liveRef.current = next;
    setLive(next);
  };

  const endDrag = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    dragRef.current = null;
    const cur = liveRef.current;
    liveRef.current = null;
    if (cur && cur.id === d.id && (cur.x !== d.ox || cur.y !== d.oy)) {
      onMove?.(d.id, cur.x, cur.y, true);
    }
    setLive(null);
  };

  return (
    <div className="pointer-events-none absolute inset-0" style={{ containerType: "inline-size" }}>
      {boxes.map((tb) => {
        const pos = live?.id === tb.id ? live : tb;
        const isEditing = editingId === tb.id;
        return (
          <span
            key={tb.id}
            data-textbox={tb.id}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap text-center leading-[1.3]",
              interactive && !isEditing && "cursor-grab",
              isEditing && "cursor-text",
              selectedId === tb.id && !isEditing && "outline-2 outline-dashed outline-offset-4 outline-blue-500",
              isEditing && "outline-2 outline-offset-4 outline-blue-600"
            )}
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              fontSize: `${tb.size * 100}cqw`,
              color: tb.color,
              maxWidth: "90%",
              pointerEvents: interactive ? "auto" : "none",
              textShadow: tb.color.toLowerCase() === "#ffffff" ? "0 0 3px rgba(0,0,0,0.4)" : undefined,
            }}
            onPointerDown={(e) => startDrag(e, tb)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onDoubleClick={(e) => {
              if (!interactive) return;
              e.preventDefault();
              onStartEdit?.(tb.id);
            }}
            contentEditable={isEditing ? "plaintext-only" : undefined}
            suppressContentEditableWarning
            ref={isEditing ? editRef : undefined}
            onBlur={(e) => {
              if (isEditing) onEditCommit?.(tb.id, e.currentTarget.innerText.replace(/\n$/, ""));
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (isEditing && e.key === "Escape") e.currentTarget.blur();
            }}
          >
            {tb.text}
          </span>
        );
      })}
    </div>
  );
}
