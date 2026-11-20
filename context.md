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

**Current status:** v1.0 release foundations, v1.1 per-file image options, v1.2 widgets, v2
audio/video conversion, v3.1 PDF ↔ raster-image conversion, and v3.2 Pandoc document conversion
are implemented. The project supports image conversion through Sharp and ImageMagick, media
conversion through bundled FFmpeg, and TXT/Markdown/HTML/DOCX/ODT conversion through bundled
Pandoc. The validation suite has 121 passing tests; typecheck, lint, test, and production build
pass. A native Apple Silicon macOS package now builds successfully as
`dist/The Diat Converter-0.1.0-arm64.dmg`. Universal packaging remains optional and blocked on a
separately prepared Intel resource bundle because this Apple Silicon machine cannot produce the
matching x64 ImageMagick, Ghostscript, and Pandoc binaries locally. The signing/notarization
pipeline (Developer ID + notarization on macOS, Authenticode on Windows) is implemented in the
release workflow; producing signed installers requires the repository secrets listed in
[`architecture.md`](./architecture.md#packaging). Clean-install QA remains release work. The
authoritative checklist is [`todos.md`](./todos.md).

**Test fixtures:** `samples/` (git-ignored) holds HEIC, AVIF, transparent PNG, JPG, static +
animated WebP, 20-frame GIF, TIFF, BMP, a corrupt JPG, and an 8000×6250 (50 MP) JPG. They were
generated locally with `sips` + `ffmpeg`; the WebP files are from the public Google WebP gallery.
Never commit them — they exist only to drive manual and engine tests.

---

## 2. Decisions log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-11-12 | **Electron + React + Vite + TypeScript** | Node available, one codebase for Win+Mac, best fit for a web-style minimal UI, huge ecosystem. |
| 2026-11-12 | **`sharp` (libvips) as primary engine, bundled ImageMagick CLI as fallback** | Fast in-process path for AVIF/WEBP/TIFF/GIF/PNG/JPEG; ImageMagick guarantees coverage for BMP and HEIC. |
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
| 2026-11-13 | **HEIC routes to ImageMagick, not sharp** | sharp 0.35's prebuilt libheif is AVIF-only; decoding HEIC fails with "Support for this compression format has not been built in: HEVC". |
| 2026-11-13 | **Auto-orient always; strip EXIF/GPS by default** | `keepMetadata` defaults to false so GPS never leaks accidentally; ICC is kept when supported. Explicit `keepMetadata: true` keeps EXIF. |
| 2026-11-14 | **Mirror the theme to localStorage for a pre-paint boot script** | The inline `index.html` script cannot read main-process `settings.json` before first paint; `settings.json` stays canonical and the mirror is rewritten whenever the theme is applied. |
| 2026-11-14 | **Per-file image options** (quality, bounded resize, JPG background, metadata) | Advanced controls belong to each queued job so mixed-format batches can use different output settings without changing the global target. |
| 2026-11-14 | **v1.2 widgets use renderer-local persistence** | Recent outputs and presets are lightweight local metadata; localStorage keeps them offline without expanding the main-process settings schema. |
| 2026-11-14 | **FFmpeg is bundled from `ffmpeg-static`** | Audio conversion uses a platform-specific FFmpeg binary copied into `resources/bin/<platform>-<arch>` during postinstall, keeping packaged conversion offline and outside ASAR. |
| 2026-11-14 | **Audio uses the existing queue and IPC pipeline** | FFmpeg jobs share validation, output collision handling, cancellation, progress events, atomic writes, and batch isolation with image jobs rather than introducing a second workflow. |
| 2026-11-14 | **Video uses the same FFmpeg engine as audio** | MP4, MOV, WEBM, and MKV are container targets in the shared format matrix; video streams are preserved while audio-only inputs continue to use `-vn`. |
| 2026-11-14 | **v3 is split into PDF raster conversion first, Pandoc later** | PDF ↔ image conversion can build on the bundled ImageMagick path. Pandoc requires separate platform binaries, licensing review, and clean packaged-install validation, so it is not advertised or marked complete until those prerequisites are met. |
| 2026-11-14 | **PDF uses ImageMagick at 150 DPI for rasterization** | PDF is a document format but PDF ↔ PNG/JPG/TIFF stays within the verified bundled ImageMagick pipeline; PDF inputs use an explicit 150 DPI density for predictable raster output. |
| 2026-11-14 | **Pandoc supports a bounded document set** | TXT, Markdown, HTML, DOCX, and ODT use a bundled Pandoc engine; broader formats remain intentionally unsupported until separately validated. |
| 2026-11-14 | **Native arm64 macOS packaging is the local release path** | The current Apple Silicon machine can build and package the complete arm64 resource bundle. Universal packaging is retained as `build:mac:universal` but requires a complete separately prepared darwin-x64 bundle. |
| 2026-11-19 | **Release builds are Developer ID signed/notarized on macOS and SHA-256 Authenticode signed on Windows** | CI proves artifact provenance and avoids Gatekeeper/SmartScreen friction; credentials stay in repository secrets and local unsigned builds still work. |

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
npm run build:mac    # → dist/*-arm64.dmg on Apple Silicon
npm run build:mac:universal # → dist/*-universal.dmg only with complete x64 resources
npm run build:win    # → dist/*.exe (NSIS installer + portable)
npm run verify:signing:mac  # codesign/spctl/stapler checks on a signed arm64 build
npm run verify:signing:win  # Authenticode checks on signed Windows executables
npm run checksums    # → dist/CHECKSUMS.txt (SHA-256 for release artifacts)
```

> Windows installers are best produced on a Windows machine/runner (see workflows in
> `architecture.md`). Building on macOS may require Wine for some NSIS steps. Signed release
> artifacts are produced by `.github/workflows/release.yml`; local builds stay unsigned without
> credentials and are fine for development.

---

## 5. Glossary

| Term | Meaning |
|------|---------|
| **Engine** | A strategy that performs a conversion (`sharp`, `magick`, or `ffmpeg`). Implements `ConversionEngine`. |
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
- **sharp cannot decode HEIC:** its prebuilt libheif only ships the AV1 decoder. The error is
  "Support for this compression format has not been built in: HEVC". HEIC read routes to
  `magickEngine`; do not advertise HEIC as sharp-capable.
- **HEIC decode is CPU-heavy** for large images — hence the concurrency limit in the queue.
- **Animated formats:** GIF/WEBP animation requires `sharp(..., { animated: true })` on the input,
  and an animated-capable target (GIF or WEBP). Using `animated: true` for PNG produces a tall
  filmstrip; for static targets, leave it off so only the first frame is used.
- **BMP is not in prebuilt sharp:** libvips has no BMP codec in the prebuilt package, so BMP
  conversions must resolve to `magickEngine`. Do not advertise BMP as sharp-capable.
- **`FileInfo.format` can be `null`:** unknown extensions must fail per-row, not throw out of
  `statFiles`.
- **Electron binary must be fetched once:** Electron 45 has no postinstall downloader. If dev
  fails with `Electron uninstall`, run `node node_modules/electron/install.js`.
- **Keep a global `BrowserWindow` reference:** without one, V8 may collect the window and the app
  quits unexpectedly a few seconds after launch.
- **Output collisions are reserved per batch:** `queue.ts` tracks resolved output paths while jobs
  run so two concurrent same-name jobs cannot both claim `<name>.<ext>` before either exists on
  disk. The pure naming helper trusts the caller's `exists` predicate.
- **Renderer payloads are untrusted:** `validation.ts` gates every invoke, requires absolute paths,
  bounds batches, and re-derives `FileInfo` metadata from the path. Invoke methods return
  `IpcResult<T>` rather than throwing across the context bridge.
- **Audio formats are FFmpeg-only:** MP3, WAV, FLAC, AAC, and OGG are declared in the shared format
  matrix and resolve to `ffmpegEngine`; Sharp and ImageMagick must not advertise audio capability.
- **Video formats are FFmpeg-only:** MP4, MOV, WEBM, and MKV are declared in the shared format
  matrix and resolve to `ffmpegEngine`; the FFmpeg command preserves video streams for these jobs.
- **FFmpeg binaries are external resources:** `scripts/fetch-binaries.mjs` copies the platform
  binary into `resources/bin/<platform>-<arch>`, and electron-builder packages that directory
  outside ASAR. Native Apple Silicon packaging uses the complete arm64 resource bundle. Universal
  packaging additionally requires separately prepared x64 ImageMagick, Ghostscript, Pandoc, and
  FFmpeg resources. Do not copy arm64 binaries into the x64 directory.
- **Pandoc is a separate document engine:** its executable is resolved from the same external
  resource directory and invoked without a shell. macOS fetches it through Homebrew; Windows
  still needs a pinned official artifact and clean packaged-install validation.
- **Audio options are intentionally limited:** audio jobs support metadata preservation/stripping;
  image-only quality, resize, and JPG background controls are not shown for audio rows.

---

## 7. Where to look first

| I want to… | Look at |
|------------|---------|
| Understand the design | `architecture.md` |
| Build the app / see what's next | `todos.md` |
| Add a supported format | `src/main/conversion/formats.ts` (+ engine `canConvert`) |
| Change the conversion pipeline | `src/main/conversion/queue.ts`, `engine.ts` |
| Change audio conversion | `src/main/conversion/ffmpegEngine.ts`, `formats.ts` |
| Change output naming / collisions | `src/main/conversion/naming.ts` |
| Change the IPC surface | `shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts` |
| Validate an IPC payload | `src/main/validation.ts` |
| Stat dropped files | `src/main/files.ts` |
| Change the UI | `src/renderer/src/App.tsx` and `components/` |
| Change theming | `src/renderer/src/styles/tokens.css` |
| Adjust packaging | `electron-builder.yml` |
| Add/refresh bundled CLIs | `scripts/fetch-binaries.mjs` |
| Test a conversion by hand | `samples/` (git-ignored local fixtures) |

---

## 8. Environment

| Tool | Version used | Notes |
|------|--------------|-------|
| Node | 24.16.0 (LTS) ✅ | Electron's bundled Node is what runs at runtime; this is build-time only. |
| npm | 11.13.0 ✅ | Lockfile committed; use `npm ci` in CI. |
| OS | macOS 12+ / Windows 10 21H2+ | Current dev machine is macOS (darwin arm64); Windows is still a v1 target. Windows ARM64 out of scope for v1. |
| Fixtures | `sips` + `ffmpeg` (dev only) | Local tools used to generate `samples/`; packaged conversion uses the pinned `ffmpeg-static` dependency. |

> `postinstall` runs `electron-builder install-app-deps` and the pinned ImageMagick/FFmpeg fetch script
> (Windows x64/arm64). On macOS, the script uses Homebrew's verified ImageMagick bottle at build
> time, copies the formula and runtime dylibs into the app resources, rewrites their paths, and
> signs them ad hoc. Release signing replaces those ad-hoc signatures with the Developer ID
> identity and applies the hardened-runtime entitlements from `resources/`. The final app does not
> require Homebrew. If the binary is missing, HEIC and
> BMP conversions fail with `ENGINE_MISSING` — a setup error, not an app bug. The three
> `magickEngine` integration tests require the bundled ImageMagick binary. PDF rasterization also
> requires Ghostscript, which the macOS fetch script installs and bundles beside ImageMagick;
> the launcher adds its `bin` directory to `PATH`. ImageMagick is copied as an external resource
> because its
> architecture-specific files must not be merged into the ASAR. On the current Apple Silicon
> machine, use `npm run build:mac` for the verified native arm64 DMG. `npm run
> build:mac:universal` intentionally stops until a genuine Intel resource bundle is supplied.

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
