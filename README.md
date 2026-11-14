# The Diat Converter
The Diat Formation is proud to present the local Diat Converter that works on your PC and laptop!
A local, offline file converter for Windows and macOS. It does what online converters
(Convertio, CloudConvert, etc.) do — change a file from one format to another — but entirely on
your own machine. **Nothing is uploaded.** No account, no internet connection, no telemetry.

The flagship use case is **HEIC → PNG**: photos from an iPhone stay private and become files you
can open anywhere.

## What it does

- **Drag & drop** files onto the window, or **click to browse**. Both work.
- Pick a **target format** for the whole batch, or override it per file.
- Set per-file **quality, maximum width/height, JPG background color, and metadata** options.
- Convert **many files at once**; progress is shown per file and for the batch.
- Save **beside the original** by default, or choose an output folder.
- **Never overwrites the source.** Name collisions become `photo-1.png`, `photo-2.png`, ….
- **Failures stay isolated** — one corrupt file doesn't abort the rest of the batch.
- **Cancel anytime** — no half-written or leftover temp files.
- **Remembers** your theme (system/light/dark) and last output folder between launches.
- After converting, **open the result** or reveal it in Finder/Explorer.
- Reorder queued files, save reusable presets, and revisit recent conversions.
- Convert audio between MP3, WAV, FLAC, AAC, and OGG using the bundled FFmpeg engine.
- Convert video between MP4, MOV, WEBM, and MKV using the same offline FFmpeg pipeline.
- Convert PDF files to PNG, JPG, or TIFF, and raster images to PDF using bundled ImageMagick.

## Supported formats (v1: images)

HEIC, PNG, JPG/JPEG, WEBP, AVIF, TIFF, GIF, and BMP — in any direction the engines support.
Animated GIF and WEBP keep their animation. Transparent images converted to JPG get a white
background.

Conversion runs through [`sharp`](https://sharp.pixelplumbing.com/) (libvips, in-process and
fast) with a bundled **ImageMagick** CLI as a fallback for formats libvips doesn't cover (such as
BMP).

## Why local?
Online converters require uploading photos to a cloud server that may or may not be attacked! Also, it's on a website which requires internet.
There is also the pesky and annoying cookies, advertisement pop-ups and the fact that the guy running the show can shut down the converter site anytime. 
Let's be a little bit more independent with this local app that keeps the whole pipeline on-device, so it works on a plane, in a locked-down
environment, or just without handing your files to a third party.

## Tech

Electron + React + TypeScript, built with `electron-vite`, state via Zustand, packaged with
`electron-builder` (`.dmg` for macOS, NSIS/portable `.exe` for Windows). See
[`architecture.md`](./architecture.md) for the full design.

## Status

Ready to be deployed. All phases completed, extra functions like audio and video conversion are being added.

### Per-file options

Each queued file can override the defaults before conversion:

- **Quality:** 1–100 for JPG, WEBP, and AVIF.
- **Width/height:** optional maximum dimensions; aspect ratio is preserved and images are never
  enlarged.
- **Background:** a `#RRGGBB` or `#RRGGBBAA` color used when flattening transparency to JPG.
- **Keep metadata:** disabled by default so EXIF/GPS data is not retained accidentally.

### Presets and recent conversions

The Presets panel saves a target format and its per-file options locally for reuse. The Recent
conversions panel keeps the latest completed outputs on this device and provides Open and Reveal
actions. No file contents or conversion data leave the machine.

### Audio conversion

Audio conversion supports MP3, WAV, FLAC, AAC, and OGG. FFmpeg is bundled during installation
for the current platform, and audio jobs use the same queued batch workflow, cancellation,
progress reporting, unique output naming, and atomic writes as image jobs. Audio metadata is
removed by default; the per-file **Keep metadata** option is available for audio jobs as well.

### PDF conversion

PDF conversion supports PDF ↔ PNG, JPG, and TIFF through the bundled ImageMagick engine. PDF
inputs are rasterized at 150 DPI. Conversion remains local and uses the same queue, cancellation,
collision-safe naming, and atomic output behavior as the other formats.

## Documentation

| Doc | Contents |
|-----|----------|
| [`architecture.md`](./architecture.md) | How the app is built and why |
| [`context.md`](./context.md) | Living project summary, decisions, conventions |
| [`todos.md`](./todos.md) | Phased build checklist |
