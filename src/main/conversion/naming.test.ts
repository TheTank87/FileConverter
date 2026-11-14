import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveOutputPath } from './naming'

const missing = (): boolean => false
const photos = join('root', 'photos')
const exportsDir = join('root', 'exports')

function source(name: string): string {
  return join(photos, name)
}

describe('resolveOutputPath', () => {
  it('writes beside the source with the target extension', () => {
    expect(resolveOutputPath(source('iphone.heic'), 'png', null, missing)).toBe(
      join(photos, 'iphone.png')
    )
  })

  it('uses the chosen output directory when provided', () => {
    expect(resolveOutputPath(source('iphone.heic'), 'png', exportsDir, missing)).toBe(
      join(exportsDir, 'iphone.png')
    )
  })

  it('keeps multi-dot stems intact', () => {
    expect(resolveOutputPath(source('holiday.2024.heic'), 'png', null, missing)).toBe(
      join(photos, 'holiday.2024.png')
    )
  })

  it('handles names without an extension', () => {
    expect(resolveOutputPath(source('README'), 'png', null, missing)).toBe(
      join(photos, 'README.png')
    )
  })

  it('treats a leading dot as part of the stem', () => {
    expect(resolveOutputPath(source('.hidden'), 'png', null, missing)).toBe(
      join(photos, '.hidden.png')
    )
  })

  it('normalizes uppercase extensions', () => {
    expect(resolveOutputPath(source('PHOTO.HEIC'), 'png', null, missing)).toBe(
      join(photos, 'PHOTO.png')
    )
  })

  it('appends -1 then -2 until a path is free', () => {
    const taken = new Set([join(photos, 'photo.png'), join(photos, 'photo-1.png')])
    const exists = (path: string): boolean => taken.has(path)

    expect(resolveOutputPath(source('photo.heic'), 'png', null, exists)).toBe(
      join(photos, 'photo-2.png')
    )
  })

  it('never returns the source path even when it is not reported as existing', () => {
    expect(resolveOutputPath(source('photo.png'), 'png', null, missing)).toBe(
      join(photos, 'photo-1.png')
    )
  })

  it('allows the same name in a different directory', () => {
    expect(resolveOutputPath(source('photo.png'), 'png', exportsDir, missing)).toBe(
      join(exportsDir, 'photo.png')
    )
  })

  it('uses the canonical extension for aliased formats', () => {
    expect(resolveOutputPath(source('scan.tiff'), 'tiff', null, missing)).toBe(
      join(photos, 'scan.tif')
    )
    expect(resolveOutputPath(source('scan.jpeg'), 'jpg', null, missing)).toBe(
      join(photos, 'scan.jpg')
    )
  })
})
