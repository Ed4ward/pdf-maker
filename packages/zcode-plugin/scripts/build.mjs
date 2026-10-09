import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });

// ---- 页面:打包 TS + CSS,内联为单文件 editor.html ----
const ui = await build({
  metafile: true,
  entryPoints: [join(root, "ui/main.ts")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  minify: true,
  write: false,
  outdir: join(dist, "ui"),
  define: { "process.env.NODE_ENV": '"production"' },
});
const js = ui.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = ui.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
// 转义结束标签,避免提前闭合 <script>/<style>
const escape = (text, tag) => text.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
const template = await readFile(join(root, "ui/editor.html"), "utf8");
const html = template
  .replace("/*__EDITOR_CSS__*/", () => escape(css, "style"))
  .replace("/*__EDITOR_JS__*/", () => escape(js, "script"));

// ---- 安装产物:marketplace + 插件目录 ----
const pluginDist = join(dist, "marketplace/plugins/pdf-editor");
await mkdir(join(pluginDist, "dist/ui"), { recursive: true });
await writeFile(join(pluginDist, "dist/ui/editor.html"), html);

const server = await build({
  metafile: true,
  entryPoints: [join(root, "src/main.ts")],
  outfile: join(pluginDist, "dist/server.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  write: false,
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require=__createRequire(import.meta.url);',
  },
});
await writeFile(join(pluginDist, "dist/server.mjs"), server.outputFiles[0].text);

await cp(join(root, ".zcode-plugin"), join(pluginDist, ".zcode-plugin"), { recursive: true });

// 本地市场清单:ZCode CLI 可直接 marketplace add 该目录
const marketplace = {
  name: "pdf-maker-local",
  description: "PDF Editor (pdf-maker) local marketplace: edit workspace PDFs in the ZCode sidebar.",
  description_i18n: {
    en: "PDF Editor (pdf-maker) local marketplace: edit workspace PDFs in the ZCode sidebar.",
    "zh-CN": "PDF 编辑器(pdf-maker)本地市场:在 ZCode 侧栏编辑工作区 PDF。",
  },
  owner: { name: "Ed4ward", url: "https://github.com/Ed4ward/pdf-maker" },
  plugins: [
    {
      name: "pdf-editor",
      source: "./plugins/pdf-editor",
      displayName: "PDF Editor",
      description:
        "Edit workspace PDFs in the ZCode sidebar: replace pages with images, add text, reorder/delete pages, then export. 100% local.",
      description_i18n: {
        en: "Edit workspace PDFs in the ZCode sidebar: replace pages with images, add text, reorder/delete pages, then export. 100% local.",
        "zh-CN": "在 ZCode 侧栏编辑工作区 PDF:用图片替换页面、添加文字、增删/排序页面后导出。全部本地处理。",
      },
      version: "0.1.0",
      author: { name: "Ed4ward" },
      category: "productivity",
      keywords: ["pdf", "editor", "pages", "mcp-apps"],
    },
  ],
};
await writeFile(
  join(dist, "marketplace/marketplace.json"),
  JSON.stringify(marketplace, null, 2) + "\n",
);

await cp(join(root, ".zcode-plugin"), join(pluginDist, ".zcode-plugin"), { recursive: true });
await cp(join(root, "skills"), join(pluginDist, "skills"), { recursive: true });
await cp(join(root, "README.md"), join(pluginDist, "README.md"));

const kib = (n) => `${Math.round(n / 1024)} KiB`;
process.stdout.write(
  `pdf-editor panel: ${kib(Buffer.byteLength(html))}, server: ${kib(
    Buffer.byteLength(server.outputFiles[0].text),
  )}\nmarketplace: ${join(dist, "marketplace")}\n`,
);
