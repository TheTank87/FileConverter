import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  SETTINGS_VERSION,
  createSettingsStore,
  sanitizeSettingsPatch
} from './settings'

const tempDirs: string[] = []

async function createTempStore(): Promise<{
  filePath: string
  store: ReturnType<typeof createSettingsStore>
}> {
  const dir = await mkdtemp(join(tmpdir(), 'diat-settings-'))
  tempDirs.push(dir)

  const filePath = join(dir, 'settings.json')
  return { filePath, store: createSettingsStore(filePath) }
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('settings store', () => {
  it('returns defaults when the file is missing and does not write one', async () => {
    const { filePath, store } = await createTempStore()

    await expect(store.load()).resolves.toEqual(DEFAULT_SETTINGS)
    await store.flush()

    await expect(readFile(filePath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes a versioned snapshot on the first change', async () => {
    const { filePath, store } = await createTempStore()
    await store.load()

    const updated = store.update({ theme: 'dark', defaultFormat: 'webp' })
    await store.flush()

    const written: unknown = JSON.parse(await readFile(filePath, 'utf8'))
    expect(written).toEqual({ version: SETTINGS_VERSION, ...updated })
  })

  it('falls back to defaults for corrupt or future-version files', async () => {
    const corrupt = await createTempStore()
    await writeFile(corrupt.filePath, '{not json', 'utf8')
    await expect(corrupt.store.load()).resolves.toEqual(DEFAULT_SETTINGS)

    const future = await createTempStore()
    await writeFile(
      future.filePath,
      JSON.stringify({ version: SETTINGS_VERSION + 1, theme: 'dark', defaultFormat: 'gif' }),
      'utf8'
    )
    await expect(future.store.load()).resolves.toEqual(DEFAULT_SETTINGS)
  })
})

describe('sanitizeSettingsPatch', () => {
  it('drops unknown fields and invalid values', () => {
    expect(sanitizeSettingsPatch(null)).toEqual({})
    expect(
      sanitizeSettingsPatch({
        theme: 'neon',
        defaultFormat: 'svg',
        outputDir: 'relative/path',
        extra: true
      })
    ).toEqual({})
  })

  it('keeps valid fields and an absolute output directory', () => {
    const outputDir = join(tmpdir(), 'diat-output')

    expect(sanitizeSettingsPatch({ theme: 'light', defaultFormat: 'gif', outputDir })).toEqual({
      theme: 'light',
      defaultFormat: 'gif',
      outputDir
    })
  })
})
