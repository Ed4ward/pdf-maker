import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import ReplacedImage from "@/components/ReplacedImage";
import TextBoxLayer from "@/components/TextBoxLayer";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import type { PageEntry, Replacement, TextBox } from "@/types";

interface ThumbPanelProps {
  entries: PageEntry[];
  thumbs: Record<string, string>;
  replacements: Record<string, Replacement>;
  textBoxes: TextBox[];
  current: number;
  onSelect: (idx: number) => void;
  /** 拖拽排序:把第 from 位移动到第 to 位 */
  onMovePage: (from: number, to: number, pushUndo: boolean) => void;
}

export default function ThumbPanel({
  entries,
  thumbs,
  replacements,
  textBoxes,
  current,
  onSelect,
  onMovePage,
}: ThumbPanelProps) {
  const { t } = useI18n();
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    itemRefs.current[current]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [current]);

  const resetDrag = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  return (
    <aside className="flex w-[264px] shrink-0 flex-col border-l bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b px-4">
        <span className="text-[13px] font-semibold">{t("thumbs.title")}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
          {t("thumbs.count", { n: entries.length })}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-3">
        {entries.map((entry, i) => {
          const rep = replacements[entry.id];
          const isDragOver = dragFrom !== null && dragOver === i && dragFrom !== i;
          return (
            <div
              key={entry.id}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className={cn(
                "group relative cursor-pointer select-none rounded-md",
                isDragOver && "outline-2 outline-dashed -outline-offset-1 outline-blue-500"
              )}
              data-action="select-page"
              data-page-index={i}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
                setDragFrom(i);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) onMovePage(dragFrom, i, true);
                resetDrag();
              }}
              onDragEnd={resetDrag}
              onClick={() => onSelect(i)}
            >
              <div
                className={cn(
                  "relative overflow-hidden rounded-md border bg-white shadow-sm transition-all",
                  current === i
                    ? "border-primary shadow-md shadow-blue-600/25 ring-[2px] ring-primary"
                    : "hover:-translate-y-px hover:border-slate-400"
                )}
              >
                <div
                  className={cn(
                    "relative overflow-hidden",
                    !thumbs[entry.id] && !rep && "thumb-skeleton"
                  )}
                  style={{ aspectRatio: `${entry.w} / ${entry.h}`, containerType: "inline-size" }}
                >
                  {rep ? (
                    <ReplacedImage pageW={entry.w} pageH={entry.h} rep={rep} />
                  ) : (
                    thumbs[entry.id] && (
                      <img
                        src={thumbs[entry.id]}
                        alt={`第 ${i + 1} 页`}
                        className="absolute inset-0 h-full w-full object-cover"
                        draggable={false}
                      />
                    )
                  )}
                  <TextBoxLayer boxes={textBoxes.filter((t) => t.pageId === entry.id)} />
                </div>
                {rep && (
                  <Badge
                    data-thumb-badge
                    className="absolute top-1.5 left-1.5 gap-0.5 rounded-full border-transparent bg-emerald-600 px-1.5 py-0.5 text-[10.5px] text-white shadow-sm"
                  >
                    <ImageIcon className="size-2.5" />
                    {t("thumbs.replaced")}
                  </Badge>
                )}
              </div>
              <div
                className={cn(
                  "mt-1.5 text-center text-xs tabular-nums",
                  current === i ? "font-semibold text-primary" : "text-slate-400"
                )}
              >
                {i + 1}
                {entry.srcIndex == null && <Badge variant="outline" className="ml-1 border-slate-200 px-1 py-0 text-[9px] font-normal text-slate-400">{t("thumbs.new")}</Badge>}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
