import { describe, expect, it } from 'vitest'
import type { ConversionEngine, EngineId, FormatId } from '@shared/types'
import { EngineRegistry, resolveEngine } from './engine'

function fakeEngine(
  id: EngineId,
  accepts: (from: FormatId, to: FormatId) => boolean
): ConversionEngine {
  return {
    id,
    canConvert: accepts,
    async convert(input) {
      return {
        jobId: input.jobId,
        outputPath: input.outputPath,
        engine: id,
        durationMs: 0
      }
    }
  }
}

describe('resolveEngine', () => {
  it('returns the first matching engine in priority order', () => {
    const sharp = fakeEngine('sharp', () => true)
    const magick = fakeEngine('magick', () => true)

    const resolution = resolveEngine([sharp, magick], 'png', 'jpg')

    expect(resolution.ok).toBe(true)
    if (resolution.ok) expect(resolution.engine).toBe(sharp)
  })

  it('falls through to a later engine when the first declines', () => {
    const sharp = fakeEngine('sharp', (from, to) => !(from === 'bmp' && to === 'png'))
    const magick = fakeEngine('magick', (from, to) => from === 'bmp' && to === 'png')

    const resolution = resolveEngine([sharp, magick], 'bmp', 'png')

    expect(resolution.ok).toBe(true)
    if (resolution.ok) expect(resolution.engine).toBe(magick)
  })

  it('returns a typed error when no engine matches', () => {
    const resolution = resolveEngine([], 'heic', 'heic')

    expect(resolution.ok).toBe(false)
    if (!resolution.ok) {
      expect(resolution.error.code).toBe('UNSUPPORTED_CONVERSION')
      expect(resolution.error.message).toContain('HEIC')
    }
  })
})

describe('EngineRegistry', () => {
  it('copies its input and exposes a defensive list', () => {
    const sharp = fakeEngine('sharp', () => true)
    const magick = fakeEngine('magick', () => true)
    const input: ConversionEngine[] = [sharp, magick]
    const registry = new EngineRegistry(input)

    input.pop()
    const listed = registry.list() as ConversionEngine[]
    listed.pop()

    expect(registry.list()).toEqual([sharp, magick])
  })

  it('keeps registration order and resolves through it', () => {
    const sharp = fakeEngine('sharp', () => false)
    const magick = fakeEngine('magick', () => true)
    const registry = new EngineRegistry([sharp, magick])

    expect(registry.list()).toEqual([sharp, magick])

    const resolution = registry.resolve('png', 'bmp')
    expect(resolution.ok).toBe(true)
    if (resolution.ok) expect(resolution.engine).toBe(magick)
  })
})
