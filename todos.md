# The Diat Converter — Build Plan

> Executable checklist for v1. Work **top to bottom**: each phase depends on the one above it.
> Check an item only when the phase's verification command passes.
> Design reference: [`architecture.md`](./architecture.md). Project summary:
> [`context.md`](./context.md).

**Phase verification:** `npm run typecheck && npm run lint && npm test && npm run build`
(skip commands for tools that do not exist yet in early phases).

---

## Phase 0 — Prep ✅

- [x] Confirm sample inputs to test with: HEIC (iPhone), PNG w/ transparency, JPG, WEBP,
      animated GIF, TIFF, AVIF, BMP, one corrupt file, one 50 MP image.
- [x] Keep samples outside the repo (or in `samples/`, git-ignored).
- [x] Confirm Node 24.x / npm 11.x (`node -v`, `npm -v`).
- [x] Decide the product name string used in window title, `appId`, and installers
      (`The Diat Converter` / `com.diat.converter`).

**Samples in `samples/` (git-ignored):** `iphone.heic`, `transparent.png`, `photo.jpg`,
`sample.webp`, `animated.webp`, `anim.gif` (20 frames), `scan.tiff`, `modern.avif`,
`legacy.bmp`, `corrupt.jpg`, `large-50mp.jpg` (8000×6250). Generated locally with `sips` +
`ffmpeg`; WebP samples from the public Google WebP gallery.

**Done when:** samples exist and the toolchain versions match §8 of `context.md`.
**Verified:** Node v24.16.0, npm 11.13.0; all sample formats confirmed readable by `sips`
(animated WebP via VP8X/ANIM chunks).

---

## Phase 1 — Scaffold ✅

- [x] `npm init -y`, then add `"type": "module"` and a private package name.
- [x] Install runtime deps: `electron`, `react`, `react-dom`, `zustand`, `sharp`.
- [x] Install dev deps: `electron-vite`, `vite`, `typescript`, `@types/node`,
      `@types/react`, `@types/react-dom`, `electron-builder`, `vitest`, `eslint`,
      `prettier`, plus the React/ESLint plugins used by the config.
- [x] Create `electron.vite.config.ts` with `main`, `preload`, `renderer` sections and the
      `@shared` / `@renderer` aliases.
- [x] Create `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` (strict, `noUncheckedIndexedAccess`,
      `verbatimModuleSyntax`; no `any`).
- [x] Create `vitest.config.ts` (node environment, `shared` + `main` test globs).
- [x] Add scripts: `dev`, `build`, `typecheck`, `lint`, `format`, `test`, `build:mac`,
      `build:win`, `postinstall`.
- [x] Add `.gitignore` (`node_modules`, `out`, `dist`, `resources/bin`, `samples`, `*.log`).
- [x] Add `.editorconfig` + Prettier config + ESLint flat config.
- [x] Create the directory skeleton from `architecture.md` §7.
- [x] Add minimal `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/main.tsx`,
      `src/renderer/index.html` that boot a blank window.
- [x] `npm run dev` opens a window with no console errors.

**Done when:** blank Electron window launches via `electron-vite dev`; typecheck passes.
**Verified:** `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` pass; `npm run dev` and
`npm start` both open "The Diat Converter" with no runtime errors (only Electron's expected dev CSP
warning, addressed in Phase 3/8).

---

## Phase 2 — Shared contracts ✅

- [x] Create `shared/types.ts` with every type from `architecture.md` §5.1, §5.2, and the
      engine/queue types used below.
- [x] Add `IPC` channel-name constants (`as const`) so main/preload cannot typo a channel.
- [x] Ensure **no** `electron`/`node` imports in `shared/` (enforce with a comment + review).
- [x] Wire path aliases so all three processes import `@shared/types`.

**Done when:** `npm run typecheck` passes and `shared/types.ts` has no platform imports.
**Verified:** full check suite passes; `@shared/types` resolves from main, preload, and renderer
(temporary import check removed after `tsc` passed).

---

## Phase 3 — Main process foundation ✅

- [x] `src/main/index.ts`: `app.whenReady`, single-instance lock, create `BrowserWindow` with
      `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `preload` path.
- [x] macOS lifecycle: re-create window on `activate`, quit on `window-all-closed` except darwin.
- [x] Harden navigation: deny `will-navigate` and `setWindowOpenHandler` to external URLs.
- [x] Minimal application menu (macOS app menu, Edit/View/Window) — no custom actions yet.
- [x] `src/main/settings.ts`: load/save `userData/settings.json` with defaults, validation,
      debounce, atomic write, and `version` field.
- [x] `src/main/binaries.ts`: resolve bundled CLI path per `platform-arch`, verify existence,
      return a typed `ENGINE_MISSING` error when absent.
- [x] `src/main/ipc.ts`: an `ok/error` wrapper + a typed `registerIpc()` skeleton that logs
      unhandled channels in dev.

**Done when:** app opens, settings file is created on first change, typecheck passes.
**Verified:** full check suite passes (5 settings tests); `npm run dev` opens the window with no
errors. Noted: only `settings:get` / `settings:set` are wired so far; remaining channels are
dev-logged fallbacks until Phase 6.

---

## Phase 4 — Formats & engines ✅

- [x] `src/main/conversion/formats.ts`: format matrix for heic/png/jpg/webp/avif/tiff/gif/bmp
      (`id`, `label`, `extensions[]`, `mime`, `kind`, `canRead`, `canWrite`, `defaultOptions`).
- [x] Export pure helpers: `detectFormat(path)`, `resolveOutputFormat(from, to)`,
      `isSupported(from, to)`.
- [x] `src/main/conversion/engine.ts`: `ConversionEngine` interface + ordered registry +
      `resolveEngine(from, to)` returning a typed error when nothing matches.
- [x] `src/main/conversion/sharpEngine.ts`:
  - [x] `canConvert` from the matrix.
  - [x] decode/encode with correct options; `animated: true` for GIF/WEBP when applicable.
  - [x] orientation + metadata handling per open question #1.
  - [x] transparent → JPG background behavior (white).
  - [x] write to temp file, then rename; remove temp on failure/abort.
- [x] `src/main/conversion/magickEngine.ts`:
  - [x] Route BMP (and any sharp gap) here; `sharpEngine.canConvert` must return `false` for it.
  - [x] `execFile(magickPath, [...])` — never a shell string.
  - [x] map stderr to a `ConvertError`; include it only in `detail`.
  - [x] same temp-file/rename contract as sharp.
- [x] Unit-test `detectFormat` and `resolveEngine` priority with fake engines.

**Done when:** a Node script (or temporary test) converts the sample HEIC → PNG, and a format only
ImageMagick handles converts via the fallback.
**Verified:** 29 tests pass, including HEIC → PNG and BMP → PNG through ImageMagick, PNG → BMP,
AVIF → PNG via sharp, animation, orientation, metadata retention, white flattening, corrupt input,
and cancellation.
**Correction:** sharp 0.35's prebuilt libheif has no HEVC decoder, so HEIC read routes to
ImageMagick instead of sharp. The ImageMagick binary must exist at
`resources/bin/<platform>-<arch>/` (Phase 10 automates the fetch).

---

## Phase 5 — Queue

- [x] `src/main/conversion/queue.ts`: batch creation, `batchId`, concurrency
      `min(4, cpuCount)`, FIFO.
- [x] Per-job `AbortController`; check between phases and before rename.
- [x] Emit `ProgressEvent` at reading/converting/writing boundaries (monotonic percent).
- [x] Emit terminal events: `done` with `ConvertResult`, or `failed`/`cancelled`.
- [x] Pure `resolveOutputPath(input, to, outputDir, exists)` handling collisions (`-1`, `-2`, …)
      and the "never equal to source" rule.
- [x] Cleanup: delete temp files on failure/cancel; never leave a `.tmp` behind.
- [x] Unit-test naming/collision logic exhaustively (incl. multi-dot names, no extension).

**Done when:** `npm test` covers naming + concurrency scheduling without touching real files
beyond a temp dir fixture.

---

## Phase 6 — IPC & preload ✅

- [x] Implement every channel in `architecture.md` §5.4 in `src/main/ipc.ts`.
- [x] Validate renderer payloads (absolute paths, known `FormatId`, bounded arrays).
- [x] `src/preload/index.ts`: `contextBridge.exposeInMainWorld('api', …)` matching §5 exactly;
      add `webUtils.getPathForFile` for dropped files.
- [x] Add `src/preload/index.d.ts` (or shared `Window` augmentation) so the renderer gets types.
- [x] Progress/job events: subscribe on the renderer, return an unsubscribe function.

**Done when:** a temporary renderer button can call `getFormats()` and log the matrix.
**Verified:** all twelve channels are wired. Invoke methods return typed `IpcResult<T>`; the
preload never throws across the bridge. `validation.ts` rejects relative paths, unknown formats,
malformed options, invalid batch IDs, and batches over 1000 files with `INVALID_REQUEST`, and
re-derives file metadata from the path instead of trusting the renderer. `files.ts` stats dropped
paths and skips directories/unreadable entries. `shared/window.d.ts` augments `Window` with the
typed `WindowApi`. A CDP smoke run of the built app clicked the temporary "Log formats" button:
`window.api` exposed all 13 members, the renderer logged `[formats] Array(8)`, and
`getFormats()` resolved `{ ok: true }` with all 8 formats.

---

## Phase 7 — Renderer shell

- [ ] `styles/tokens.css`: color/space/radius/typography tokens for light + dark; map to
      `prefers-color-scheme` under `[data-theme="system"]`.
- [ ] `styles/global.css`: reset, base type, focus-visible ring, reduced-motion rules.
- [ ] `App.tsx`: CSS-grid shell with named regions (`topbar`, `hero`, `controls`, `list`,
      `actions`, `footer`) and deliberately empty widget slots.
- [ ] `state/store.ts`: Zustand store per §6.1 (files, formats, target, output, progress,
      batchId, selectors).
- [ ] Load `getFormats()` + `getSettings()` on mount; show a graceful error state if either fails.
- [ ] `components/DropZone.tsx`: drag & drop **and** click-to-browse; keyboard activation;
      dragover affordance.
- [ ] `components/FileList.tsx` + `FileRow.tsx`: thumb/name/size/format arrow, per-row override,
      remove button, status/error display.
- [ ] `components/FormatPicker.tsx`: driven by the matrix, disabled formats marked with a reason.
- [ ] `components/ProgressBar.tsx`: per-row + aggregate, `role="progressbar"`.
- [ ] `components/ThemeToggle.tsx`: system/light/dark, persisted via `setSettings`.
- [ ] `components/SettingsPanel.tsx`: output folder (default "Same folder"), clear setting.
- [ ] Primary action: "Convert N files", disabled when nothing is convertible; switches to
      Cancel while a batch runs.
- [ ] Post-conversion row actions: Save/Reveal (open path) and Copy path.
- [ ] Empty state and large-batch layout check at 50 rows (virtualize only if needed).

**Done when:** drop + browse both populate rows and the whole flow completes against mocked
`window.api`.

---

## Phase 8 — Settings, theme & polish

- [ ] Apply saved theme before first paint (avoid flash) via a tiny inline boot script.
- [ ] Persist output folder + last used target format; restore on launch.
- [ ] Display typed errors with a human sentence and an expandable "Details".
- [ ] Confirm a cancelled/failed batch leaves the UI in a state that accepts a new batch.
- [ ] Add app icon assets to `resources/` (`.icns`, `.ico`, `.png`).
- [ ] Fill in window title, `appId`, `productName`.

**Done when:** restart restores theme + output folder; all error states are reachable and legible.

---

## Phase 9 — Test coverage

- [ ] Unit: format matrix integrity (unique ids, extensions mapped once, defaults in range).
- [ ] Unit: `detectFormat` incl. uppercase/multi-dot/unknown.
- [ ] Unit: `resolveOutputPath` collisions + never-overwrite-source.
- [ ] Unit: `resolveEngine` priority and unsupported path.
- [ ] Unit: settings validation/migration (corrupt file → defaults).
- [ ] Integration (optional): queue with a stub engine — failure isolation, cancel semantics.
- [ ] Manual: run `architecture.md` §10.1 QA matrix on macOS, then Windows.

**Done when:** `npm test` is green and every pure function in the conversion layer has a test.

---

## Phase 10 — Packaging & bundled binaries

- [ ] `electron-builder.yml`: `appId`, `productName`, mac (universal dmg), win (NSIS +
      portable), `files`, `asarUnpack` for `resources/bin/**`.
- [ ] `scripts/fetch-binaries.mjs`: download static ImageMagick per `platform-arch` into
      `resources/bin/…`, verify checksum, skip if present, fail loudly in CI.
- [ ] `postinstall`: `electron-builder install-app-deps` **and** `node scripts/fetch-binaries.mjs`.
- [ ] Verify `binaries.ts` resolves correctly **inside the packaged app** (resources path, not
      asar `__dirname`).
- [ ] `npm run build:mac` → install the `.dmg`, run the QA matrix.
- [ ] `npm run build:win` on Windows → install the `.exe`, run the QA matrix.
- [ ] Add third-party license notices for libvips/libheif/ImageMagick.

**Done when:** packaged builds on both OSes install, launch, and convert a HEIC with no dev
tooling present.

---

## Phase 11 — CI & release

- [ ] GitHub Actions: matrix `macos-latest` + `windows-latest`; `npm ci` →
      `typecheck` → `lint` → `test` → `build`.
- [ ] Upload packaged artifacts per OS.
- [ ] Add a `CHECKSUMS`/release note template.
- [ ] Document unsigned-install workaround in `README.md`.
- [ ] Tag `v1.0.0` only after §9 of `context.md` is fully checked.

**Done when:** a tag build produces installers from CI and a clean machine can use them.

---

## Phase 12 — Post-v1 backlog (do not start before release)

- [ ] v1.1: per-file options (quality, resize, background color) in the UI + engine options.
- [ ] v1.2: widgets (recent conversions, reorder, presets) in the reserved regions.
- [ ] v2: FFmpeg engine for audio (MP3, WAV, FLAC, AAC, OGG).
- [ ] v2.1: video (MP4, MOV, WEBM, MKV).
- [ ] v3: documents (PDF ↔ images, Pandoc for text).
- [ ] Code signing + notarization for macOS and Windows.
