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
const MAGICK_READ = ['heic', 'png', 'jpg', 'webp', 'avif', 'tiff', 'gif', 'bmp', 'pdf'] as const
const MAGICK_WRITE = ['png', 'jpg', 'webp', 'avif', 'tiff', 'gif', 'bmp', 'pdf'] as const
const FFMPEG_FORMATS = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'mp4', 'mov', 'webm', 'mkv'] as const
const PANDOC_FORMATS = ['txt', 'md', 'html', 'docx', 'odt'] as const

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
  },
  {
    id: 'mp3',
    label: 'MP3',
    extensions: ['mp3'],
    mime: 'audio/mpeg',
    kind: 'audio',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'wav',
    label: 'WAV',
    extensions: ['wav'],
    mime: 'audio/wav',
    kind: 'audio',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'flac',
    label: 'FLAC',
    extensions: ['flac'],
    mime: 'audio/flac',
    kind: 'audio',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'aac',
    label: 'AAC',
    extensions: ['aac'],
    mime: 'audio/aac',
    kind: 'audio',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'ogg',
    label: 'OGG',
    extensions: ['ogg', 'oga'],
    mime: 'audio/ogg',
    kind: 'audio',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'mp4',
    label: 'MP4',
    extensions: ['mp4', 'm4v'],
    mime: 'video/mp4',
    kind: 'video',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'mov',
    label: 'MOV',
    extensions: ['mov'],
    mime: 'video/quicktime',
    kind: 'video',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'webm',
    label: 'WEBM',
    extensions: ['webm'],
    mime: 'video/webm',
    kind: 'video',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'mkv',
    label: 'MKV',
    extensions: ['mkv'],
    mime: 'video/x-matroska',
    kind: 'video',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'pdf',
    label: 'PDF',
    extensions: ['pdf'],
    mime: 'application/pdf',
    kind: 'document',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'txt',
    label: 'Text',
    extensions: ['txt'],
    mime: 'text/plain',
    kind: 'document',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'md',
    label: 'Markdown',
    extensions: ['md', 'markdown'],
    mime: 'text/markdown',
    kind: 'document',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'html',
    label: 'HTML',
    extensions: ['html', 'htm'],
    mime: 'text/html',
    kind: 'document',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'docx',
    label: 'DOCX',
    extensions: ['docx'],
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'document',
    defaultOptions: { keepMetadata: false }
  },
  {
    id: 'odt',
    label: 'ODT',
    extensions: ['odt'],
    mime: 'application/vnd.oasis.opendocument.text',
    kind: 'document',
    defaultOptions: { keepMetadata: false }
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
      },
      ffmpeg: {
        read: (FFMPEG_FORMATS as readonly string[]).includes(seed.id),
        write: (FFMPEG_FORMATS as readonly string[]).includes(seed.id)
      },
      pandoc: {
        read: (PANDOC_FORMATS as readonly string[]).includes(seed.id),
        write: (PANDOC_FORMATS as readonly string[]).includes(seed.id)
      }
    }

    return [
      seed.id,
      {
        ...seed,
        canRead:
          engines.sharp.read || engines.magick.read || engines.ffmpeg.read || engines.pandoc.read,
        canWrite:
          engines.sharp.write ||
          engines.magick.write ||
          engines.ffmpeg.write ||
          engines.pandoc.write,
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

  return (
    engineCanConvert('sharp', from, to) ||
    engineCanConvert('magick', from, to) ||
    engineCanConvert('ffmpeg', from, to) ||
    engineCanConvert('pandoc', from, to)
  )
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

export function isAudioFormat(id: FormatId | null): boolean {
  return id !== null && FORMAT_MATRIX[id].kind === 'audio'
}

export function resolveOptions(to: FormatId, options: ConvertOptions = {}): ConvertOptions {
  const defaults = FORMAT_MATRIX[to].defaultOptions
  const quality = normalizeQuality(options.quality, defaults.quality)
  const keepMetadata = options.keepMetadata ?? defaults.keepMetadata ?? false
  const resizeWidth = normalizeDimension(options.resizeWidth)
  const resizeHeight = normalizeDimension(options.resizeHeight)
  const backgroundColor = normalizeBackgroundColor(options.backgroundColor)

  return {
    ...(quality === undefined ? {} : { quality }),
    keepMetadata,
    ...(resizeWidth === undefined ? {} : { resizeWidth }),
    ...(resizeHeight === undefined ? {} : { resizeHeight }),
    ...(backgroundColor === undefined ? {} : { backgroundColor })
  }
}

function normalizeQuality(
  value: number | undefined,
  fallback: number | undefined
): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(1, Math.round(value)))
}

function normalizeDimension(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 20000) {
    return undefined
  }
  return value
}

function normalizeBackgroundColor(value: string | undefined): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value)
    ? value.toLowerCase()
    : undefined
}
