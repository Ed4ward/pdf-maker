import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  DocError,
  PANEL_URI,
  PLUGIN_NAME,
  SURFACE_ID,
  assetResourceUri,
  sourceResourceUri,
} from "./contract.ts";
import { DocStore } from "./document.ts";

const HTML_MIME = "text/html;profile=mcp-app";

export function createPdfEditorServer({
  store,
  workspaceRoot,
  panelHtml,
}: {
  store: DocStore;
  workspaceRoot: string;
  panelHtml: string;
}) {
  const server = new McpServer({ name: PLUGIN_NAME, version: "0.1.0" });

  const register = (
    name: string,
    description: string,
    inputSchema: Record<string, z.ZodType>,
    visibility: "model" | "app",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: (input: any) => Promise<unknown> | unknown,
  ) => {
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        _meta: {
          ui: {
            resourceUri: PANEL_URI,
            surface: SURFACE_ID,
            visibility: visibility === "model" ? ["model", "app"] : ["app"],
          },
          ...(visibility === "model"
            ? { "openai/ui": { preferredModelDisplayMode: "fullscreen" } }
            : {}),
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (input: any) => {
        try {
          const result = (await execute(input)) as Record<string, unknown>;
          const hint = typeof result.hint === "string" ? result.hint : "OK";
          return {
            content: [{ type: "text" as const, text: hint }],
            structuredContent: result,
          };
        } catch (error) {
          const code = error instanceof DocError ? error.code : "operation_failed";
          const message = error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{ type: "text" as const, text: `[${code}] ${message}` }],
            structuredContent: { error: { code, message } },
          };
        }
      },
    );
  };

  // ---- 模型可见工具:打开 / 总览 / 编辑 / 导出 ----

  register(
    "load_pdf",
    "打开工作区中的 PDF 文件,返回文档 ID 与页面列表,并在侧栏打开编辑面板",
    { path: z.string().describe("PDF 相对工作区根目录的路径") },
    "model",
    async (input: { path: string }) => {
      const abs = store.resolveWorkspace(input.path, workspaceRoot);
      const state = await store.load(abs, input.path.replaceAll("\\", "/"), workspaceRoot);
      return { hint: `已打开 ${state.fileName},共 ${state.pageCount} 页`, ...state };
    },
  );

  register(
    "get_last_document",
    "获取最近打开的文档状态(面板重建时恢复);无文档返回 { empty: true }",
    {},
    "app",
    async () => {
      const last = store.lastDocId();
      return last ? store.peek(last, workspaceRoot) : { empty: true };
    },
  );

  register(
    "get_document",
    "获取当前文档的完整编辑状态(页面、替换图、文字框)",
    { doc_id: z.string().describe("load_pdf 返回的文档 ID") },
    "model",
    async (input: { doc_id: string }) => store.peek(input.doc_id, workspaceRoot),
  );

  register(
    "replace_page_with_image",
    "把指定页(0 起)替换为工作区中的图片(PNG/JPG),图片按适应模式放入原页面尺寸",
    {
      doc_id: z.string(),
      page_index: z.number().int().min(0),
      image_path: z.string().describe("图片相对工作区根目录的路径"),
    },
    "model",
    async (input: { doc_id: string; page_index: number; image_path: string }) => {
      const abs = store.resolveWorkspace(input.image_path, workspaceRoot);
      await store.replacePage(
        input.doc_id,
        input.page_index,
        abs,
        input.image_path.replaceAll("\\", "/"),
      );
      const state = store.peek(input.doc_id, workspaceRoot);
      return {
        hint: `已把第 ${input.page_index + 1} 页替换为图片「${input.image_path}」`,
        ...state,
      };
    },
  );

  register(
    "add_text",
    "在指定页添加文字框;坐标为归一化 0~1(0.5 居中),size 为相对页宽的字号",
    {
      doc_id: z.string(),
      page_index: z.number().int().min(0),
      text: z.string().min(1),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
      size: z.number().min(0.02).max(0.3).optional(),
      color: z.string().optional(),
    },
    "model",
    async (input: {
      doc_id: string;
      page_index: number;
      text: string;
      x?: number;
      y?: number;
      size?: number;
      color?: string;
    }) => {
      const box = store.addText(input.doc_id, input.page_index, input.text, {
        x: input.x,
        y: input.y,
        size: input.size,
        color: input.color,
      });
      const state = store.peek(input.doc_id, workspaceRoot);
      return { hint: `已在第 ${input.page_index + 1} 页添加文字「${input.text}」`, text_id: box.id, ...state };
    },
  );

  register(
    "export_pdf",
    "按当前页面顺序与全部编辑,导出新 PDF 到工作区;目标存在时需要 overwrite: true",
    {
      doc_id: z.string(),
      path: z.string().describe("导出路径,相对工作区根目录"),
      overwrite: z.boolean().optional(),
    },
    "model",
    async (input: { doc_id: string; path: string; overwrite?: boolean }) => {
      const result = await store.export(
        input.doc_id,
        input.path,
        workspaceRoot,
        input.overwrite ?? false,
      );
      return {
        hint: `已导出到 ${result.path}(${Math.round(result.bytes / 1024)} KiB${
          result.rasterPages.length ? `,第 ${result.rasterPages.join(",")} 页为高清合成` : ""
        })`,
        ...result,
        ...store.peek(input.doc_id, workspaceRoot),
      };
    },
  );

  // ---- 面板专用工具 ----

  register(
    "replace_page_meta",
    "面板:更换某页替换图(前端直读文件场景保留)",
    {
      doc_id: z.string(),
      page_index: z.number().int().min(0),
      image_path: z.string(),
    },
    "app",
    async (input: { doc_id: string; page_index: number; image_path: string }) => {
      const abs = store.resolveWorkspace(input.image_path, workspaceRoot);
      await store.replacePage(input.doc_id, input.page_index, abs, input.image_path);
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "clear_page_replacement",
    "移除某页的替换图,恢复原始内容",
    { doc_id: z.string(), page_index: z.number().int().min(0) },
    "app",
    async (input: { doc_id: string; page_index: number }) => {
      store.clearReplacement(input.doc_id, input.page_index);
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "set_replacement_layout",
    "微调某页替换图:fit(contain/cover)、scale(0.5~3)、offsetX/offsetY(-1~1)",
    {
      doc_id: z.string(),
      page_index: z.number().int().min(0),
      fit: z.enum(["contain", "cover"]).optional(),
      scale: z.number().min(0.5).max(3).optional(),
      offset_x: z.number().min(-1).max(1).optional(),
      offset_y: z.number().min(-1).max(1).optional(),
    },
    "app",
    async (input: {
      doc_id: string;
      page_index: number;
      fit?: "contain" | "cover";
      scale?: number;
      offset_x?: number;
      offset_y?: number;
    }) => {
      store.setLayout(input.doc_id, input.page_index, {
        fit: input.fit,
        scale: input.scale,
        offsetX: input.offset_x,
        offsetY: input.offset_y,
      });
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "update_text",
    "更新文字框内容/位置/字号/颜色",
    {
      doc_id: z.string(),
      text_id: z.string(),
      text: z.string().optional(),
      x: z.number().min(0).max(1).optional(),
      y: z.number().min(0).max(1).optional(),
      size: z.number().min(0.02).max(0.3).optional(),
      color: z.string().optional(),
    },
    "app",
    async (input: {
      doc_id: string;
      text_id: string;
      text?: string;
      x?: number;
      y?: number;
      size?: number;
      color?: string;
    }) => {
      store.updateText(input.doc_id, input.text_id, {
        text: input.text,
        x: input.x,
        y: input.y,
        size: input.size,
        color: input.color,
      });
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "remove_text",
    "删除文字框",
    { doc_id: z.string(), text_id: z.string() },
    "app",
    async (input: { doc_id: string; text_id: string }) => {
      store.removeText(input.doc_id, input.text_id);
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "add_blank_page",
    "在指定位置(0 起,afterIndex 的下一页)插入 A4 空白页",
    { doc_id: z.string(), after_index: z.number().int().min(-1) },
    "app",
    async (input: { doc_id: string; after_index: number }) => {
      store.addBlankPage(input.doc_id, input.after_index);
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "delete_page",
    "删除指定页(其替换图与文字一并移除;至少保留一页)",
    { doc_id: z.string(), page_index: z.number().int().min(0) },
    "app",
    async (input: { doc_id: string; page_index: number }) => {
      store.deletePage(input.doc_id, input.page_index);
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "move_page",
    "把第 from 页移动到第 to 位(0 起)",
    {
      doc_id: z.string(),
      from: z.number().int().min(0),
      to: z.number().int().min(0),
    },
    "app",
    async (input: { doc_id: string; from: number; to: number }) => {
      store.movePage(input.doc_id, input.from, input.to);
      return store.peek(input.doc_id, workspaceRoot);
    },
  );

  register(
    "stage_composite",
    "面板:提交某页的高分辨率合成位图(jpeg dataURL),导出含文字页时必须",
    {
      doc_id: z.string(),
      page_id: z.string(),
      data_url: z.string(),
    },
    "app",
    async (input: { doc_id: string; page_id: string; data_url: string }) => {
      store.stageComposite(input.doc_id, input.page_id, input.data_url);
      return { ok: true };
    },
  );

  // ---- 资源:面板 HTML、原始 PDF、替换图 ----

  server.registerResource("panel", PANEL_URI, { mimeType: HTML_MIME }, async () => ({
    contents: [{ uri: PANEL_URI, mimeType: HTML_MIME, text: panelHtml }],
  }));

  const registerDocResources = (docId: string) => {
    server.registerResource(
      `source:${docId}`,
      sourceResourceUri(docId),
      { mimeType: "application/pdf" },
      async () => ({
        contents: [
          {
            uri: sourceResourceUri(docId),
            mimeType: "application/pdf",
            blob: Buffer.from(store.sourceBytes(docId)).toString("base64"),
          },
        ],
      }),
    );
    const doc = store.peek(docId, workspaceRoot);
    for (const [pageId, rep] of Object.entries(doc.replacements)) {
      void pageId;
      const asset = store.assetBytes(docId, rep.assetId);
      if (!asset) continue;
      server.registerResource(
        `asset:${docId}:${rep.assetId}`,
        assetResourceUri(docId, rep.assetId),
        { mimeType: asset.mime },
        async () => ({
          contents: [
            {
              uri: assetResourceUri(docId, rep.assetId),
              mimeType: asset.mime,
              blob: Buffer.from(asset.bytes).toString("base64"),
            },
          ],
        }),
      );
    }
  };

  const originalLoad = store.load.bind(store);
  store.load = async (...args) => {
    const state = await originalLoad(...args);
    registerDocResources(state.docId);
    return state;
  };

  return server;
}

// resolveWorkspace 由 store 持有;此处仅保留路径语义提示
export const workspacePath = (root: string, rel: string) => resolve(join(root, rel));
