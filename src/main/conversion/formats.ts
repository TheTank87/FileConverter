import { extname } from 'node:path'
import {
  FORMAT_IDS,
  type ConvertOptions,
  type EngineId,
  type FormatDef,
  type FormatId,
  type FormatKind
} from '@shared/types'

interface EngineCapability {
  read: boolean
  write: boolean
}

export interface FormatSpec extends FormatDef {
  engines: Record<EngineId, EngineCapability>
}

interface FormatSeed {
  id: FormatId
  label: string
  extensions: string[]
  mime: string
  kind: FormatKind
  defaultOptions: ConvertOptions
}

const SHARP_READ = ['png', 'jpg', 'webp', 'avif', 'tiff', 'gif'] as const
const SHARP_WRITE = ['png', 'jpg', 'webp', 'avif', 'tiff', 'gif'] as const
const MAGICK_READ = [...FORMAT_IDS]
const MAGICK_WRITE = ['png', 'jpg', 'webp', 'avif', 'tiff', 'gif', 'bmp'] as const

const LOSSY_DEFAULT: ConvertOptions = { quality: 80, keepMetadata: false }
const LOSSLESS_DEFAULT: ConvertOptions = { keepMetadata: false }

const SEEDS: readonly FormatSeed[] = [
  {
    id: 'heic',
    label: 'HEIC',
    extensions: ['heic', 'heif'],
    mime: 'image/heic',
    kind: 'image',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'png',
    label: 'PNG',
    extensions: ['png'],
    mime: 'image/png',
    kind: 'image',
    defaultOptions: { ...LOSSLESS_DEFAULT }
  },
  {
    id: 'jpg',
    label: 'JPG',
    extensions: ['jpg', 'jpeg'],
    mime: 'image/jpeg',
    kind: 'image',
    defaultOptions: { ...LOSSY_DEFAULT }
  },
  {
    id: 'webp',
    label: 'WEBP',
    extensions: ['webp'],
    mime: 'image/webp',
    kind: 'image',
    defaultOptions: { ...LOSSY_DEFAULT }
  },
  {
    id: 'avif',
    label: 'AVIF',
    extensions: ['avif'],
    mime: 'image/avif',
    kind: 'image',
    defaultOptions: { ...LOSSY_DEFAULT }
  },
  {
    id: 'tiff',
    label: 'TIFF',
    extensions: ['tif', 'tiff'],
    mime: 'image/tiff',
    kind: 'image',
    defaultOptions: { ...LOSSLESS_DEFAULT }
  },
  {
    id: 'gif',
    label: 'GIF',
    extensions: ['gif'],
    mime: 'image/gif',
    kind: 'image',
    defaultOptions: { ...LOSSLESS_DEFAULT }
  },
  {
    id: 'bmp',
    label: 'BMP',
    extensions: ['bmp'],
    mime: 'image/bmp',
    kind: 'image',
    defaultOptions: { ...LOSSLESS_DEFAULT }
  }
]

export const FORMAT_MATRIX: Record<FormatId, FormatSpec> = Object.fromEntries(
  SEEDS.map((seed) => {
    const engines: Record<EngineId, EngineCapability> = {
      sharp: {
        read: (SHARP_READ as readonly string[]).includes(seed.id),
        write: (SHARP_WRITE as readonly string[]).includes(seed.id)
      },
      magick: {
        read: (MAGICK_READ as readonly string[]).includes(seed.id),
        write: (MAGICK_WRITE as readonly string[]).includes(seed.id)
      }
    }

    return [
      seed.id,
      {
        ...seed,
        canRead: engines.sharp.read || engines.magick.read,
        canWrite: engines.sharp.write || engines.magick.write,
        engines
      }
    ]
  })
) as Record<FormatId, FormatSpec>

export const FORMAT_LIST: readonly FormatSpec[] = FORMAT_IDS.map((id) => FORMAT_MATRIX[id])

export function getFormat(id: FormatId): FormatDef {
  const spec = FORMAT_MATRIX[id]
  return {
    id: spec.id,
    label: spec.label,
    extensions: [...spec.extensions],
    mime: spec.mime,
    kind: spec.kind,
    canRead: spec.canRead,
    canWrite: spec.canWrite,
    defaultOptions: { ...spec.defaultOptions }
  }
}

export function getFormats(): FormatDef[] {
  return FORMAT_IDS.map(getFormat)
}

export function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && (FORMAT_IDS as readonly string[]).includes(value)
}

export function detectFormat(filePath: string): FormatId | null {
  const extension = extname(filePath).slice(1).toLowerCase()
  if (extension === '') return null

  for (const spec of FORMAT_LIST) {
    if (spec.extensions.includes(extension)) return spec.id
  }

  return null
}

export function isSupported(from: FormatId, to: FormatId): boolean {
  if (!isFormatId(from) || !isFormatId(to)) return false

  return engineCanConvert('sharp', from, to) || engineCanConvert('magick', from, to)
}

export function resolveOutputFormat(from: FormatId, to: FormatId): FormatId | null {
  return isSupported(from, to) ? to : null
}

export function engineCanConvert(engine: EngineId, from: FormatId, to: FormatId): boolean {
  if (!isFormatId(from) || !isFormatId(to)) return false

  const source = FORMAT_MATRIX[from].engines[engine]
  const target = FORMAT_MATRIX[to].engines[engine]
  return source.read && target.write
}

export function resolveOptions(to: FormatId, options: ConvertOptions = {}): ConvertOptions {
  const defaults = FORMAT_MATRIX[to].defaultOptions
  const quality = normalizeQuality(options.quality, defaults.quality)
  const keepMetadata = options.keepMetadata ?? defaults.keepMetadata ?? false

  return {
    ...(quality === undefined ? {} : { quality }),
    keepMetadata
  }
}

function normalizeQuality(
  value: number | undefined,
  fallback: number | undefined
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(1, Math.round(value)))
}
