import { App } from "@modelcontextprotocol/ext-apps";
import type { DocState } from "../src/contract.ts";
import { DocError } from "../src/contract.ts";

const app = new App({ name: "pdf-editor", version: "0.1.0" }, {}, { autoResize: false });

let connection: Promise<void> | undefined;
export type BridgeStatus = "connecting" | "connected" | "failed";
let status: BridgeStatus = "connecting";
const statusListeners = new Set<(s: BridgeStatus) => void>();
export function onBridgeStatus(listener: (s: BridgeStatus) => void) {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
}
function setStatus(s: BridgeStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}

/** 连接宿主;8 秒未完成视为宿主不支持面板桥接 */
export const ready = () =>
  (connection ??= Promise.race([
    app.connect().then(() => {
      setStatus("connected");
    }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new DocError("bridge_timeout", "连接宿主超时(8s)")), 8000),
    ),
  ])).catch((e) => {
    setStatus("failed");
    throw e;
  });

function withTimeout<T>(p: Promise<T>, ms = 30000, what = "工具调用"): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new DocError(
              "bridge_timeout",
              `${what}超时(${Math.round(ms / 1000)}s)——若反复出现,说明当前 ZCode 版本不支持插件面板,请在对话中直接让 Agent 操作`,
            ),
          ),
        ms,
      ),
    ),
  ]);
}

export function onDocState(listener: (state: DocState) => void) {
  // 工具结果统一携带完整文档状态;保留最新结果供挂载后消费
  app.ontoolresult = (result) => {
    const sc = result.structuredContent as Record<string, unknown> | undefined;
    if (sc && typeof sc.docId === "string" && Array.isArray(sc.pages)) {
      listener(sc as unknown as DocState);
    }
  };
  void ready();
}

export function onTheme(listener: () => void) {
  app.onhostcontextchanged = () => listener();
  void ready().then(listener);
}

async function call<T = Record<string, unknown>>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  await withTimeout(ready(), 8000, "连接宿主");
  const result = await withTimeout(
    app.callServerTool({ name, arguments: args }),
    30000,
    `调用 ${name}`,
  );
  const content = result.structuredContent as Record<string, unknown> | undefined;
  const error = content?.error as { code?: string; message?: string } | undefined;
  if (result.isError || error) {
    const text = (result.content?.[0] as { text?: string } | undefined)?.text;
    throw new DocError(
      (error?.code ?? "invalid_input") as string,
      error?.message ?? text ?? "Tool failed",
    );
  }
  return content as T;
}

/** 面板可用的全部服务端工具(与 Agent 共享同一份文档状态) */
export const api = {
  load: (path: string) => call<DocState>("load_pdf", { path }),
  getLastDocument: () => call<DocState | { empty: boolean }>("get_last_document"),
  replace: (docId: string, pageIndex: number, imagePath: string) =>
    call<DocState>("replace_page_with_image", {
      doc_id: docId,
      page_index: pageIndex,
      image_path: imagePath,
    }),
  clearRep: (docId: string, pageIndex: number) =>
    call<DocState>("clear_page_replacement", { doc_id: docId, page_index: pageIndex }),
  setLayout: (docId: string, pageIndex: number, patch: Record<string, unknown>) =>
    call<DocState>("set_replacement_layout", { doc_id: docId, page_index: pageIndex, ...patch }),
  addText: (
    docId: string,
    pageIndex: number,
    text: string,
    opts: { x?: number; y?: number; size?: number; color?: string } = {},
  ) => call<DocState>("add_text", { doc_id: docId, page_index: pageIndex, text, ...opts }),
  updateText: (docId: string, textId: string, patch: Record<string, unknown>) =>
    call<DocState>("update_text", { doc_id: docId, text_id: textId, ...patch }),
  removeText: (docId: string, textId: string) =>
    call<DocState>("remove_text", { doc_id: docId, text_id: textId }),
  addBlank: (docId: string, afterIndex: number) =>
    call<DocState>("add_blank_page", { doc_id: docId, after_index: afterIndex }),
  deletePage: (docId: string, pageIndex: number) =>
    call<DocState>("delete_page", { doc_id: docId, page_index: pageIndex }),
  movePage: (docId: string, from: number, to: number) =>
    call<DocState>("move_page", { doc_id: docId, from, to }),
  stage: (docId: string, pageId: string, dataUrl: string) =>
    call<{ ok: boolean }>("stage_composite", { doc_id: docId, page_id: pageId, data_url: dataUrl }),
  exportPdf: (docId: string, path: string, overwrite: boolean) =>
    call<DocState & { path: string; bytes: number }>("export_pdf", {
      doc_id: docId,
      path,
      overwrite,
    }),
};

export async function readResourceBase64(uri: string): Promise<{ bytes: ArrayBuffer; mime: string }> {
  await withTimeout(ready(), 8000, "连接宿主");
  const result = await withTimeout(app.readServerResource({ uri }), 30000, `读取 ${uri}`);
  const c = result.contents[0] as { mimeType?: string; blob?: string };
  if (!c?.blob) throw new DocError("not_found", `资源为空:${uri}`);
  const bin = atob(c.blob);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes: bytes.buffer, mime: c.mimeType ?? "application/octet-stream" };
}
