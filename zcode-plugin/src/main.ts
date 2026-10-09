import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DocStore } from "./document.ts";
import { createPdfEditorServer } from "./server.ts";

const workspaceRoot = process.env.ZCODE_PROJECT_DIR
  ? join(process.env.ZCODE_PROJECT_DIR)
  : process.cwd();

const store = new DocStore();

// 面板 HTML 与安装产物同目录(dist/ui/editor.html)
const panelHtml = await readFile(
  join(dirname(fileURLToPath(import.meta.url)), "ui/editor.html"),
  "utf8",
);

const server = createPdfEditorServer({ store, workspaceRoot, panelHtml });

let stopping = false;
async function close() {
  if (stopping) return;
  stopping = true;
  await server.close();
}
process.once("SIGTERM", () => void close());
process.once("SIGINT", () => void close());
process.stdin.once("end", () => void close());

await server.connect(new StdioServerTransport());
