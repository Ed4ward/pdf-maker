import { Image as ImageIcon } from "lucide-react";

interface StatusBarProps {
  fileName: string | null;
  current: number;
  total: number;
  replacedCount: number;
  zoom: number;
}

export default function StatusBar({ fileName, current, total, replacedCount, zoom }: StatusBarProps) {
  return (
    <footer className="flex h-[34px] shrink-0 items-center gap-4 border-t bg-background px-4 text-xs text-slate-500">
      <span>
        文档:<span className="font-medium text-slate-800">{fileName ?? "—"}</span>
      </span>
      {total > 0 && (
        <span>
          第 <span className="font-medium text-slate-800">{current + 1}</span> / {total} 页
        </span>
      )}
      <span className="flex-1" />
      {replacedCount > 0 && (
        <span className="flex items-center gap-1 font-medium text-emerald-600">
          <ImageIcon className="size-3" />
          已替换 <span className="font-semibold">{replacedCount}</span> 页
        </span>
      )}
      <span>
        缩放 <span className="font-medium text-slate-800">{Math.round(zoom * 100)}%</span>
      </span>
    </footer>
  );
}
