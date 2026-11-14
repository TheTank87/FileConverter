import { describe, expect, it } from 'vitest'
import { FORMAT_IDS, type FormatId } from '@shared/types'
import {
  detectFormat,
  engineCanConvert,
  FORMAT_LIST,
  FORMAT_MATRIX,
  getFormat,
  getFormats,
  isFormatId,
  isSupported,
  resolveOptions,
  resolveOutputFormat
} from './formats'

describe('detectFormat', () => {
  it('maps known extensions case-insensitively', () => {
    expect(detectFormat('IMG_0001.HEIC')).toBe('heic')
    expect(detectFormat('C:\\photos\\image.heif')).toBe('heic')
    expect(detectFormat('photo.jpeg')).toBe('jpg')
    expect(detectFormat('scan.tif')).toBe('tiff')
    expect(detectFormat('clip.WEBP')).toBe('webp')
    expect(detectFormat('recording.MP3')).toBe('mp3')
    expect(detectFormat('voice.oga')).toBe('ogg')
  })

  it('returns null for missing or unknown extensions', () => {
    expect(detectFormat('README')).toBeNull()
    expect(detectFormat('image.')).toBeNull()
    expect(detectFormat('.gitignore')).toBeNull()
    expect(detectFormat('.PNG')).toBeNull()
    expect(detectFormat('archive.tar.gz')).toBeNull()
  })

  it('uses only the final extension for multi-dot names', () => {
    expect(detectFormat('holiday.2024.HEIC')).toBe('heic')
    expect(detectFormat('C:\\photos.v2\\image.JPEG')).toBe('jpg')
    expect(detectFormat('backup.photo.png.old')).toBeNull()
  })
})

describe('format matrix', () => {
  it('declares every format exactly once', () => {
    expect(FORMAT_LIST).toHaveLength(FORMAT_IDS.length)
    expect(FORMAT_LIST.map((format) => format.id)).toEqual([...FORMAT_IDS])
    expect(new Set(FORMAT_LIST.map((format) => format.id)).size).toBe(FORMAT_IDS.length)
    expect(getFormats().every((format) => format.canRead)).toBe(true)
    expect(FORMAT_LIST.filter((format) => !format.canWrite).map((format) => format.id)).toEqual([
      'heic'
    ])
  })

  it('maps every extension to exactly one format', () => {
    const extensions = FORMAT_LIST.flatMap((format) => format.extensions)

    expect(new Set(extensions).size).toBe(extensions.length)
    for (const format of FORMAT_LIST) {
      expect(format.extensions.length).toBeGreaterThan(0)
      for (const extension of format.extensions) {
        expect(extension).toBe(extension.toLowerCase())
        expect(extension).not.toContain('.')
        expect(detectFormat(`file.${extension}`)).toBe(format.id)
      }
    }
  })

  it('keeps default options inside the valid range', () => {
    for (const format of FORMAT_LIST) {
      const { quality, keepMetadata } = format.defaultOptions
      if (quality !== undefined) {
        expect(Number.isInteger(quality)).toBe(true)
        expect(quality).toBeGreaterThanOrEqual(1)
        expect(quality).toBeLessThanOrEqual(100)
      }
      if (keepMetadata !== undefined) expect(typeof keepMetadata).toBe('boolean')
    }

    expect(isFormatId('png')).toBe(true)
    expect(isFormatId('svg')).toBe(false)
    expect(isFormatId(null)).toBe(false)
  })

  it('returns defensive copies from getFormat', () => {
    const format = getFormat('png')
    format.extensions.push('mutated')
    format.defaultOptions.quality = 7

    expect(FORMAT_MATRIX.png.extensions).toEqual(['png'])
    expect(FORMAT_MATRIX.png.defaultOptions).toEqual({ keepMetadata: false })
  })

  it('marks HEIC read-only and BMP ImageMagick-only', () => {
    expect(isSupported('heic', 'png')).toBe(true)
    expect(isSupported('png', 'heic')).toBe(false)
    expect(isSupported('bmp', 'png')).toBe(true)
    expect(isSupported('png', 'bmp')).toBe(true)
    expect(isSupported('heic', 'bmp')).toBe(true)
  })

  it('routes audio formats through FFmpeg', () => {
    expect(engineCanConvert('ffmpeg', 'wav', 'mp3')).toBe(true)
    expect(engineCanConvert('ffmpeg', 'flac', 'ogg')).toBe(true)
    expect(engineCanConvert('magick', 'wav', 'mp3')).toBe(false)
    expect(isSupported('mp3', 'wav')).toBe(true)
  })

  it('routes video formats through FFmpeg', () => {
    expect(detectFormat('movie.MP4')).toBe('mp4')
    expect(detectFormat('movie.mkv')).toBe('mkv')
    expect(engineCanConvert('ffmpeg', 'mp4', 'webm')).toBe(true)
    expect(engineCanConvert('ffmpeg', 'mov', 'mkv')).toBe(true)
    expect(isSupported('webm', 'mp4')).toBe(true)
  })

  it('treats unknown format ids as unsupported', () => {
    expect(engineCanConvert('sharp', 'svg' as FormatId, 'png')).toBe(false)
    expect(isSupported('png', 'svg' as FormatId)).toBe(false)
  })

  it('routes format capabilities to the correct engine', () => {
    expect(engineCanConvert('sharp', 'heic', 'png')).toBe(false)
    expect(engineCanConvert('magick', 'heic', 'png')).toBe(true)
    expect(engineCanConvert('sharp', 'bmp', 'png')).toBe(false)
    expect(engineCanConvert('sharp', 'png', 'bmp')).toBe(false)
    expect(engineCanConvert('magick', 'bmp', 'png')).toBe(true)
    expect(engineCanConvert('magick', 'png', 'bmp')).toBe(true)
    expect(engineCanConvert('magick', 'png', 'heic')).toBe(false)
  })

  it('resolves an output format only when some engine supports it', () => {
    expect(resolveOutputFormat('heic', 'png')).toBe('png')
    expect(resolveOutputFormat('png', 'heic')).toBeNull()
    expect(resolveOutputFormat('heic', 'heic')).toBeNull()
  })
})

describe('resolveOptions', () => {
  it('applies per-format defaults', () => {
    expect(resolveOptions('jpg')).toEqual({ quality: 80, keepMetadata: false })
    expect(resolveOptions('png')).toEqual({ keepMetadata: false })
  })

  it('clamps and rounds quality and accepts explicit metadata choice', () => {
    expect(resolveOptions('jpg', { quality: 0 })).toEqual({
      quality: 1,
      keepMetadata: false
    })
    expect(resolveOptions('webp', { quality: 150, keepMetadata: true })).toEqual({
      quality: 100,
      keepMetadata: true
    })
    expect(resolveOptions('jpg', { quality: 72.6 })).toEqual({
      quality: 73,
      keepMetadata: false
    })
  })

  it('falls back to the format default for unusable quality values', () => {
    for (const quality of [Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(resolveOptions('jpg', { quality })).toEqual({
        quality: 80,
        keepMetadata: false
      })
    }

    expect(resolveOptions('png', { quality: 50 })).toEqual({
      quality: 50,
      keepMetadata: false
    })
  })

  it('normalizes resize and background options', () => {
    expect(
      resolveOptions('jpg', {
        resizeWidth: 1200,
        resizeHeight: 800,
        backgroundColor: '#3366CC'
      })
    ).toEqual({
      quality: 80,
      keepMetadata: false,
      resizeWidth: 1200,
      resizeHeight: 800,
      backgroundColor: '#3366cc'
    })
    expect(resolveOptions('jpg', { resizeWidth: 0, resizeHeight: 20001 })).toEqual({
      quality: 80,
      keepMetadata: false
    })
  })
})
