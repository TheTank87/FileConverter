# The Diat Converter — Project Context

> Living reference for anyone (human or AI) working on this repo.
> Update this file when decisions, conventions, or structure change.

---

## 1. What this project is

A **local, offline file converter** desktop app. It does what online converters
(Convertio, CloudConvert, etc.) do — change a file from one format to another — but entirely on
the user's machine. Nothing is uploaded. The flagship example is **HEIC → PNG**.

- **Target OS:** Windows 10/11 and macOS (Intel + Apple Silicon).
- **v1 scope:** image formats only.
- **UI:** minimalistic, modeled on online converters, with intentional empty regions reserved
  for future widgets and decorations.

See [`architecture.md`](./architecture.md) for the full technical design.

**Current status:** Phase 2 (shared contracts) complete — `shared/types.ts` defines the domain,
engine, queue, error, and IPC-channel contract with no platform imports, and all three processes
resolve `@shared/types`. The build sequence lives in [`todos.md`](./todos.md); work top to bottom
and check items off as they land. Next up: Phase 3 (main process foundation).

**Test fixtures:** `samples/` (git-ignored) holds HEIC, AVIF, transparent PNG, JPG, static +
animated WebP, 20-frame GIF, TIFF, BMP, a corrupt JPG, and an 8000×6250 (50 MP) JPG. They were
generated locally with `sips` + `ffmpeg`; the WebP files are from the public Google WebP gallery.
Never commit them — they exist only to drive manual and engine tests.

---

## 2. Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-12 | **Electron + React + Vite + TypeScript** | Node available, one codebase for Win+Mac, best fit for a web-style minimal UI, huge ecosystem. |
| 2026-11-12 | **`sharp` (libvips) as primary engine, bundled ImageMagick CLI as fallback** | libvips prebuilts already include libheif (HEIC) and AVIF; fast in-process path. ImageMagick guarantees coverage for edge formats. |
| 2026-11-12 | **Images only for v1** | Focused, polished first release; pipeline designed for audio/video later. |
| 2026-11-12 | **Output defaults to source folder, with "choose folder" option** | Matches the local-first workflow; least surprising default. |
| 2026-11-12 | **`electron-vite`** for build tooling | Simple main/preload/renderer bundling with HMR and TS-first DX. |
| 2026-11-12 | **Zustand** for renderer state | Minimal boilerplate; easy to grow into widget state later. |
| 2026-11-12 | **CSS variables for theming**, no CSS framework | Zero runtime cost; light/dark tokens; room for decorations. |
| 2026-11-12 | **FFmpeg deferred** | Not needed for images; the engine registry is where it will plug in. |
| 2026-11-13 | **Atomic output writes** (temp file + rename) | A crash/cancel can never leave a half-written file that looks valid. |
| 2026-11-13 | **Errors cross IPC as `{ code, message, detail }` data**, not thrown `Error` | Class identity is lost across the boundary; UI can switch on a stable code. |
| 2026-11-13 | **Settings at `userData/settings.json`**, validated + atomic | User-readable, trivially migratable, no native store dependency. |
| 2026-11-13 | **No output ever overwrites the source** (same-path forces a suffix) | Data safety beats convenience; matches the local-first promise. |
| 2026-11-13 | **Product name `The Diat Converter`, appId `com.diat.converter`** | Fixed string used in window title, installers, and `electron-builder.yml`. |
| 2026-11-13 | **ESM main process, CJS preload** (`out/preload/index.cjs`) | `"type": "module"` suits electron-vite 6; a sandboxed renderer requires a CommonJS preload. |

---

## 3. Conventions

- **Language:** TypeScript everywhere. `strict` mode on. No `any` unless justified with a comment.
- **Imports:** use the `@shared`, `@renderer` path aliases (configured in `electron.vite.config.ts`
  and tsconfigs).
- **Shared types:** anything crossing the IPC boundary lives in `shared/types.ts` and is imported by
  all three processes. Never duplicate a type.
- **IPC channels:** namespaced `domain:action` (e.g. `convert:start`, `settings:get`). Register
  handlers in `src/main/ipc.ts` only.
- **Renderer:** presentational components in `src/renderer/src/components/`. No direct Node/fs
  access — always go through `window.api`.
- **Main process:** filesystem and child-process work lives here. Use `execFile` (never `exec`)
  for spawning binaries.
- **Format support** is declared **only** in `src/main/conversion/formats.ts`. The UI reads it via
  IPC — never hardcode format lists in the renderer.
- **Comments:** explain *why*, not *what*. Keep them sparse.
- **No secrets** in the repo. No telemetry.

---

## 4. How to run

```bash
npm install          # also fetches bundled binaries via postinstall
npm run dev          # launch the app with HMR
npm run typecheck    # tsc --noEmit across all tsconfigs
npm run lint         # eslint + prettier check
npm test             # vitest unit tests
npm run build        # bundle main/preload/renderer to ./out
```

> Verification order used by CI and by every phase in `todos.md`:
> `npm run typecheck && npm run lint && npm test && npm run build`.

### Packaging
```bash
npm run build:mac    # → dist/*.dmg (universal)
npm run build:win    # → dist/*.exe (NSIS installer + portable)
```

> Windows installers are best produced on a Windows machine/runner (see CI matrix in
> `architecture.md`). Building on macOS may require Wine for some NSIS steps.

---

## 5. Glossary

| Term | Meaning |
|------|---------|
| **Engine** | A strategy that performs a conversion (`sharp` or `magick`). Implements `ConversionEngine`. |
| **Job** | One input file + one target format within a batch. |
| **Batch** | A set of jobs started together; has a `batchId`. |
| **Format matrix** | The declarative list of supported formats in `formats.ts`. |
| **DropZone** | The hero UI region that accepts drag & drop and click-to-browse. |
| **asarUnpack** | electron-builder option that keeps bundled binaries outside the asar archive so they stay executable. |

---

## 6. Gotchas / notes to future self

- **Dropped files:** In modern Electron, `File.path` is removed. Resolve OS paths in the preload
  with `webUtils.getPathForFile(file)` (exposed as `window.api.getPathForFile`).
- **Bundled binaries + asar:** any executable must be in `asarUnpack`; resolve paths relative to
  `process.resourcesPath` at runtime, not `__dirname` inside the asar.
- **sharp in Electron:** `sharp` is a native module. Run `electron-builder install-app-deps` (wired
  into `postinstall`) so it matches Electron's ABI. Prebuilt binaries mean no compiler needed.
- **libheif licensing:** libvips/sharp bundle libheif (LGPL). We link dynamically via the prebuilt
  sharp package; keep third-party license notices when distributing.
- **HEIC decode is CPU-heavy** for large images — hence the concurrency limit in the queue.
- **Animated formats:** GIF/WEBP animation requires `sharp(..., { animated: true })`; static
  conversion otherwise collapses to the first frame.
- **BMP is not in prebuilt sharp:** libvips has no BMP codec in the prebuilt package, so BMP
  conversions must resolve to `magickEngine`. Do not advertise BMP as sharp-capable.
- **`FileInfo.format` can be `null`:** unknown extensions must fail per-row, not throw out of
  `statFiles`.
- **Electron binary must be fetched once:** Electron 45 has no postinstall downloader. If dev
  fails with `Electron uninstall`, run `node node_modules/electron/install.js`.
- **Keep a global `BrowserWindow` reference:** without one, V8 may collect the window and the app
  quits unexpectedly a few seconds after launch.

---

## 7. Where to look first

| I want to… | Look at |
|------------|---------|
| Understand the design | `architecture.md` |
| Build the app / see what's next | `todos.md` |
| Add a supported format | `src/main/conversion/formats.ts` (+ engine `canConvert`) |
| Change the conversion pipeline | `src/main/conversion/queue.ts`, `engine.ts` |
| Change the IPC surface | `shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts` |
| Change the UI | `src/renderer/src/App.tsx` and `components/` |
| Change theming | `src/renderer/src/styles/tokens.css` |
| Adjust packaging | `electron-builder.yml` |
| Add/refresh bundled CLIs | `scripts/fetch-binaries.mjs` |
| Test a conversion by hand | `samples/` (git-ignored local fixtures) |

---

## 8. Environment

| Tool | Version used | Notes |
|------|--------------|-------|
| Node | 24.14.0 (LTS) ✅ | Electron's bundled Node is what runs at runtime; this is build-time only. |
| npm | 11.9.0 ✅ | Lockfile committed; use `npm ci` in CI. |
| OS | macOS 12+ / Windows 10 21H2+ | Current dev machine is Windows (win32). Windows ARM64 out of scope for v1. |
| Fixtures | `sips` + `ffmpeg` (dev only) | Not app dependencies; used once to generate `samples/`. |

> `postinstall` runs `electron-builder install-app-deps` (sharp ABI match) and
> `scripts/fetch-binaries.mjs` (ImageMagick). If either is skipped, conversion will fail with
> `ENGINE_MISSING` — that is a setup error, not an app bug.

---

## 9. Definition of done for v1

The app is v1-complete when **all** of these are true:

- [ ] `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` pass on macOS and
      Windows CI.
- [ ] A HEIC file dropped from Finder/Explorer converts to PNG and opens correctly.
- [ ] Click-to-browse and drag & drop both populate the list.
- [ ] Batch of 50 mixed images completes; one corrupt file fails without aborting the rest.
- [ ] Output collisions produce `-1`, `-2`, …; the source is never overwritten.
- [ ] Cancel leaves no partial/temp files and the app still accepts a new batch.
- [ ] Theme (system/light/dark) and last output folder survive a restart.
- [ ] Packaged `.dmg` and `.exe` install, launch, and convert on clean machines.
- [ ] `architecture.md` §10.1 QA matrix passes on both OSes.

---

## 10. Working agreements

- Pick the top unchecked item in `todos.md`; don't start later-phase work that depends on it.
- One phase per PR where practical; include the command used to verify it.
- When a doc and the code disagree, the code wins — then fix the doc in the same commit.
- New dependencies need a one-line note in `context.md` §2 (decision + rationale).
