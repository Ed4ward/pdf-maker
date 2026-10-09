import { Github, Languages } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/i18n";

const GITHUB_REPO_URL = "https://github.com/Ed4ward/pdf-maker";

/** 顶栏:仅标题行(品牌 + 语言切换 + GitHub)。全部编辑操作位于预览区下方的页面操作栏 */
export default function TopBar() {
  const { t, locale, setLocale } = useI18n();

  return (
    <header className="relative z-20 shrink-0 border-b bg-background">
      <div className="flex h-14 items-center justify-between px-2 md:px-4">
        <div className="flex items-center gap-2.5">
          <BrandMark className="size-8 rounded-[9px] drop-shadow-md shadow-blue-600/30" />
          <span className="text-[15px] font-semibold">{t("app.name")}</span>
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
    </header>
  );
}
