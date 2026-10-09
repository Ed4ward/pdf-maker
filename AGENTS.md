# AGENTS.md

Guidance for AI coding agents (and human contributors using AI tools) working in this
repository. Read this before making changes; follow it strictly.

## What this project is

A **pure-frontend** browser-based PDF page editor (React 19 + TypeScript + Vite 7 +
Tailwind CSS v4 + shadcn/ui). Rendering via **pdf.js**, export via **pdf-lib**.
No backend, ever. User files must never leave the browser.

Start from: `README.md` (product), `README.zh-CN.md` (中文), `public/llm.txt`
(machine-readable feature/selector map).

## Commands

| Task            | Command                |
| --------------- | ---------------------- |
| Dev server      | `npm run dev`          |
| Verify + build  | `npm run build`        |
| Preview build   | `npm run preview`      |
| Deploy to Pages | `npm run deploy`       |

`npm run build` must pass (`tsc --noEmit` is strict: no unused vars, no implicit any).
**Run it before every commit.** There is no unit-test suite; if you change behavior,
smoke-test the affected flows in a real browser (see `public/llm.txt` for how to drive
every feature programmatically).

## Non-negotiables

1. **Pure frontend.** Do not add a backend, telemetry, analytics, ads, or any
   third-party runtime script/network call. PDF content stays in the browser.
2. **ID-based page model.** Pages are `PageEntry { id, srcIndex, w, h }`. Replacements
   and text boxes are keyed by `PageEntry.id`, **never** by positional index — insert and
   reorder must not break the association.
3. **All edits flow through the reducer** in `App.tsx` and are undoable via snapshots
   (`past`). Live/gesture-time updates pass `pushUndo: false`; the final commit of a
   gesture passes `pushUndo: true`. Never mutate state outside `dispatch`.
4. **Preview/export parity.** Layout math exists twice by design:
   `components/ReplacedImage.tsx` (CSS, preview) and `lib/exportPdf.ts#replacementRect`
   (export). If you change one, change the other and keep them semantically identical.
5. **Agent contract.** Every interactive control must carry a stable
   `data-action="<verb>"` (and useful `data-*` context attributes). Adding or renaming a
   control requires updating `public/llm.txt` in the same change.
6. **Bilingual docs.** User-facing feature changes update both `README.md` (en) and
   `README.zh-CN.md` (zh-CN). UI copy is Simplified Chinese by default.

## Code style

- Functional components + hooks only; no class components.
- TypeScript strict: no `any`, no non-null `!` shortcuts where a real check fits.
- Styling: Tailwind utility classes merged with `cn()` (`src/lib/utils.ts`); design
  tokens via shadcn/ui primitives in `src/components/ui/` — edit those primitives only
  when a needed behavior is genuinely missing, and keep them close to upstream.
- Keep components presentational where possible; state mutations belong in the reducer.
- Don't redesign branding assets (`public/logo.svg`, `BrandMark.tsx`) casually.

## Git conventions

- **Conventional Commits** are mandatory:
  `type(scope): subject` — types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`,
  `test`, `build`, `ci`, `chore`. Scope optional (e.g. `feat(compare): ...`).
  Subject: imperative, ≤ 72 chars, either English or Chinese, no trailing period.
  Body optional; explain *why*, not *what*.
- Commit with the repo-configured identity (`Ed4ward` + GitHub noreply email). Do not
  override `user.name` / `user.email`.
- Never force-push or rewrite history on `main`; history was deliberately squashed.
- `dist/` is generated and git-ignored; never commit it. `gh-pages` branch is deploy
  output only — publish via `npm run deploy`, never hand-edit.

## Deployment

`npm run deploy` builds with `DEPLOY_BASE=/pdf-maker/` and pushes `dist/` to the
`gh-pages` branch (GitHub Pages serves from it). Only run it when the user asks to
publish. Transient TLS errors to github.com are common — retry.

## When unsure

Prefer the smallest change that satisfies the request, keep `npm run build` green, and
list any deviations from this file in your final summary.
