// 冒烟:启动 stdio 服务,走一遍 MCP 握手 + load_pdf → add_text → export_pdf
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspace = await mkdtemp(join(tmpdir(), "pdf-editor-smoke-"));

// 生成 3 页测试 PDF
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 0; i < 3; i++) {
  const page = pdf.addPage([595, 842]);
  page.drawText(`Smoke test page ${i + 1}`, { x: 60, y: 760, size: 24, font, color: rgb(0.1, 0.1, 0.2) });
}
await writeFile(join(workspace, "sample.pdf"), await pdf.save());

// PNG 1x1 蓝色
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
await writeFile(join(workspace, "replacement.png"), png);

const server = spawn("node", [join(root, "dist/marketplace/plugins/pdf-editor/dist/server.mjs")], {
  env: { ...process.env, ZCODE_PROJECT_DIR: workspace, ZCODE_PLUGIN_DATA: join(workspace, ".data") },
  stdio: ["pipe", "pipe", "pipe"],
});
let stderr = "";
server.stderr.on("data", (d) => (stderr += d));

let nextId = 1;
const pending = new Map();
const send = (method, params) =>
  new Promise((res, rej) => {
    const id = nextId++;
    pending.set(id, { res, rej });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
const notify = (method, params) =>
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");

server.stdout.on("data", (chunk) => {
  for (const line of chunk.toString().split("\n")) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id).res(msg.result ?? msg.error);
        pending.delete(msg.id);
      }
    } catch { /* 忽略非 JSON 行 */ }
  }
});

const fail = (why) => {
  console.error("SMOKE FAIL:", why);
  if (stderr) console.error(stderr.slice(0, 2000));
  server.kill();
  process.exit(1);
};


async function main() {
  const timeout = setTimeout(() => fail("timeout"), 30000);

  const init = await send("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "0.0.0" },
  });
  if (!init?.serverInfo?.name) return fail("initialize 无响应");
  await notify("notifications/initialized", {});

  const tools = await send("tools/list", {});
  const names = tools.tools.map((t) => t.name);
  for (const expected of ["load_pdf", "replace_page_with_image", "add_text", "export_pdf"]) {
    if (!names.includes(expected)) return fail(`缺少工具 ${expected}`);
  }

  const call = (name, args) => send("tools/call", { name, arguments: args }).then((r) => {
    if (r.isError) throw new Error(`[${name}] ${r.content?.[0]?.text ?? "tool error"}`);
    return r.structuredContent;
  });

  const doc = await call("load_pdf", { path: "sample.pdf" });
  if (doc.pageCount !== 3) return fail(`页数错误:${doc.pageCount}`);

  await call("replace_page_with_image", { doc_id: doc.docId, page_index: 1, image_path: "replacement.png" });
  await call("add_text", { doc_id: doc.docId, page_index: 0, text: "Hello PDF 编辑器" });

  // 含文字的页导出需要面板合成:直接导出应报 composite_required
  const guard = await call("export_pdf", { doc_id: doc.docId, path: "out-guard.pdf" }).catch((e) => e);
  if (!String(guard).includes("composite_required")) return fail("应要求 composite_required");

  // 模拟面板合成后导出
  const state = await call("get_document", { doc_id: doc.docId });
  const textPage = state.pages.find((p) => state.textBoxes.some((t) => t.pageId === p.id));
  // 文字页合成由页面浏览器完成,这里用纯白 JPEG 顶替验证链路
  const whiteJpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDs0NDT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  );
  await writeFile(join(workspace, ".placeholder.jpg"), whiteJpeg);
  await call("stage_composite", {
    doc_id: doc.docId,
    page_id: textPage.id,
    data_url: `data:image/jpeg;base64,${whiteJpeg.toString("base64")}`,
  });
  const exported = await call("export_pdf", { doc_id: doc.docId, path: "out/exported.pdf", overwrite: false });
  const info = await stat(join(workspace, "out", "exported.pdf"));
  if (info.size < 1000) return fail("导出文件过小");
  if (!exported.path) return fail("导出返回缺 path");

  clearTimeout(timeout);
  server.kill();
  console.log(`SMOKE OK: ${names.length} 个工具,导出 ${info.size} 字节 → ${exported.path}`);

}

await main();
