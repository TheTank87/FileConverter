import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import type { BinaryResolution } from '../binaries'
import { createMagickEngine } from './magickEngine'

const SAMPLE_DIR = join(process.cwd(), 'samples')
const MAGICK_PATH = join(
  process.cwd(),
  'resources',
  'bin',
  `${process.platform}-${process.arch}`,
  process.platform === 'win32' ? 'magick.exe' : 'magick'
)
const HAS_MAGICK = existsSync(MAGICK_PATH)
const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'diat-magick-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  )
})

describe('magickEngine errors', () => {
  it('surfaces a missing-binary error before touching files', async () => {
    const dir = await tempDir()
    const engine = createMagickEngine({
      resolveBinary: (): BinaryResolution => ({
        ok: false,
        error: { code: 'ENGINE_MISSING', message: 'ImageMagick is missing.' }
      })
    })

    await expect(
      engine.convert({
        jobId: 'missing',
        inputPath: join(SAMPLE_DIR, 'transparent.png'),
        outputPath: join(dir, 'out.bmp'),
        from: 'png',
        to: 'bmp',
        options: {}
      })
    ).rejects.toMatchObject({ code: 'ENGINE_MISSING' })
  })

  it('rejects conversions it cannot perform', async () => {
    const engine = createMagickEngine()

    await expect(
      engine.convert({
        jobId: 'unsupported',
        inputPath: 'input.png',
        outputPath: 'output.heic',
        from: 'png',
        to: 'heic',
        options: {}
      })
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_CONVERSION' })
  })
})

describe.runIf(HAS_MAGICK && existsSync(SAMPLE_DIR))('magickEngine integration', () => {
  it('converts the HEIC sample to PNG', async () => {
    const dir = await tempDir()
    const outputPath = join(dir, 'iphone.png')
    const engine = createMagickEngine({
      resolveBinary: (): BinaryResolution => ({ ok: true, path: MAGICK_PATH })
    })

    await engine.convert({
      jobId: 'heic-to-png',
      inputPath: join(SAMPLE_DIR, 'iphone.heic'),
      outputPath,
      from: 'heic',
      to: 'png',
      options: {}
    })

    const output = await sharp(outputPath).metadata()
    expect(output.format).toBe('png')
    expect(output.width).toBe(1280)
    expect(output.height).toBe(960)
  })

  it('converts BMP to PNG through the ImageMagick fallback', async () => {
    const dir = await tempDir()
    const outputPath = join(dir, 'legacy.png')
    const engine = createMagickEngine({
      resolveBinary: (): BinaryResolution => ({ ok: true, path: MAGICK_PATH })
    })

    const result = await engine.convert({
      jobId: 'bmp-to-png',
      inputPath: join(SAMPLE_DIR, 'legacy.bmp'),
      outputPath,
      from: 'bmp',
      to: 'png',
      options: {}
    })

    expect(result.engine).toBe('magick')

    const output = await sharp(outputPath).metadata()
    expect(output.format).toBe('png')
    expect(output.width).toBeGreaterThan(0)
    expect(output.height).toBeGreaterThan(0)
  })

  it('writes a BMP when targeted via ImageMagick', async () => {
    const dir = await tempDir()
    const outputPath = join(dir, 'transparent.bmp')
    const engine = createMagickEngine({
      resolveBinary: (): BinaryResolution => ({ ok: true, path: MAGICK_PATH })
    })

    await engine.convert({
      jobId: 'png-to-bmp',
      inputPath: join(SAMPLE_DIR, 'transparent.png'),
      outputPath,
      from: 'png',
      to: 'bmp',
      options: {}
    })

    const header = await readFile(outputPath)
    expect(header.subarray(0, 2).toString('ascii')).toBe('BM')
  })
})
