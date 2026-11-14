import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import type { ConvertOptions, FormatId } from '@shared/types'
import { tempPathFor } from './atomic'
import { sharpEngine } from './sharpEngine'

const SAMPLE_DIR = join(process.cwd(), 'samples')
const HAS_SAMPLES = existsSync(SAMPLE_DIR)
const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'diat-sharp-'))
  tempDirs.push(dir)
  return dir
}

async function convert(
  from: FormatId,
  to: FormatId,
  sampleName: string,
  options: ConvertOptions = {},
  signal?: AbortSignal
): Promise<{ outputPath: string; dir: string }> {
  const dir = await tempDir()
  const outputPath = join(dir, `${sampleName.replace(/\.[^.]+$/, '')}-out.${to}`)

  await sharpEngine.convert({
    jobId: 'job-1',
    inputPath: join(SAMPLE_DIR, sampleName),
    outputPath,
    from,
    to,
    options,
    signal
  })

  return { outputPath, dir }
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }))
  )
})

describe.runIf(HAS_SAMPLES)('sharpEngine integration', () => {
  it('converts an AVIF sample to PNG', async () => {
    const inputPath = join(SAMPLE_DIR, 'modern.avif')
    const source = await sharp(inputPath).metadata()
    const { outputPath } = await convert('avif', 'png', 'modern.avif')

    const output = await sharp(outputPath).metadata()
    expect(output.format).toBe('png')
    expect(output.width).toBe(source.width)
    expect(output.height).toBe(source.height)
  })

  it('flattens transparency onto white for JPG output', async () => {
    const { outputPath } = await convert('png', 'jpg', 'transparent.png')

    const { data, info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true })

    expect(info.channels).toBe(3)
    expect(data[0]).toBeGreaterThan(245)
    expect(data[1]).toBeGreaterThan(90)
    expect(data[1]).toBeLessThan(115)
    expect(data[2]).toBeGreaterThan(90)
    expect(data[2]).toBeLessThan(115)
  })

  it('preserves animation when converting GIF to WEBP or GIF', async () => {
    const toWebp = await convert('gif', 'webp', 'anim.gif')
    const webp = await sharp(await readFile(toWebp.outputPath), { animated: true }).metadata()
    expect(webp.pages).toBe(20)
    expect(webp.pageHeight).toBe(240)

    const toGif = await convert('gif', 'gif', 'anim.gif')
    const gif = await sharp(await readFile(toGif.outputPath), { animated: true }).metadata()
    expect(gif.pages).toBe(20)
    expect(gif.pageHeight).toBe(240)
  })

  it('converts a 50 MP image', async () => {
    const { outputPath } = await convert('jpg', 'webp', 'large-50mp.jpg')
    const output = await sharp(outputPath).metadata()

    expect(output.format).toBe('webp')
    expect((output.width ?? 0) * (output.height ?? 0)).toBe(50_000_000)
  })

  it('handles paths with spaces and unicode', async () => {
    const dir = await tempDir()
    const nested = join(dir, 'spaced ünicode dir')
    const inputPath = join(nested, 'café photo.png')
    const outputPath = join(nested, 'café photo.jpg')

    await mkdir(nested)
    await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#3366cc' }
    })
      .png()
      .toFile(inputPath)

    await sharpEngine.convert({
      jobId: 'unicode',
      inputPath,
      outputPath,
      from: 'png',
      to: 'jpg',
      options: {}
    })

    const output = await sharp(outputPath).metadata()
    expect(output.format).toBe('jpeg')
  })

  it('applies EXIF orientation and strips metadata by default', async () => {
    const dir = await tempDir()
    const inputPath = join(dir, 'oriented.jpg')
    const outputPath = join(dir, 'oriented.png')

    await sharp({
      create: { width: 40, height: 20, channels: 3, background: '#ff0000' }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(inputPath)

    await sharpEngine.convert({
      jobId: 'orient',
      inputPath,
      outputPath,
      from: 'jpg',
      to: 'png',
      options: {}
    })

    const output = await sharp(outputPath).metadata()
    expect(output.width).toBe(20)
    expect(output.height).toBe(40)
    expect(output.exif).toBeUndefined()
  })

  it('keeps EXIF when explicitly requested', async () => {
    const dir = await tempDir()
    const inputPath = join(dir, 'metadata.jpg')
    const outputPath = join(dir, 'metadata-out.jpg')

    await sharp({
      create: { width: 40, height: 20, channels: 3, background: '#00ff00' }
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toFile(inputPath)

    await sharpEngine.convert({
      jobId: 'metadata',
      inputPath,
      outputPath,
      from: 'jpg',
      to: 'jpg',
      options: { keepMetadata: true }
    })

    const output = await sharp(outputPath).metadata()
    expect(output.exif).toBeDefined()
    expect(output.orientation).toBe(1)
  })

  it('reports a corrupt input and removes the temp file', async () => {
    const dir = await tempDir()
    const outputPath = join(dir, 'corrupt.png')

    await expect(
      sharpEngine.convert({
        jobId: 'corrupt',
        inputPath: join(SAMPLE_DIR, 'corrupt.jpg'),
        outputPath,
        from: 'jpg',
        to: 'png',
        options: {}
      })
    ).rejects.toMatchObject({ code: 'UNREADABLE_FILE' })

    expect(existsSync(outputPath)).toBe(false)
    expect(existsSync(tempPathFor(outputPath, 'corrupt'))).toBe(false)
  })

  it('cancels before writing anything', async () => {
    const dir = await tempDir()
    const outputPath = join(dir, 'cancelled.png')
    const controller = new AbortController()
    controller.abort()

    await expect(
      sharpEngine.convert({
        jobId: 'cancel-me',
        inputPath: join(SAMPLE_DIR, 'transparent.png'),
        outputPath,
        from: 'png',
        to: 'png',
        options: {},
        signal: controller.signal
      })
    ).rejects.toMatchObject({ code: 'CANCELLED' })

    expect(existsSync(outputPath)).toBe(false)
    expect(existsSync(tempPathFor(outputPath, 'cancel-me'))).toBe(false)
  })
})
