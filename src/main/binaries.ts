import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ConvertError } from '@shared/types'

export type BinaryResolution = { ok: true; path: string } | { ok: false; error: ConvertError }

const PLATFORM_ARCH = `${process.platform}-${process.arch}`
const MAGICK_BINARY = process.platform === 'win32' ? 'magick.exe' : 'magick'
const FFMPEG_BINARY = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
const PANDOC_BINARY = process.platform === 'win32' ? 'pandoc.exe' : 'pandoc'

export function resolvePandocPath(): BinaryResolution {
  const candidates = bundledBinDirs().map((dir) => join(dir, PANDOC_BINARY))
  const found = candidates.find((candidate) => existsSync(candidate))

  if (found) return { ok: true, path: found }
  return {
    ok: false,
    error: {
      code: 'ENGINE_MISSING',
      message: 'Pandoc is not available. Reinstall the app or run the binary fetch script.',
      detail: `Looked in: ${candidates.join(', ')}`
    }
  }
}

export function resolveFfmpegPath(): BinaryResolution {
  const candidates = bundledBinDirs().map((dir) => join(dir, FFMPEG_BINARY))
  const found = candidates.find((candidate) => existsSync(candidate))

  if (found) return { ok: true, path: found }
  return {
    ok: false,
    error: {
      code: 'ENGINE_MISSING',
      message: 'FFmpeg is not available. Reinstall the app or run the binary fetch script.',
      detail: `Looked in: ${candidates.join(', ')}`
    }
  }
}

export function resolveMagickPath(): BinaryResolution {
  const candidates = bundledBinDirs().map((dir) => join(dir, MAGICK_BINARY))
  const found = candidates.find((candidate) => existsSync(candidate))

  if (found) return { ok: true, path: found }

  return {
    ok: false,
    error: {
      code: 'ENGINE_MISSING',
      message: 'ImageMagick is not available. Reinstall the app or run the binary fetch script.',
      detail: `Looked in: ${candidates.join(', ')}`
    }
  }
}

function bundledBinDirs(): string[] {
  if (!app.isPackaged) {
    return [join(app.getAppPath(), 'resources', 'bin', PLATFORM_ARCH)]
  }

  return [
    join(process.resourcesPath, 'app.asar.unpacked', 'resources', 'bin', PLATFORM_ARCH),
    join(process.resourcesPath, 'bin', PLATFORM_ARCH)
  ]
}
