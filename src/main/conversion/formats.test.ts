import { describe, expect, it } from 'vitest'
import {
  detectFormat,
  engineCanConvert,
  FORMAT_LIST,
  getFormats,
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
  })

  it('returns null for missing or unknown extensions', () => {
    expect(detectFormat('README')).toBeNull()
    expect(detectFormat('.gitignore')).toBeNull()
    expect(detectFormat('archive.tar.gz')).toBeNull()
  })
})

describe('format matrix', () => {
  it('declares all v1 formats exactly once', () => {
    expect(FORMAT_LIST).toHaveLength(8)
    expect(new Set(FORMAT_LIST.map((format) => format.id)).size).toBe(8)
    expect(getFormats().every((format) => format.canRead)).toBe(true)
  })

  it('marks HEIC read-only and BMP ImageMagick-only', () => {
    expect(isSupported('heic', 'png')).toBe(true)
    expect(isSupported('png', 'heic')).toBe(false)
    expect(isSupported('bmp', 'png')).toBe(true)
    expect(isSupported('png', 'bmp')).toBe(true)
    expect(isSupported('heic', 'bmp')).toBe(true)
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

  it('clamps quality and accepts explicit metadata choice', () => {
    expect(resolveOptions('jpg', { quality: 0 })).toEqual({
      quality: 1,
      keepMetadata: false
    })
    expect(resolveOptions('webp', { quality: 150, keepMetadata: true })).toEqual({
      quality: 100,
      keepMetadata: true
    })
  })
})
