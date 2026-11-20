import { describe, expect, it } from 'vitest'
import type { BinaryResolution } from '../binaries'
import { buildFfmpegArgs, createFfmpegEngine } from './ffmpegEngine'

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

  it('sets an explicit muxer for a .tmp video output path', () => {
    const args = buildFfmpegArgs(
      {
        jobId: 'job',
        inputPath: '/tmp/flyingpigs.MOV',
        outputPath: '/tmp/flyingpigs.mp4',
        from: 'mov',
        to: 'mp4',
        options: {}
      },
      '/tmp/.flyingpigs.mp4.tmp'
    )

    expect(args).toEqual([
      '-y',
      '-i',
      '/tmp/flyingpigs.MOV',
      '-map_metadata',
      '-1',
      '-f',
      'mp4',
      '-progress',
      'pipe:2',
      '/tmp/.flyingpigs.mp4.tmp'
    ])
  })

  it('uses the AAC ADTS muxer and drops video for audio sources', () => {
    const args = buildFfmpegArgs(
      {
        jobId: 'job',
        inputPath: '/tmp/song.m4a',
        outputPath: '/tmp/song.aac',
        from: 'mp4',
        to: 'aac',
        options: { keepMetadata: true }
      },
      '/tmp/.song.aac.tmp'
    )

    expect(args).toContain('-vn')
    expect(args).toContain('adts')
    expect(args).not.toContain('-map_metadata')
  })

  it('rejects targets without a configured muxer', () => {
    expect(() =>
      buildFfmpegArgs(
        {
          jobId: 'job',
          inputPath: '/tmp/image.png',
          outputPath: '/tmp/image.jpg',
          from: 'png',
          to: 'jpg',
          options: {}
        },
        '/tmp/.image.jpg.tmp'
      )
    ).toThrow('No FFmpeg muxer configured for jpg.')
  })
})
