import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { statFiles } from './files'

const tempDirs: string[] = []

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'diat-files-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('statFiles', () => {
  it('returns file info in first-seen order and skips duplicates', async () => {
    const dir = await tempDir()
    const image = join(dir, 'photo.HEIC')
    const notes = join(dir, 'notes.txt')
    const folder = join(dir, 'folder')

    await writeFile(image, 'image bytes')
    await writeFile(notes, 'notes')
    await mkdir(folder)

    await expect(statFiles([image, folder, notes, image])).resolves.toEqual([
      { path: image, name: 'photo.HEIC', size: 11, format: 'heic' },
      { path: notes, name: 'notes.txt', size: 5, format: null }
    ])
  })

  it('skips unreadable paths without failing the batch', async () => {
    const dir = await tempDir()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const missing = join(dir, 'missing.png')

    await expect(statFiles([missing])).resolves.toEqual([])
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain(missing)
  })

  it('returns an empty list for no paths', async () => {
    await expect(statFiles([])).resolves.toEqual([])
  })
})
