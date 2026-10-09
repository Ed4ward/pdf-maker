import type { PDFDocumentProxy } from "pdfjs-dist";

export type { PDFDocumentProxy };

/**
 * 文档中的一页:来自原始 PDF 或新建空白页。
 * id 在插入/重排过程中保持稳定,替换图与文字框都以 id 关联、自动跟随页面。
 */
export interface PageEntry {
  id: string;
  /** 原始 PDF 中的页码(0 起);新建空白页为 null */
  srcIndex: number | null;
  /** 页面尺寸(pt) */
  w: number;
  h: number;
}

/** 单页原始尺寸(pt) */
export interface PageInfo {
  w: number;
  h: number;
}

/** 替换图在页面内的适应方式 */
export type FitMode = "contain" | "cover";

/** 一次替换:页面被换成的图片及其排版参数 */
export interface Replacement {
  dataUrl: string;
  w: number;
  h: number;
  name: string;
  /** contain=完整放入(白底补空) / cover=铺满裁切 */
  fit: FitMode;
  /** 相对基准(contain/cover)的缩放倍率,1 = 基准 */
  scale: number;
  /** 归一化偏移,-1~1,0 = 居中 */
  offsetX: number;
  offsetY: number;
}

/** 排版参数局部更新 */
export type ReplacementPatch = Partial<Pick<Replacement, "fit" | "scale" | "offsetX" | "offsetY">>;

/** 页面上的文字框:位置/字号均为相对页面尺寸的归一化比例 */
export interface TextBox {
  id: string;
  /** 所属页面(PageEntry.id),重排时跟随页面 */
  pageId: string;
  /** 中心点归一化坐标 0~1 */
  x: number;
  y: number;
  text: string;
  /** 字号 = 页面宽度 × size(0.06 ≈ 6%) */
  size: number;
  color: string;
}

/** 文字框局部更新 */
export type TextBoxPatch = Partial<Pick<TextBox, "x" | "y" | "text" | "size" | "color">>;

/** 预览视图模式:单页 / 双页(对页并排) */
export type ViewMode = "single" | "double";

export type CompareMode = "side" | "slider" | "toggle";

export interface CompareData {
  index: number;
  before: string; // 原始页面渲染图
  after: Replacement;
  w: number; // 页面原始宽高,用于统一版面比例
  h: number;
}

export type ToastType = "success" | "info" | "error";
