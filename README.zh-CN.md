<div align="center">

  <img src="public/logo.svg" width="88" alt="PDF Editor logo" />

  # PDF 编辑器

  **纯浏览器端的 PDF 页面编辑工具 —— 用图片替换任意页面、添加文字、增删与拖拽排序页面,并支持替换前后对比。**

  [![Live Demo](https://img.shields.io/website?url=https%3A%2F%2Fed4ward.github.io%2Fpdf-maker%2F&label=demo&color=brightgreen)](https://ed4ward.github.io/pdf-maker/)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  ![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)

  [**🌍 在线体验**](https://ed4ward.github.io/pdf-maker/) · [English](README.md) · [反馈问题](https://github.com/Ed4ward/pdf-maker/issues)

</div>

---

## ✨ 功能特性

- 🖼 **用图片替换页面** —— 将任意页内容替换为图片,支持**适应(contain)/ 铺满(cover)**两种模式,配合缩放与拖动微调,所见即所得。
- ✍️ **添加文字** —— 在页面上插入文本框,双击编辑、拖动定位,可调字号与颜色;中文等任意文字通过高分辨率合成完整导出。
- 📄 **页面管理** —— 新建 A4 空白页、拖拽缩略图排序、删除页面(带二次确认);替换图与文字框自动跟随页面移动。
- 🔍 **替换前后对比** —— 在预览区原地提供**左右并排 / 滑动对比 / 切换查看**三种核对方式。
- ↩️ **快照撤销** —— 图片替换、排版调整、文字编辑、页面排序删除,全部 ⌘Z 一步回退。
- 🔒 **完全本地处理** —— 解析、编辑、导出全部在浏览器内完成(基于 pdf.js 与 pdf-lib),**文件不会上传到任何服务器**。
- 🤖 **Agent 友好** —— 随仓库提供机器可读操作手册 [`public/llm.txt`](public/llm.txt),AI Agent 可通过稳定的 `data-action` 选择器直接操作全部功能。

## 🚀 快速开始

**环境要求:** Node.js ≥ 20

```bash
git clone https://github.com/Ed4ward/pdf-maker.git
cd pdf-maker
npm install
npm run dev        # 启动开发服务器 → http://localhost:5173
```

| 命令              | 说明                                    |
| ----------------- | --------------------------------------- |
| `npm run dev`     | 启动开发服务器(支持热更新)             |
| `npm run build`   | 类型检查 + 生产构建到 `dist/`           |
| `npm run preview` | 本地预览生产构建                        |
| `npm run deploy`  | 构建并发布到 GitHub Pages(`gh-pages`)  |

## 📖 使用流程

1. **打开**:把 PDF 拖进窗口,或点「打开 PDF」。
2. **页面管理**:点「+」新建空白页;拖拽缩略图排序;垃圾桶按钮删除当前页(二次确认)。
3. **替换图片**:选中页面,点「用图片替换此页」(或把图片拖到预览区),再用适应/铺满、缩放、拖动微调。
4. **添加文字**:点「添加文字」插入文本框,双击编辑、拖动定位,顶部工具条调字号与颜色。
5. **对比**:点「替换对比」原地核对修改,支持并排 / 滑动 / 切换三种模式(快捷键 1/2/3,Esc 退出)。
6. **导出**:点「导出 PDF」下载编辑后的文档。纯图片替换的页保持矢量;含文字的页以高分辨率合成。

## 🧱 技术栈

| 层级   | 选型                                          |
| ------ | --------------------------------------------- |
| UI     | React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| 构建   | Vite 7                                        |
| PDF    | pdf.js(渲染)· pdf-lib(导出)             |
| 通知   | sonner                                        |

## 📁 项目结构

```
src/
  App.tsx                # 状态(reducer + 快照撤销)与主编排
  components/
    TopBar.tsx           # 图标工具栏(分组)
    Workspace.tsx        # 预览区:缩放、拖拽、原地对比、排版调整
    ThumbPanel.tsx       # 缩略图面板:新建 / 拖拽排序 / 删除
    CompareModal.tsx     # 原地对比(并排 / 滑动 / 切换)
    ReplacedImage.tsx    # 替换图排版渲染
    TextBoxLayer.tsx     # 文字框图层(可编辑 / 只读)
    ui/                  # shadcn/ui 基础组件
  lib/
    pdfSetup.ts render.ts exportPdf.ts image.ts
public/
  llm.txt                # Agent 操作手册
  logo.svg robots.txt sitemap.xml
```

## 🤖 自动化与 Agent

`public/llm.txt` 以稳定的选择器(`[data-action]`)、交互语义与验证信号描述了全部功能,
将你的浏览器 Agent 指向它,即可在不阅读源码的情况下操作完整产品。

## 🗺 路线图

- [ ] 批量页面替换
- [ ] 页面旋转与自定义页面尺寸
- [ ] 界面多语言(中 / 英)
- [ ] 更多导出选项(扁平化等)

## 🤝 参与贡献

欢迎提 Issue 与 PR!较大改动请先开 Issue 讨论后再动手。

使用 AI 辅助贡献:请先阅读 [`AGENTS.md`](AGENTS.md) —— 其中定义了本项目的编码规范、
架构约束与 Conventional Commits 提交政策。

## 📄 开源协议

基于 [MIT License](LICENSE) 开源。© 2026 Ed4ward
