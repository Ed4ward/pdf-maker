import {
  Columns2,
  Download,
  FolderOpen,
  Github,
  ImagePlus,
  Languages,
  Plus,
  RotateCcw,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import type { ReactNode } from "react";
import BrandMark from "@/components/BrandMark";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";

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

const GITHUB_REPO_URL = "https://github.com/Ed4ward/pdf-maker";

interface TopBarProps {
  hasDoc: boolean;
  canRevert: boolean;
  canCompare: boolean;
  canUndo: boolean;
  canExport: boolean;
  /** 多于一页时才可删除 */
  canDeletePage: boolean;
  /** 有未导出的编辑时,打开新文档需二次确认 */
  hasEdits: boolean;
  /** 当前页码(1 起),用于删除确认文案 */
  currentPage: number;
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
  hasEdits,
  currentPage,
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
    <header className="relative z-20 shrink-0 border-b bg-background">
      {/* 第一行:标题栏(品牌 + 语言切换) */}
      <div className="flex h-14 items-center justify-between border-b px-2 md:px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-8 rounded-[9px] drop-shadow-md shadow-blue-600/30" />
          <span className="text-[15px] font-semibold">PDF编辑器</span>
        </div>
        <div className="flex items-center">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-action="toggle-locale"
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => setLocale(locale === "zh-CN" ? "en" : "zh-CN")}
              >
                <Languages />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Language / 语言</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild data-action="open-github" variant="ghost" size="icon" className="size-8">
                <a href={GITHUB_REPO_URL} target="_blank" rel="noopener noreferrer">
                  <Github />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("topbar.github")}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {/* 第二行:菜单栏(操作按钮,左对齐,放不下时横向滑动) */}
      <div className="flex w-full items-center gap-0.5 overflow-x-auto px-2 py-2 md:gap-1.5">
      <Group>
        {hasEdits ? (
          <AlertDialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <AlertDialogTrigger asChild>
                  <Button data-action="open-pdf" variant="ghost" size="icon" className="size-8">
                    <FolderOpen />
                  </Button>
                </AlertDialogTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <span className="font-medium">{t("topbar.open")}</span>
                <span className="opacity-70"> · {t("topbar.open.hint")}</span>
              </TooltipContent>
            </Tooltip>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("dialog.openNewTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("confirm.openNew")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-action="cancel-open-new">{t("dialog.cancel")}</AlertDialogCancel>
                <AlertDialogAction data-action="confirm-open-new" onClick={onOpen}>
                  {t("dialog.continue")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <IconAction
            action="open-pdf"
            label={t("topbar.open")}
            hint={t("topbar.open.hint")}
            icon={<FolderOpen />}
            onClick={onOpen}
          />
        )}
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
        <IconAction
          action="undo"
          label={t("topbar.undo")}
          hint={t("topbar.undo.hint")}
          icon={<Undo2 />}
          onClick={onUndo}
          disabled={!canUndo}
        />
        <AlertDialog>
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  data-action="delete-page"
                  variant="ghost"
                  size="icon"
                  disabled={!canDeletePage}
                  className="size-8"
                >
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <span className="font-medium">{t("topbar.delete")}</span>
              <span className="opacity-70"> · {t("topbar.delete.hint")}</span>
            </TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dialog.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirm.deletePage", { page: currentPage })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-action="cancel-delete">{t("dialog.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                data-action="confirm-delete"
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={onDeletePage}
              >
                {t("dialog.confirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
      </div>
    </header>
  );
}
