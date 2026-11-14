import { describe, expect, it } from 'vitest'
import type { BinaryResolution } from '../binaries'
import { createFfmpegEngine } from './ffmpegEngine'

describe('ffmpeg engine', () => {
  it('accepts audio conversions and rejects image conversions', () => {
    const engine = createFfmpegEngine({
      resolveBinary: () => ({ ok: true, path: '/usr/bin/ffmpeg' })
    })

    expect(engine.canConvert('wav', 'mp3')).toBe(true)
    expect(engine.canConvert('flac', 'ogg')).toBe(true)
    expect(engine.canConvert('png', 'mp3')).toBe(false)
  })

  it('reports a missing binary before starting a conversion', async () => {
    const missing: BinaryResolution = {
      ok: false,
      error: { code: 'ENGINE_MISSING', message: 'FFmpeg is missing.' }
    }
    const engine = createFfmpegEngine({ resolveBinary: () => missing })

    await expect(
      engine.convert({
        jobId: '00000000-0000-4000-8000-000000000001',
        inputPath: '/tmp/input.wav',
        outputPath: '/tmp/output.mp3',
        from: 'wav',
        to: 'mp3',
        options: {}
      })
    ).rejects.toEqual(missing.error)
  })
})
