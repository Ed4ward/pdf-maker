import {
  Columns2,
  Download,
  FolderOpen,
  ImagePlus,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface IconActionProps {
  /** 稳定的机器可读标识,供 agent 通过 [data-action] 定位 */
  action: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

function IconAction({ action, label, hint, icon, onClick, disabled }: IconActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button data-action={action} variant="ghost" size="icon" disabled={disabled} onClick={onClick} className="size-8">
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span className="font-medium">{label}</span>
        {hint && <span className="opacity-70"> · {hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-0.5 px-1">{children}</div>;
}

interface TopBarProps {
  hasDoc: boolean;
  canRevert: boolean;
  canCompare: boolean;
  canUndo: boolean;
  canExport: boolean;
  /** 多于一页时才可删除 */
  canDeletePage: boolean;
  onOpen: () => void;
  onAddPage: () => void;
  onAddText: () => void;
  onReplace: () => void;
  onRevert: () => void;
  onDeletePage: () => void;
  onCompare: () => void;
  onUndo: () => void;
  onExport: () => void;
}

export default function TopBar({
  hasDoc,
  canRevert,
  canCompare,
  canUndo,
  canExport,
  canDeletePage,
  onOpen,
  onAddPage,
  onAddText,
  onReplace,
  onRevert,
  onDeletePage,
  onCompare,
  onUndo,
  onExport,
}: TopBarProps) {
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-center border-b bg-background px-4">
      {/* 品牌绝对定位在左侧,按钮组在整行居中 */}
      <div className="absolute left-4 flex items-center gap-2.5">
        <BrandMark className="size-8 shrink-0 rounded-[9px] drop-shadow-md shadow-blue-600/30" />
        <span className="text-[15px] font-semibold">PDF编辑器</span>
      </div>

      <Group>
        <IconAction action="open-pdf" label="打开 PDF" hint="选择本地文件" icon={<FolderOpen />} onClick={onOpen} />
      </Group>

      <Group>
        <IconAction
          action="add-text"
          label="添加文字"
          hint="在当前页插入文本框"
          icon={<Type />}
          onClick={onAddText}
          disabled={!hasDoc}
        />
        <IconAction
          action="add-page"
          label="新建页面"
          hint="在当前页后插入空白页"
          icon={<Plus />}
          onClick={onAddPage}
          disabled={!hasDoc}
        />
        <IconAction
          action="replace-image"
          label="用图片替换此页"
          hint="选择图片替换当前页"
          icon={<ImagePlus />}
          onClick={onReplace}
          disabled={!hasDoc}
        />
      </Group>

      <Group>
        <IconAction
          action="revert-page"
          label="恢复原页"
          hint="撤销此页的图片替换"
          icon={<RotateCcw />}
          onClick={onRevert}
          disabled={!canRevert}
        />
        <IconAction action="undo" label="撤销" hint="⌘Z" icon={<Undo2 />} onClick={onUndo} disabled={!canUndo} />
        <IconAction
          action="delete-page"
          label="删除此页"
          hint="删除当前页(需确认)"
          icon={<Trash2 />}
          onClick={onDeletePage}
          disabled={!canDeletePage}
        />
      </Group>

      <Group>
        <IconAction
          action="toggle-compare"
          label="替换对比"
          hint="对比替换前后内容"
          icon={<Columns2 />}
          onClick={onCompare}
          disabled={!canCompare}
        />
      </Group>

      <Group>
        <IconAction
          action="export-pdf"
          label="导出 PDF"
          hint="下载替换后的文件"
          icon={<Download />}
          onClick={onExport}
          disabled={!canExport}
        />
      </Group>
    </header>
  );
}
