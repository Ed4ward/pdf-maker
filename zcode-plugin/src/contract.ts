/** 插件契约:工具输入/输出、资源 URI 与共享类型。页面与服务端共同引用。 */

export const PLUGIN_NAME = "pdf-editor";
export const PANEL_URI = "ui://pdf-editor/editor.html";
export const SURFACE_ID = "pdf-editor";
export const HTML_MIME = "text/html;profile=mcp-app";

export const sourceResourceUri = (docId: string) => `pdf://pdf-editor/${docId}/source`;
export const assetResourceUri = (docId: string, assetId: string) =>
  `pdf://pdf-editor/${docId}/asset/${assetId}`;

export type FitMode = "contain" | "cover";

/** 文档中的一页:id 在插入/重排中保持稳定 */
export interface PageEntry {
  id: string;
  /** 原始 PDF 页码(0 起);新建空白页为 null */
  srcIndex: number | null;
  w: number;
  h: number;
}

export interface Replacement {
  assetId: string;
  name: string;
  w: number;
  h: number;
  fit: FitMode;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface TextBox {
  id: string;
  pageId: string;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
}

export interface DocState {
  docId: string;
  fileName: string;
  pageCount: number;
  pages: PageEntry[];
  replacements: Record<string, Replacement>;
  textBoxes: TextBox[];
  /** 存在待合成的高清页面(含文字),导出前需由页面 stage */
  compositesPending: string[];
  exportedTo?: string;
}

export class DocError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "DocError";
  }
}

export const ERROR_CODES = [
  "not_found",
  "invalid_input",
  "out_of_range",
  "composite_required",
  "file_exists",
  "io_error",
] as const;
export type DocErrorCode = (typeof ERROR_CODES)[number];
