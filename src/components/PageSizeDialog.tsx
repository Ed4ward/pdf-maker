import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/i18n";

interface PageSizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 当前页显示尺寸(pt) */
  pageW: number;
  pageH: number;
  /** 当前页原始尺寸(pt),供「原始尺寸」重置 */
  origW?: number;
  origH?: number;
  /** 应用尺寸;all=true 时应用到全部页 */
  onResize: (w: number, h: number, all: boolean) => void;
}

/** 页面尺寸对话框:预设 / 自定义宽高(pt)/ 原始尺寸重置,可应用到本页或全部页 */
export default function PageSizeDialog({
  open,
  onOpenChange,
  pageW,
  pageH,
  origW,
  origH,
  onResize,
}: PageSizeDialogProps) {
  const { t } = useI18n();
  const [wText, setWText] = useState(() => String(Math.round(pageW * 100) / 100));
  const [hText, setHText] = useState(() => String(Math.round(pageH * 100) / 100));

  // 预设跟随当前页横竖方向:横向页应用竖版预设时自动互换
  const oriented = (pw: number, ph: number): [number, number] =>
    pageW > pageH && pw < ph ? [ph, pw] : [pw, ph];

  const parsedW = Number(wText);
  const parsedH = Number(hText);
  const valid =
    Number.isFinite(parsedW) &&
    Number.isFinite(parsedH) &&
    parsedW >= 20 &&
    parsedH >= 20 &&
    parsedW <= 14400 &&
    parsedH <= 14400;

  const apply = (w: number, h: number, all: boolean) => {
    onOpenChange(false);
    onResize(w, h, all);
  };

  const squareSide = Math.round(((pageW + pageH) / 2) * 100) / 100;

  const presets = [
    { id: "a4", label: "A4", w: 595.28, h: 841.89 },
    { id: "a3", label: "A3", w: 841.89, h: 1190.55 },
    { id: "a5", label: "A5", w: 419.53, h: 595.28 },
    { id: "letter", label: "Letter", w: 612, h: 792 },
    { id: "legal", label: "Legal", w: 612, h: 1008 },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("size.title")}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {Math.round(pageW)} × {Math.round(pageH)} pt
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-1.5">
            {presets.map((p) => {
              const [w, h] = oriented(p.w, p.h);
              return (
                <button
                  key={p.id}
                  data-action="size-preset"
                  data-preset={p.id}
                  type="button"
                  className="cursor-pointer rounded-md border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
                  onClick={() => apply(w, h, false)}
                >
                  {p.label}
                  <span className="block text-[10px] font-normal text-muted-foreground tabular-nums">
                    {Math.round(w)}×{Math.round(h)}
                  </span>
                </button>
              );
            })}
            <button
              data-action="size-preset"
              data-preset="square"
              type="button"
              className="cursor-pointer rounded-md border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
              onClick={() => apply(squareSide, squareSide, false)}
            >
              {t("size.square")}
              <span className="block text-[10px] font-normal text-muted-foreground tabular-nums">
                {Math.round(squareSide)}×{Math.round(squareSide)}
              </span>
            </button>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
              {t("size.width")}
              <input
                data-action="size-w"
                value={wText}
                onChange={(e) => setWText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && valid) apply(parsedW, parsedH, false);
                }}
                inputMode="decimal"
                className="h-8 rounded-md border px-2 text-xs tabular-nums outline-none focus:border-primary"
              />
            </label>
            <span className="pb-2 text-xs text-muted-foreground">×</span>
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
              {t("size.height")}
              <input
                data-action="size-h"
                value={hText}
                onChange={(e) => setHText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && valid) apply(parsedW, parsedH, false);
                }}
                inputMode="decimal"
                className="h-8 rounded-md border px-2 text-xs tabular-nums outline-none focus:border-primary"
              />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2">
            {origW != null && origH != null ? (
              <button
                data-action="size-reset"
                type="button"
                className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  const [w, h] = oriented(origW, origH);
                  apply(w, h, false);
                }}
              >
                {t("size.reset")}
              </button>
            ) : (
              <span className="text-xs text-muted-foreground">pt</span>
            )}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={!valid}
                data-action="size-apply"
                className="h-7 cursor-pointer px-2.5 text-xs"
                onClick={() => apply(parsedW, parsedH, false)}
              >
                {t("size.applyPage")}
              </Button>
              <Button
                size="sm"
                disabled={!valid}
                data-action="size-apply-all"
                className="h-7 cursor-pointer px-2.5 text-xs"
                onClick={() => apply(parsedW, parsedH, true)}
              >
                {t("size.applyAll")}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
