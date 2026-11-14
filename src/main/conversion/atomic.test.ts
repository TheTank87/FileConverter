import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { discardTemp, promoteTemp, tempPathFor } from './atomic'

const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'diat-atomic-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('tempPathFor', () => {
  it('places a hidden temp file beside the output', () => {
    expect(tempPathFor(join('root', 'out.png'), 'job-1')).toBe(join('root', '.out.png.job-1.tmp'))
  })

  it('sanitizes job ids so they cannot escape the output directory', () => {
    const outputPath = join('root', 'out.png')
    const tempPath = tempPathFor(outputPath, '../a b/ç.png')

    expect(dirname(tempPath)).toBe(dirname(outputPath))
    expect(tempPath).toBe(join('root', '.out.png.___a_b___png.tmp'))
  })
})

describe('temp file lifecycle', () => {
  it('promotes a temp file to the final output path', async () => {
    const dir = await tempDir()
    const tempPath = tempPathFor(join(dir, 'out.png'), 'job-1')
    const outputPath = join(dir, 'out.png')

    await writeFile(tempPath, 'converted')
    await promoteTemp(tempPath, outputPath)

    expect(existsSync(tempPath)).toBe(false)
    await expect(readFile(outputPath, 'utf8')).resolves.toBe('converted')
  })

  it('discards temp files and ignores missing paths', async () => {
    const dir = await tempDir()
    const tempPath = tempPathFor(join(dir, 'out.png'), 'job-1')

    await writeFile(tempPath, 'partial')
    await discardTemp(tempPath)
    expect(existsSync(tempPath)).toBe(false)

    await expect(discardTemp(tempPath)).resolves.toBeUndefined()
  })
})
