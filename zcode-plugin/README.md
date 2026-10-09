# PDF Editor(ZCode UI Plugin)

在 **ZCode 桌面端侧栏**直接编辑工作区里的 PDF:Agent 通过 MCP 工具驱动,用户在可视化面板中预览、微调与对比,确认后导出新 PDF。全部处理在本地完成,文件不上传。

源自开源项目 [pdf-maker](https://github.com/Ed4ward/pdf-maker)(浏览器端 PDF 页面编辑器)的同源编辑模型:图片替换(适应/铺满/缩放/偏移)、文字框、页面新建/删除/排序。

## 功能

- **Agent 工具**(模型可直接调用):`load_pdf`、`replace_page_with_image`、`add_text`、`export_pdf`、`get_document`、`get_last_document`
- **面板工具**(侧栏页面调用):`set_replacement_layout`、`clear_page_replacement`、`update_text` / `remove_text`、`add_blank_page` / `delete_page` / `move_page`、`stage_composite`
- **侧栏面板**:pdf.js 高清预览、缩略图条、替换图适应/铺满与缩放、文字框点选拖动、滑动对比、一键导出(含文字的页面自动合成高分辨率位图,支持中文)

## 演示指令

安装并启用后,在桌面端本地工作区会话中:

1. "打开 docs/report.pdf,把第 2 页替换成 images/new-cover.png"
2. "在第 1 页加上标题'2026 Q4 复盘',大一点,深蓝色"
3. "把最后一页移到最前面,另存为 docs/report-final.pdf"

## 使用限制

- 原始 PDF 资源读取上限 8 MiB(页面预览通道);超大文档请拆分后编辑
- 图片支持 PNG / JPG(WebP 请先转换);含文字的页导出时栅格化为高分辨率位图
- 编辑状态保存在插件服务进程内存中;进程重启后需重新 `load_pdf`
- 拖拽排序在面板中通过前后移按钮完成

## 开发

```bash
npm install
npm run typecheck   # tsc 严格检查
npm run build       # 产出 dist/marketplace/(可直接被 ZCode CLI 添加为本地来源)
npm run smoke       # stdio 冒烟:握手 + 工具清单 + 打开/替换/加文字/导出全链路
```

### 安装到 ZCode

```sh
ZCODE=/path/to/zcode-repo
# 用主仓库 CLI(或已安装的 zcode 命令),指向本插件构建出的本地市场:
node $ZCODE/apps/zcode-cli/packages/cli/dist/zcode.cjs plugins marketplace add \
  /abs/path/to/pdf-maker/zcode-plugin/dist/marketplace --scope user
node $ZCODE/apps/zcode-cli/packages/cli/dist/zcode.cjs plugins install pdf-editor@pdf-maker-local --scope user
node $ZCODE/apps/zcode-cli/packages/cli/dist/zcode.cjs plugins enable pdf-editor@pdf-maker-local --scope user
```

也可以在桌面端 **插件市场 → 新增** 中添加同一 `dist/marketplace` 绝对路径。

### 接入 zcode-plugins 官方仓库

把 `zcode-plugin/`(不含 `dist`、`node_modules`)复制到官方仓库 `ui-plugins/pdf-editor`,
在根 `marketplace.json` 增加 `plugins` 条目(`source: "./plugins/pdf-editor"`,构建由
`build_dist.py` / `pnpm marketplace:local` 统一处理),PR 中声明类型为 **UI Plugin**。

## 许可

MIT © 2026 Ed4ward
