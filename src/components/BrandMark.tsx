import { useI18n } from '@/i18n';

/**
 * 品牌图标 v2(原创设计):
 * 两页错位叠放 —— 后页半透明(原页面),前页实白(替换后的新页),
 * 前页上一条文字线 + 一个蓝色图片块,表达「图片/文字替换页面内容」。
 * 元素少、对比强,小尺寸(16px favicon)下依然清晰。
 */
export default function BrandMark({ className }: { className?: string }) {
    const { t } = useI18n();
  return (
    <svg viewBox="0 0 48 48" className={className} aria-label={t("app.name")} role="img">
      <defs>
        <linearGradient id="pdfmaker-brand-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4F8EF7" />
          <stop offset="1" stopColor="#1D4ED8" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#pdfmaker-brand-g)" />
      {/* 后页:原页面(半透明,左倾) */}
      <g transform="rotate(-8 21 22)">
        <rect x="10.5" y="8" width="21" height="28" rx="3.5" fill="#fff" opacity="0.45" />
      </g>
      {/* 前页:替换后的新页(实白,微右倾) */}
      <g transform="rotate(4 30.5 27)">
        <rect x="20" y="13" width="21" height="28" rx="3.5" fill="#fff" />
        <rect x="24" y="17.5" width="9.5" height="2.4" rx="1.2" fill="#CBD5E1" />
        <rect x="24" y="23.5" width="13" height="10.5" rx="2" fill="#2563EB" />
        <path d="M26.5 31.5l2.8-3.4 2.2 2.6 1.8-2.1 3.5 2.9h-10.3z" fill="#fff" />
        <circle cx="34" cy="26.3" r="1.4" fill="#fff" />
      </g>
    </svg>
  );
}
