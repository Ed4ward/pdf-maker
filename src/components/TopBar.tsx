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
import { useI18n } from "@/i18n";
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
  const { t, locale, setLocale } = useI18n();
  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-center border-b bg-background px-4">
      {/* 品牌绝对定位在左侧,按钮组在整行居中 */}
      <div className="absolute left-4 flex items-center gap-2.5">
        <BrandMark className="size-8 shrink-0 rounded-[9px] drop-shadow-md shadow-blue-600/30" />
        <span className="text-[15px] font-semibold">PDF编辑器</span>
      </div>

      <Group>
        <IconAction action="open-pdf" label={t("topbar.open")} hint={t("topbar.open.hint")} icon={<FolderOpen />} onClick={onOpen} />
      </Group>

      <Group>
        <IconAction
          action="add-text"
          label={t("topbar.addText")}
          hint={t("topbar.addText.hint")}
          icon={<Type />}
          onClick={onAddText}
          disabled={!hasDoc}
        />
        <IconAction
          action="add-page"
          label={t("topbar.addPage")}
          hint={t("topbar.addPage.hint")}
          icon={<Plus />}
          onClick={onAddPage}
          disabled={!hasDoc}
        />
        <IconAction
          action="replace-image"
          label={t("topbar.replace")}
          hint={t("topbar.replace.hint")}
          icon={<ImagePlus />}
          onClick={onReplace}
          disabled={!hasDoc}
        />
      </Group>

      <Group>
        <IconAction
          action="revert-page"
          label={t("topbar.revert")}
          hint={t("topbar.revert.hint")}
          icon={<RotateCcw />}
          onClick={onRevert}
          disabled={!canRevert}
        />
        <IconAction action="undo" label={t("topbar.undo")} hint={t("topbar.undo.hint")} icon={<Undo2 />} onClick={onUndo} disabled={!canUndo} />
        <IconAction
          action="delete-page"
          label={t("topbar.delete")}
          hint={t("topbar.delete.hint")}
          icon={<Trash2 />}
          onClick={onDeletePage}
          disabled={!canDeletePage}
        />
      </Group>

      <Group>
        <IconAction
          action="toggle-compare"
          label={t("topbar.compare")}
          hint={t("topbar.compare.hint")}
          icon={<Columns2 />}
          onClick={onCompare}
          disabled={!canCompare}
        />
      </Group>

      <Group>
        <IconAction
          action="export-pdf"
          label={t("topbar.export")}
          hint={t("topbar.export.hint")}
          icon={<Download />}
          onClick={onExport}
          disabled={!canExport}
        />
      </Group>

      <button
        data-action="toggle-locale"
        title="Language / 语言"
        onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
        className="absolute right-4 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-accent hover:text-slate-900"
      >
        {t("lang.toggle")}
      </button>
    </header>
  );
}
