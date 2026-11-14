# The Diat Converter — Architecture

> A local, offline, cross-platform (Windows + macOS) file converter.
> This document describes how the app is built, why, and how the pieces fit together.
  
---

## 1. Goals & Non-Goals

### Goals
- Convert files **locally**, with **no internet connection required** and **no uploads**.
- Ship a **minimalistic UI** modeled on online converters (Convertio / CloudConvert), with
  reserved space so decorations and widgets can be added later.
- Support **both** file-input methods: **drag & drop** and **click to browse**.
- Run natively on **Windows 10/11** and **macOS** (Intel + Apple Silicon).
- Start with **images** (HEIC, PNG, JPG/JPEG, WEBP, AVIF, TIFF, GIF, BMP) and leave clean seams
  for audio/video/document formats.

### Non-Goals (for v1)
- Cloud sync, accounts, or telemetry.
- Audio/video/document conversion (planned — see §9 Roadmap).
- Batch editing beyond format conversion (crop, resize, filters) — the pipeline is designed to
  accept per-file options later.

---

## 2. High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Electron App                            │
│                                                                  │
│  ┌────────────────────────┐        ┌──────────────────────────┐  │
│  │   Renderer (React)     │        │      Main Process        │  │
│  │  - DropZone            │        │  - Window / Menu         │  │
│  │  - FileList            │  IPC   │  - IPC handlers          │  │
│  │  - FormatPicker        │ <────> │  - Conversion queue      │  │
│  │  - ProgressBar         │        │  - Engine registry       │  │
│  │  - ThemeToggle         │        │      ├─ sharpEngine      │  │
│  └───────────┬────────────┘        │      └─ magickEngine     │  │
│              │ contextBridge       │  - Settings (persisted)  │  │
│  ┌───────────▼────────────┐        └────────────┬─────────────┘  │
│  │   Preload (window.api) │                     │                │
│  └────────────────────────┘                     ▼                │
│                                        ┌──────────────────────┐  │
│                                        │  Native binaries     │  │
│                                        │  - libvips (sharp)   │  │
│                                        │  - ImageMagick (CLI) │  │
│                                        └──────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

- **Renderer** — a sandboxed React SPA. It never touches the filesystem directly.
- **Preload** — a tiny, audited bridge that exposes a typed `window.api` via `contextBridge`.
- **Main** — Node.js environment. Owns the filesystem, dialogs, and all conversion work.
- **Native binaries** — conversion happens through `sharp` (libvips, in-process) with a bundled
  ImageMagick CLI as a fallback.

---

## 3. Technology Stack

| Concern              | Choice                                    | Why |
|----------------------|-------------------------------------------|-----|
| Shell                | **Electron**                              | One codebase for Windows + macOS; Node available for CLI tools. |
| Build tooling        | **electron-vite**                         | Fast HMR for renderer, bundles main/preload, TS-first. |
| UI                   | **React 19 + TypeScript**                 | Component model fits the widget/decoration roadmap. |
| State                | **Zustand**                               | Minimal, no boilerplate, easy to extend. |
| Styling              | **Plain CSS + CSS variables**             | Zero runtime, trivially themeable (light/dark tokens). |
| Image engine (fast)  | **sharp** (libvips 8.18, includes libheif)| In-process, fast, prebuilt binaries ship AVIF support (no HEVC/HEIC decode). |
| Image engine (fallback)| **ImageMagick** (bundled static CLI)    | Broad format coverage; also the seam for future formats. |
| Packaging            | **electron-builder**                      | `.dmg` for macOS, NSIS `.exe` + portable for Windows. |
| Tests                | **Vitest**                                | Unit tests for pure logic (format matrix, naming, engine pick). |

> **Why not pure JS/WASM?** `ffmpeg.wasm` and pure-JS HEIC decoders are slow and fragile.
> `sharp` gives near-native speed with prebuilt binaries and no compiler on the user's machine.
>
> **Why both engines?** `sharp` covers ~99% of real-world image conversions and is the default.
> The bundled ImageMagick CLI guarantees a path for edge formats and is the natural place to
> add more capability later without re-architecting.

---

## 4. Conversion Layer

### 4.1 Engine interface

Every engine implements one interface, so the queue never cares *how* a format is produced:

```ts
export interface ConversionEngine {
  readonly id: 'sharp' | 'magick'
  canConvert(from: FormatId, to: FormatId): boolean
  convert(input: ConvertInput, onProgress?: ProgressFn): Promise<ConvertResult>
}
```

- **`sharpEngine`** — decodes with libvips, encodes to the target. Handles AVIF/WEBP/TIFF/GIF/
  PNG/JPEG (read + write). Multi-frame (GIF/WEBP) uses `animated: true` only when the target is
  animated-capable. BMP is absent from the prebuilt libvips set, and the prebuilt libheif lacks an
  HEVC decoder, so BMP **and HEIC read** are declared magick-only.
- **`magickEngine`** — shells out to the bundled `magick` binary via `execFile` (no shell, so no
  command-injection surface). Used when `sharp` reports it cannot perform the conversion — in v1
  this is BMP (read/write) and HEIC (read). It is also the safety net for future gaps.

### 4.2 Engine selection

`resolveEngine(from, to)` iterates the registry in priority order (`sharp` → `magick`) and returns
the first engine that returns `true` from `canConvert`. If none match, the job fails with a typed
`UNSUPPORTED_CONVERSION` error surfaced to the UI.

### 4.3 Format matrix

`formats.ts` is the single source of truth for supported formats. Each entry declares:
`id`, `label`, `extensions[]`, `mime`, `kind` (`image` | `audio` | `video` | `document`), and the
engines that can read/write it. The renderer fetches this list over IPC so the UI and the backend
can never disagree.

### 4.4 Queue & concurrency

- Jobs are queued in the main process and processed with a small concurrency limit
  (default `min(4, cpuCount)`) to avoid pinning the CPU.
- Each job emits `progress` events (`{ jobId, phase, percent }`) that the renderer subscribes to.
- Failures are isolated per job — one bad file never aborts the batch.

### 4.5 Output naming & collisions

Output = `basename + newExtension` in the chosen output directory. If the file exists, append
`-1`, `-2`, … until unique. Naming logic is a pure function (`naming.ts`) and unit-tested; the
queue also reserves resolved paths for the duration of a batch so same-name jobs cannot race.

Never overwrite the source file: if the resolved output path equals the input path (same folder,
same extension), force the suffix path even if the source does not "exist" as a target yet.

### 4.6 Conversion options

v1 exposes a deliberately small option set; the type is shaped so v1.1 can add resize/crop
without touching IPC signatures.

```ts
export interface ConvertOptions {
  quality?: number           // 1–100; encoder default when omitted
  keepMetadata?: boolean     // default false: auto-orient, strip EXIF/GPS, keep ICC
}
```

Defaults live in `formats.ts` per format (e.g. JPEG/WEBP/AVIF → 80, PNG → lossless, GIF →
preserve animation, TIFF → preserve pages). The renderer never hardcodes a default; it reads the
resolved values from `getFormats()`.

### 4.7 Atomic writes & cancellation

- Each job writes to a sibling temp file (`.<name>.<jobId>.tmp`) in the destination folder, then
  `fs.rename` into place. A crash or cancel can therefore never leave a half-written file that
  looks valid.
- `cancelBatch(batchId)` marks queued jobs as cancelled and signals in-flight jobs via an
  `AbortSignal`. `sharp` offers no mid-decode cancel, so the engine checks the signal between
  phases (decode → transform → encode) and before the final rename. The temp file is removed on
  abort.
- Cancelled jobs report a terminal `cancelled` status; they are never counted as failures.

---

## 5. Process & IPC Contract

Security posture: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` where
possible. The renderer can only do what the preload explicitly exposes.

### 5.1 Shared domain types

All of these live in `shared/types.ts` and are the contract between the three processes.
`Electron`/`Node` types are allowed only in the main/preload sections — nothing here may import
`fs` or `electron`.

```ts
export type FormatId = 'heic' | 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'gif' | 'bmp'
export type FormatKind = 'image' | 'audio' | 'video' | 'document'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface FormatDef {
  id: FormatId
  label: string
  extensions: string[]
  mime: string
  kind: FormatKind
  canRead: boolean
  canWrite: boolean
  defaultOptions: ConvertOptions
}

export interface FileInfo {
  path: string
  name: string
  size: number
  format: FormatId | null   // null when detected extension is unknown
}

export type JobStatus =
  | 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  batchId: string
  input: FileInfo
  to: FormatId
  options: ConvertOptions
  status: JobStatus
  outputPath?: string
  error?: ConvertError
}

export interface ConvertRequest {
  jobs: Array<Pick<Job, 'input' | 'to' | 'options'>>
  outputDir: string | null   // null → each job's source folder
}

export interface ConvertResult {
  jobId: string
  outputPath: string
  engine: 'sharp' | 'magick'
  durationMs: number
}

export interface ProgressEvent {
  jobId: string
  phase: 'reading' | 'converting' | 'writing'
  percent: number            // 0–100, monotonic within a phase
}

export interface Settings {
  outputDir: string | null
  defaultFormat: FormatId
  theme: ThemeMode
}
```

### 5.2 Error model

Errors cross IPC as plain data, never as thrown `Error` instances (those lose their class across
the boundary). The UI switches on `code` for copy and recovery affordances.

```ts
export type ErrorCode =
  | 'UNSUPPORTED_CONVERSION'
  | 'UNREADABLE_FILE'
  | 'OUTPUT_NOT_WRITABLE'
  | 'ENGINE_MISSING'
  | 'INVALID_REQUEST'
  | 'CANCELLED'
  | 'UNKNOWN'

export interface ConvertError {
  code: ErrorCode
  message: string        // safe to show the user
  detail?: string        // engine stderr / stack, shown behind "Details"
}
```

IPC handlers wrap every thrown error in this shape; `ipcMain.handle` results are
`{ ok: true, value } | { ok: false, error: ConvertError }` so a failed dialog or stat call is
recoverable instead of rejecting into the renderer.

### 5.3 Settings persistence

- Stored as JSON at `app.getPath('userData')/settings.json`.
- On read: missing/corrupt file → defaults; unknown fields are dropped; version field allows
  future migrations.
- On write: validated against a small schema, debounced (~250 ms), and written atomically
  (temp + rename) so a crash cannot corrupt the file.
- Settings never contain file contents or paths beyond the last chosen output directory, which
  the user can clear.

### `window.api` surface

| Method | Returns | Purpose |
|--------|---------|---------|
| `pickFiles()` | `IpcResult<FileInfo[]>` | Native open dialog (click-to-browse). |
| `getPathForFile(file)` | `string` | Resolve OS path for a dropped `File` (via `webUtils`). |
| `statFiles(paths[])` | `IpcResult<FileInfo[]>` | Read name/size/detected type for dropped paths. |
| `getFormats()` | `IpcResult<FormatDef[]>` | Supported formats for the UI. |
| `pickOutputFolder()` | `IpcResult<string \| null>` | Choose an output directory. |
| `getSettings() / setSettings()` | `IpcResult<Settings>` | Persist output dir + default target format + theme. |
| `startConversion(request)` | `IpcResult<{ batchId }>` | Kick off a batch. |
| `onProgress(cb)` | `unsubscribe` | Subscribe to per-job progress. |
| `onJobDone(cb)` | `unsubscribe` | Subscribe to per-job success/failure/cancel. |
| `openPath(path)` | `IpcResult<void>` | Open a file with the OS default app. |
| `revealInFolder(path)` | `IpcResult<void>` | Show a file in Finder/Explorer. |
| `cancelBatch(batchId)` | `IpcResult<void>` | Cancel in-flight work. |

All invoke methods resolve to `IpcResult<T>`; the preload never throws across the bridge, so the
renderer can switch on `error.code` instead of catching rejections. Channels are namespaced
(`convert:start`, `settings:get`, …) and typed in `shared/types.ts` (`WindowApi`), which is
imported by main, preload, and renderer. `shared/window.d.ts` augments the renderer's `Window`
interface with `api`.

### 5.4 Channel map

| Channel | Direction | Payload → Result |
|---------|-----------|------------------|
| `dialog:pickFiles` | invoke | `() → FileInfo[]` |
| `dialog:pickOutputFolder` | invoke | `() → string \| null` |
| `files:stat` | invoke | `string[] → FileInfo[]` |
| `formats:get` | invoke | `() → FormatDef[]` |
| `settings:get` | invoke | `() → Settings` |
| `settings:set` | invoke | `Partial<Settings> → Settings` |
| `convert:start` | invoke | `ConvertRequest → { batchId: string }` |
| `convert:cancel` | invoke | `batchId → void` |
| `convert:progress` | main → renderer | `ProgressEvent` (per job) |
| `convert:jobDone` | main → renderer | `ConvertResult \| { jobId; error: ConvertError }` |
| `shell:openPath` | invoke | `string → void` |
| `shell:reveal` | invoke | `string → void` |

The preload exposes exactly these; anything not listed is unreachable from the renderer. Incoming
payloads from the renderer are treated as untrusted and validated in `src/main/validation.ts`
(paths must be absolute, `to` must be a known `FormatId`, arrays are bounded, options are typed)
before touching the filesystem. Renderer-supplied `FileInfo` metadata is re-derived from the path.
Dialogs and `shell` calls are invoked with the requesting `BrowserWindow` as owner where applicable.

---

## 6. UI / UX Design

Modeled on the "drop a file → pick a format → convert → download" flow of online converters.

```
┌───────────────────────────────────────────────────────────────┐
│  The Diat Converter                        [theme] [settings]  │  ← top bar (widget slots)
├───────────────────────────────────────────────────────────────┤
│                                                               │
│        ┌───────────────────────────────────────────────┐      │
│        │              ⬆  Drop files here              │      │  ← DropZone
│        │        or click to browse  (both work)        │      │
│        └───────────────────────────────────────────────┘      │
│                                                               │
│   Convert to: [ PNG ▾ ]        Output: [ Same folder ▾ ] [..] │  ← global controls
│                                                               │
│   ┌───────────────────────────────────────────────────────┐   │
│   │ [thumb] photo.heic   3.2 MB   HEIC → [ PNG ▾ ]   ✓    │   │  ← FileList rows
│   │ [thumb] shot.png     1.1 MB   PNG  → [ JPG ▾ ]   …    │   │
│   └───────────────────────────────────────────────────────┘   │
│                                                               │
│                      [   Convert 2 files   ]                  │  ← primary action
│                                                               │
│   ┄┄┄ reserved footer area for future widgets / decorations ┄┄ │
└───────────────────────────────────────────────────────────────┘
```

- **DropZone** accepts drag & drop *and* click-to-browse simultaneously.
- **Global target format** applies to all files; each row can override it.
- **Output** defaults to *same folder as source*, with a "Choose folder…" option.
- After conversion each row shows **Save / Copy path / Reveal in folder**.
- **Layout is intentionally sparse**: a CSS-grid shell with named regions
  (`topbar`, `hero`, `controls`, `list`, `actions`, `footer`) so widgets and decorations can be
  dropped in without reflowing the core.

### 6.1 Renderer state model

One Zustand store, split into slices so future widgets can subscribe narrowly:

```ts
interface AppState {
  files: Job[]                 // queued, running, and finished jobs in drop order
  targetFormat: FormatId       // global picker; per-row override lives on the job
  outputDir: string | null     // null = source folder per job
  formats: FormatDef[]
  settings: Settings
  batchId: string | null
  progress: Record<string, ProgressEvent>   // keyed by renderer-assigned job id
  load(): Promise<void>
  addFiles(files: FileInfo[]): void
  pickAndAdd(): Promise<void>
  addPaths(paths: string[]): Promise<void>
  removeFile(jobId: string): void
  setFileFormat(jobId: string, to: FormatId): void
  setTargetFormat(f: FormatId): void
  setOutputDir(dir: string | null): Promise<void>
  setTheme(theme: ThemeMode): Promise<void>
  start(): Promise<void>
  cancel(): Promise<void>
  handleProgress(event: ProgressEvent): void
  handleJobDone(event: JobDoneEvent): void
}
```

Rules of thumb:
- **Derived values are selectors**, not duplicated state (`canConvert`, `pendingCount`,
  `allDone`).
- **No filesystem access** in the store — every side effect goes through `window.api`.
- Progress events are keyed by `jobId` so a late event after removal is ignored.
- Dropped files are de-duplicated by absolute path.
- The theme is mirrored to localStorage so the inline boot script in `index.html` can apply it
  before first paint; `settings.json` remains the canonical store.
- Error presentation helpers map `ConvertError.code` to a human sentence and keep the raw
  code/message/detail behind a native `<details>` element.

### 6.2 Accessibility & keyboard

- DropZone is a real `<button>`-like control: focusable, activates the file dialog on
  Enter/Space, and has a visible focus ring.
- The file list is a semantic list; each row's format picker is a labelled `<select>`.
- Progress uses `role="progressbar"` with `aria-valuenow`; status changes are announced via a
  polite live region.
- All interactive targets meet 4.5:1 contrast in both themes and are reachable in DOM order.
- `prefers-reduced-motion` disables non-essential transitions.

---

## 7. Project Structure

```
the-diat-converter/
├─ architecture.md            ← this file
├─ context.md                 ← living project context
├─ todos.md                   ← phased build checklist
├─ README.md
├─ package.json
├─ tsconfig.json / tsconfig.node.json / tsconfig.web.json
├─ electron.vite.config.ts
├─ electron-builder.yml
├─ vitest.config.ts
├─ scripts/
│  └─ fetch-binaries.mjs       ← downloads ImageMagick per-platform into resources/bin
├─ resources/
│  ├─ icon.png / icon.icns / icon.ico
│  └─ bin/{darwin-arm64,darwin-x64,win32-x64}/   ← bundled CLIs (git-ignored)
├─ shared/
│  ├─ types.ts                 ← shared IPC + domain types
│  └─ window.d.ts              ← Window.api augmentation for the renderer
└─ src/
   ├─ main/
   │  ├─ index.ts              ← app lifecycle, window, menu
   │  ├─ ipc.ts                ← IPC handler registration
   │  ├─ validation.ts         ← untrusted renderer payload validation
   │  ├─ files.ts              ← stat dropped/browsed paths
   │  ├─ settings.ts           ← persisted settings
   │  ├─ binaries.ts           ← resolve bundled CLI paths (asar-aware)
   │  └─ conversion/
   │     ├─ engine.ts          ← ConversionEngine + registry/resolver
   │     ├─ sharpEngine.ts
   │     ├─ magickEngine.ts
   │     ├─ formats.ts         ← format matrix (source of truth)
   │     ├─ naming.ts          ← pure output-path / collision resolver
   │     └─ queue.ts           ← batch queue, concurrency, progress
   ├─ preload/
   │  └─ index.ts              ← contextBridge → window.api
   └─ renderer/
      ├─ index.html
      └─ src/
         ├─ main.tsx
         ├─ App.tsx
         ├─ state/store.ts + store.test.ts
         ├─ lib/{format,errors}.ts
         ├─ components/{DropZone,FileList,FileRow,ErrorDetails,FormatPicker,ProgressBar,ThemeToggle,SettingsPanel}.tsx
         └─ styles/{tokens.css,global.css}
```

---

## 8. Cross-Platform Strategy

### Development
- `npm run dev` launches Electron with HMR on **both** macOS and Windows. No platform-specific
  code paths for dev.

### Native binaries
- **sharp** ships prebuilt binaries for `darwin-arm64`, `darwin-x64`, `win32-x64` — nothing to
  compile on the user's machine.
- **ImageMagick** static binaries are fetched by `scripts/fetch-binaries.mjs` into
  `resources/bin/<platform>-<arch>/` and are listed in `asarUnpack` so they remain executable
  after packaging. `binaries.ts` resolves the correct path for the running platform.

### Packaging
- `npm run build:mac` → universal `.dmg` (x64 + arm64).
- `npm run build:win` → NSIS installer + portable `.exe`.
- Code signing is **not** configured initially (unsigned builds still run; users may need to allow
  them once). Signing/notarization is a documented follow-up.

### CI
- GitHub Actions matrix on `macos-latest` + `windows-latest` runs `typecheck`, `test`, and
  `build`, uploading installers as artifacts. Building Windows artifacts on a Windows runner
  avoids cross-compilation quirks.

---

## 9. Roadmap

| Phase | Scope |
|-------|-------|
| **v1 (this build)** | Images: HEIC, PNG, JPG, WEBP, AVIF, TIFF, GIF, BMP. Drag & drop + click. Output folder. Progress. |
| v1.1 | Per-file options (quality, resize, background color for transparency). |
| v1.2 | Widgets: recent conversions, drag-reorder, presets. |
| v2 | Audio via FFmpeg (MP3, WAV, FLAC, AAC, OGG). |
| v2.1 | Video via FFmpeg (MP4, MOV, WEBM, MKV). |
| v3 | Documents (PDF ↔ images, Pandoc for text formats). |

The `ConversionEngine` interface and the `kind` field in the format matrix are designed so these
phases are additive, not rewrites.

---

## 10. Testing & Quality

- **Unit (Vitest):** format matrix integrity, output-filename/collision logic, engine selection.
- **Type safety:** `tsc --noEmit` across main/preload/renderer (`npm run typecheck`).
- **Manual smoke:** convert a sample `.heic` → `.png` on both macOS and Windows.
- **Lint:** ESLint + Prettier (added with the scaffold) — kept minimal to avoid churn.

### 10.1 Manual QA matrix (run before each release)

| Case | Expected |
|------|----------|
| Drop 1 HEIC, convert → PNG | New PNG beside source; opens in Preview/Photos. |
| Drop 50 mixed images | Queue drains without freezing the UI; failures isolated. |
| Same name + target extension already exists | Output is `name-1.png`, source untouched. |
| File with no extension / unknown format | Row shows unsupported; excluded from convert. |
| Animated GIF → GIF/WEBP | Animation preserved (frame count matches). |
| Transparent PNG → JPG | Completes; background is documented default (white). |
| Cancel mid-batch | Remaining jobs cancelled, no `.tmp` files left behind. |
| Output folder made read-only | Row fails with `OUTPUT_NOT_WRITABLE`, app stays usable. |
| Very large image (≥ 50 MP) | Completes or fails cleanly; memory does not balloon. |
| Path with spaces/unicode | Conversion and reveal-in-folder work. |
| Restart app | Theme + last output folder restored. |

### 10.2 Performance budgets

- UI stays interactive (no frame > 100 ms) during a 50-file batch.
- Cold start to interactive < 2 s on a mid-range machine.
- Concurrency capped at `min(4, cpuCount)`; tunable in one constant.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| sharp lacks a format | Fall back to bundled ImageMagick; matrix declares engine support. |
| Bundled binaries missing at runtime | `binaries.ts` verifies presence and returns a typed error; fetch script runs in `postinstall`. |
| Large app size (~150 MB Electron) | Accepted trade-off for zero-setup, offline, cross-platform installs. |
| macOS Gatekeeper on unsigned builds | Document the right-click → Open workaround; add signing later. |
| IPC security | `contextIsolation` on, no `nodeIntegration`, `execFile` (no shell), typed allow-listed channels. |

---

## 12. Open Questions

These are deliberately unresolved; decide before the code that depends on them lands.

| # | Question | Blocks | Lean |
|---|----------|--------|------|
| 1 | Do we keep originals' EXIF orientation and color profile by default? | sharp engine | **Resolved:** always auto-orient; strip EXIF/GPS by default; keep ICC when supported. |
| 2 | Default JPG background for transparency: white or black? | sharp engine, UI copy | **Resolved:** white; document in the row tooltip. |
| 3 | Should "same folder" mean *beside source* or *last used folder* when files span folders? | queue | Beside each source. |
| 4 | Bundle ImageMagick on day one, or ship sharp-only and add the fallback once a gap appears? | fetch script, app size | Bundle from the start for coverage. |
| 5 | Target minimum OS versions (macOS 12? Windows 10 21H2?). | electron-builder | macOS 12+, Win10 21H2+. |
| 6 | Is Windows ARM64 in scope? | CI matrix | Out of scope for v1. |

---

## 13. Document Maintenance

- `architecture.md` describes *how* the system works; `context.md` is the short living summary;
  `todos.md` is the executable build plan. Keep all three in sync when a decision changes.
- Any change to the IPC contract updates §5 **and** `shared/types.ts` in the same commit.
- Record stack-level decisions as a new row in `context.md` §2 with the date and rationale.
- When `todos.md` is fully checked off, fold its lessons into `context.md` §6 (gotchas) and reset
  it for the next milestone.
