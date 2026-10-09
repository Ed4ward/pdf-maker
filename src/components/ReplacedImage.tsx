import type { CSSProperties } from "react";
import type { Replacement } from "@/types";
import { useI18n } from "@/i18n";

/**
 * 替换图在页面框内的定位样式(全部用百分比表达,任意尺寸下表现一致)。
 * 基准:contain = 完整放入页面,cover = 铺满页面裁切;
 * 再乘以 rep.scale,中心按 rep.offsetX/Y(占页面尺寸的一半)偏移。
 */
export function replacedImageStyle(pageW: number, pageH: number, rep: Replacement): CSSProperties {
  const pageAR = pageW / pageH;
  const imgAR = rep.w / rep.h;
  const base =
    rep.fit === "contain"
      ? pageAR >= imgAR
        ? { w: (imgAR / pageAR) * 100, h: 100 }
        : { w: 100, h: (pageAR / imgAR) * 100 }
      : pageAR >= imgAR
        ? { w: 100, h: (pageAR / imgAR) * 100 }
        : { w: (imgAR / pageAR) * 100, h: 100 };
  return {
    position: "absolute",
    // 覆盖 Tailwind preflight 的 img { max-width: 100% },
    // 否则 cover / 放大时宽度被钳制导致图片变形
    maxWidth: "none",
    maxHeight: "none",
    width: `${base.w * rep.scale}%`,
    height: `${base.h * rep.scale}%`,
    left: `${50 + rep.offsetX * 50}%`,
    top: `${50 + rep.offsetY * 50}%`,
    transform: "translate(-50%, -50%)",
  };
}

/** 在页面框内按排版参数渲染替换图,父元素需为 relative + overflow-hidden */
export default function ReplacedImage({
  pageW,
  pageH,
  rep,
}: {
  pageW: number;
  pageH: number;
  rep: Replacement;
}) {
  const { t } = useI18n();
  return (
    <img
      src={rep.dataUrl}
      alt={t("textbox.alt", { name: rep.name })}
      draggable={false}
      className="absolute select-none"
      style={replacedImageStyle(pageW, pageH, rep)}
    />
  );
}
