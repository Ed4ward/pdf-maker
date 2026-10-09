import { ChevronLeft, ChevronRight, Image as ImageIcon } from "lucide-react";
import { useI18n } from "@/i18n";

interface StatusBarProps {
  fileName: string | null;
  current: number;
  total: number;
  replacedCount: number;
  zoom: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export default function StatusBar({ fileName, current, total, replacedCount, zoom, onPrevPage, onNextPage }: StatusBarProps) {
  const { t } = useI18n();
  return (
    <footer className="flex h-[34px] shrink-0 items-center gap-4 border-t bg-background px-4 text-xs text-slate-500">
      <span className="hidden sm:flex">
        {t("status.doc")} <span className="font-medium text-slate-800">{fileName ?? "—"}</span>
      </span>
      {total > 0 && (
        <span className="flex items-center gap-0.5">
          <button
            data-action="prev-page"
            className="grid size-5 cursor-pointer place-items-center rounded hover:bg-accent hover:text-slate-900 disabled:cursor-default disabled:opacity-40"
            disabled={current === 0}
            onClick={onPrevPage}
            title={t("page.prev")}
            aria-label={t("page.prev")}
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="px-1 tabular-nums">{t("status.pageOf", { cur: current + 1, total })}</span>
          <button
            data-action="next-page"
            className="grid size-5 cursor-pointer place-items-center rounded hover:bg-accent hover:text-slate-900 disabled:cursor-default disabled:opacity-40"
            disabled={current >= total - 1}
            onClick={onNextPage}
            title={t("page.next")}
            aria-label={t("page.next")}
          >
            <ChevronRight className="size-3.5" />
          </button>
        </span>
      )}
      <span className="flex-1" />
      {replacedCount > 0 && (
        <span className="flex items-center gap-1 font-medium text-emerald-600">
          <ImageIcon className="size-3" />
          {t("status.replaced", { n: replacedCount })}
        </span>
      )}
      <span className="hidden sm:flex">{t("status.zoom", { z: Math.round(zoom * 100) })}</span>
    </footer>
  );
}
