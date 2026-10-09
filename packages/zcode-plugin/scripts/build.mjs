import { build as esbuild } from "esbuild";
import { createRequire } from "node:module";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require2 = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = resolve(root, "../..");
const webSrc = resolve(webRoot, "src");
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });

// ---- 页面:Vite 构建(与 Web 端同工具链:React 19 + Tailwind v4)----
// 工具类样式直接复用 Web 构建产物 CSS(面板组件是 Web 组件子集,类必命中)
const webAssetsDir = join(webRoot, "dist", "assets");
const findWebCss = async () =>
  (await import("node:fs")).readdirSync(webAssetsDir).find((f) => f.startsWith("index-") && f.endsWith(".css"));
const rootRequire = createRequire(join(webRoot, "package.json"));
let webCssName = await findWebCss().catch(() => undefined);
if (!webCssName) {
  // Web 端尚未构建:先构建一次
  execFileSync(process.execPath, [vitePath, "build"], { cwd: webRoot, stdio: "inherit" });
  webCssName = await findWebCss();
}
const vitePath = rootRequire.resolve("vite");
const reactPluginPath = rootRequire.resolve("@vitejs/plugin-react");
const tailwindPluginPath = rootRequire.resolve("@tailwindcss/vite");
const vite = await import(pathToFileURL(vitePath).href);
const reactPlugin = await import(pathToFileURL(reactPluginPath).href);
const tailwindPlugin = await import(pathToFileURL(tailwindPluginPath).href);

await vite.build({
  root,
  base: "./",
  logLevel: "warn",
  plugins: [reactPlugin.default(), tailwindPlugin.default()],
  resolve: {
    alias: { "@": webSrc },
    dedupe: ["react", "react-dom"],
  },
  build: {
    outDir: join(dist, "page"),
    emptyOutDir: true,
    copyPublicDir: false,
    rollupOptions: { input: join(root, "ui/editor.html") },
  },
});

// 内联 JS/CSS 为单文件面板(MCP Apps 资源要求单 HTML)
const pageDir = join(dist, "page", "ui");
const escape = (text, tag) => text.replace(new RegExp(`</${tag}`, "gi"), `<\\/${tag}`);
const pageHtml = await readFile(join(pageDir, "editor.html"), "utf8");
const jsMatch = pageHtml.match(/<script type="module"[^>]*src="([^"]+)"/);
if (!jsMatch) throw new Error("vite 产物缺少 js 引用");
const js = await readFile(resolve(pageDir, jsMatch[1]), "utf8");
// 工具类来自 Web 构建产物 CSS(面板组件是 Web 组件子集),加上插件自定义类
const webCss = await readFile(join(webAssetsDir, webCssName), "utf8");
const customCss = await readFile(join(root, "ui/app.css"), "utf8");
const css = webCss + "\n" + customCss;
const cssTag = `<style>${escape(css, "style")}</style>`;
let html = pageHtml.replace(
  /<script type="module"[^>]*><\/script>/,
  () => `<script type="module">${escape(js, "script")}</script>`,
);
html = html.replace("</head>", () => cssTag + "</head>");
html = html.replace(/<script type="module"[^>]*><\/script>/g, "");

// ---- 安装产物:marketplace + 插件目录 ----
const pluginDist = join(dist, "marketplace/plugins/pdf-editor");
await mkdir(join(pluginDist, "dist/ui"), { recursive: true });
await writeFile(join(pluginDist, "dist/ui/editor.html"), html);

const server = await esbuild({
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
