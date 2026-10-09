<div align="center">

  <img src="public/logo.svg" width="88" alt="PDF Editor logo" />

  # PDF Editor

  **Edit PDF pages right in your browser — replace any page with an image, add text,
  insert / reorder / delete pages, and compare before & after.**

  [![Live Demo](https://img.shields.io/website?url=https%3A%2F%2Fed4ward.github.io%2Fpdf-maker%2F&label=demo&color=brightgreen)](https://ed4ward.github.io/pdf-maker/)
  [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
  ![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript&logoColor=white)
  ![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)

  [**🌍 Live Demo**](https://ed4ward.github.io/pdf-maker/) · [简体中文](README.zh-CN.md) · [Report Issue](https://github.com/Ed4ward/pdf-maker/issues)

</div>

---

## ✨ Features

- 🖼 **Replace pages with images** — swap any page's content with a picture. Choose
  **contain** (fit with letterbox) or **cover** (fill & crop), fine-tune with zoom and
  drag-to-pan, all rendered exactly as exported.
- ✍️ **Add text to pages** — insert text boxes, double-click to edit, drag to position,
  adjust font size and color. Supports CJK text via high-resolution composition.
- 📄 **Page management** — insert A4 blank pages, drag thumbnails to reorder, delete pages
  (with confirmation). Replacement images and text boxes follow their page automatically.
- 🔍 **Before / after comparison** — verify edits in three modes: **side-by-side**,
  **slider wipe**, and **toggle**, rendered in-place in the preview area.
- ↩️ **Snapshot undo** — every edit (replacements, layout adjustments, text, page order)
  is one ⌘Z away.
- 🔒 **100% local** — parsing, editing and export all happen in your browser with
  [pdf.js](https://github.com/mozilla/pdf.js) + [pdf-lib](https://github.com/Hopding/pdf-lib).
  **No file ever leaves your machine.**
- 📱 **Responsive** — on small screens the toolbar scrolls horizontally and the
  thumbnail rail becomes a bottom strip, so editing works on phones and tablets.
- 🌐 **Bilingual UI** — English / 简体中文, one click in the toolbar; follows your
  browser language by default.
- 🤖 **Agent-friendly** — a complete machine-readable operation guide ships at
  [`public/llm.txt`](public/llm.txt), so AI agents can drive every feature via stable
  `data-action` selectors.

## 🚀 Getting Started

**Prerequisites:** Node.js ≥ 20

```bash
git clone https://github.com/Ed4ward/pdf-maker.git
cd pdf-maker
npm install
npm run dev        # start dev server → http://localhost:5173
```

| Command           | Description                                       |
| ----------------- | ------------------------------------------------- |
| `npm run dev`     | Start the dev server with HMR                     |
| `npm run build`   | Type-check + production build to `dist/`          |
| `npm run preview` | Preview the production build locally              |
| `npm run deploy`  | Build and publish to GitHub Pages (`gh-pages`)    |

## 📖 Usage

1. **Open** — drop a PDF anywhere, or click **Open PDF**.
2. **Pages** — insert blank pages with **+**, drag thumbnails to reorder, delete with the
   trash button (asks for confirmation).
3. **Replace** — select a page, hit **Replace with image** (or drop an image onto the
   preview), then fine-tune with contain / cover, zoom and panning.
4. **Text** — click **Add text**, double-click to edit, drag to move; pick size and color
   from the floating toolbar.
5. **Compare** — hit **Compare** to verify the change side-by-side, with a slider, or by
   toggling (shortcuts `1` / `2` / `3`, `Esc` to exit).
6. **Export** — click **Export PDF** to download the edited document.
   Replacements stay vector; pages containing text are composed at high resolution.

## 🧱 Tech Stack

| Layer    | Choice                                       |
| -------- | -------------------------------------------- |
| UI       | React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui |
| Build    | Vite 7                                       |
| PDF      | pdf.js (rendering) · pdf-lib (export)        |
| Toasts   | sonner                                       |

## 📁 Project Structure

```
src/
  App.tsx                # state (reducer + snapshot undo) & composition
  components/
    TopBar.tsx           # icon toolbar, grouped
    Workspace.tsx        # preview area: zoom, drag&drop, compare, adjustments
    ThumbPanel.tsx       # thumbnail rail: insert / reorder / delete
    CompareModal.tsx     # in-place compare (side / slider / toggle)
    ReplacedImage.tsx    # replacement-image layout renderer
    TextBoxLayer.tsx     # text-box layer (editable / read-only)
    ui/                  # shadcn/ui primitives
  lib/
    pdfSetup.ts render.ts exportPdf.ts image.ts
public/
  llm.txt                # agent operation guide
  logo.svg robots.txt sitemap.xml
```

## 🤖 Automation & Agents

`public/llm.txt` documents every feature with stable `[data-action]` selectors,
interaction semantics and assertion signals — point your browser agent at it and it can
operate the full product without reading the source.

## 🗺 Roadmap

- [ ] Batch page replacement
- [ ] Page rotation & custom page sizes
- [x] i18n (zh-CN / en UI)
- [ ] OCR-friendly flattened export options

## 🤝 Contributing

Issues and PRs are welcome! For big changes please open an issue first to discuss what
you'd like to change.

AI-assisted contributions: please read [`AGENTS.md`](AGENTS.md) first — it defines the
project's coding rules, architecture constraints and Conventional Commits policy.

## 📄 License

Distributed under the [MIT License](LICENSE). © 2026 Ed4ward
