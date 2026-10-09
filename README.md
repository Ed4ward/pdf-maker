<div align="center">

  <img src="public/logo.svg" width="88" alt="PDFPress logo" />

  # PDFPress

  **Read and craft PDFs right in your browser — replace any page with an image, add
  text, rotate & resize, insert / reorder / delete pages, and compare before & after.**

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
- 🔄 **Rotate & resize pages** — rotate any page ±90° and set custom page sizes
  (A4 / A3 / A5 / Letter / Legal / square, or any pt value) for one page or the whole
  document. Original content is contain-fitted automatically; replacements and text
  follow the new geometry. Rotation-only and resize-only pages stay vector in the export.
- 📑 **Single / two-page view** — preview one page at a time or the current two-page
  spread side by side; toggle in the toolbar. Turn pages with ←/→, PageUp/PageDown
  (a full spread in two-page view), Home/End, or the status-bar buttons.
- 🌙 **Zen mode** — one click hides the toolbar, thumbnails and status bar for a
  distraction-free preview; page-turning and zoom keep working, and `Esc` (or the
  corner button) brings the UI back.
- 🔍 **Before / after comparison** — verify edits in three modes: **side-by-side**,
  **slider wipe**, and **toggle**, rendered in-place in the preview area.
- ↩️ **Snapshot undo** — every edit (replacements, layout adjustments, text, page order)
  is one ⌘Z away.
- 💾 **Auto-saved session** — the document and every edit live in IndexedDB on your
  device; refresh the page or come back later and pick up right where you left off.
- 🔒 **100% local** — parsing, editing and export all happen in your browser with
  [pdf.js](https://github.com/mozilla/pdf.js) + [pdf-lib](https://github.com/Hopding/pdf-lib).
  **No file ever leaves your machine.**
- 📱 **Responsive** — on small screens the toolbar scrolls horizontally and the
  thumbnail rail becomes a bottom strip, so editing works on phones and tablets.
- 🌐 **Bilingual UI** — English / 简体中文, one click in the toolbar; follows your
  browser language by default.
- 🧰 **Contextual page action bar** — every operation lives in one bar right under the
  page: undo, replace with image, add text, rotate, page size, insert / delete page,
  zoom, and on the right the view slider (single / two-page / Zen — entering Zen also requests
  browser fullscreen), open and export —
  never floating over your content, wrapping gracefully on mobile. With a replacement
  image on the page, fit / scale / reset / revert / compare join in; select a text box
  and font & color controls take their place.
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
   trash button (asks for confirmation). Rotate a page with the rotate buttons, or set a
   custom page size (presets or any pt value, single page or all pages) from the
   page-size popover.
3. **Replace** — select a page, hit **Replace with image** (or drop an image onto the
   preview), then fine-tune with contain / cover, zoom and panning. Toggle **single /
   two-page view** in the toolbar to see a spread; in two-page view a drop replaces the
   card it lands on. Toggle **Zen mode** when you want the preview alone (Esc to exit).
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

## 🧩 ZCode Plugin

A companion **ZCode UI Plugin** ships in [`packages/zcode-plugin/`](packages/zcode-plugin/): the same editing
model (image replacement, text, page management) runs inside the ZCode Desktop sidebar —
the agent drives it through MCP tools while you preview, tweak and compare in a visual
panel, then export back into the workspace. See
[`packages/zcode-plugin/README.md`](packages/zcode-plugin/README.md) for install and integration steps.

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
