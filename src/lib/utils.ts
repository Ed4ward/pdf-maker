import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { PageEntry } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 页面渲染缓存的几何键:尺寸或旋转变化后旧位图自动失效
 * (旋转/改尺寸/撤销均无需手动清理缓存)。
 */
export function pageGeoKey(entry: PageEntry): string {
  return `${entry.id}:${entry.w}x${entry.h}:r${entry.rotation ?? 0}`;
}

/**
 * 页面是否发生过旋转或改尺寸(用于导出可用性与「未保存修改」判断)。
 * 以 origW/origH 为基准,旋转 90/270 时原始宽高互换后比较。
 */
export function pageGeometryEdited(entry: PageEntry): boolean {
  const rotation = entry.rotation ?? 0;
  if (entry.origW == null || entry.origH == null) return rotation !== 0;
  const [ow, oh] =
    rotation % 180 !== 0 ? [entry.origH, entry.origW] : [entry.origW, entry.origH];
  return (
    rotation !== 0 ||
    Math.abs(entry.w - ow) > 0.5 ||
    Math.abs(entry.h - oh) > 0.5
  );
}
