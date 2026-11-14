import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute } from 'node:path'
import {
  FORMAT_IDS,
  THEME_MODES,
  type FormatId,
  type Settings,
  type ThemeMode
} from '@shared/types'

export const SETTINGS_VERSION = 1

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  outputDir: null,
  defaultFormat: 'png',
  theme: 'system'
})

const WRITE_DEBOUNCE_MS = 250

interface SettingsFile extends Settings {
  version: number
}

export interface SettingsStore {
  readonly filePath: string
  load(): Promise<Settings>
  get(): Settings
  update(patch: Partial<Settings>): Settings
  flush(): Promise<void>
}

export function createSettingsStore(filePath: string): SettingsStore {
  let current: Settings = { ...DEFAULT_SETTINGS }
  let loaded = false
  let dirty = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let writeChain: Promise<void> = Promise.resolve()

  function clearTimer(): void {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }

  function writeSnapshot(): Promise<void> {
    clearTimer()
    if (!dirty) return writeChain

    dirty = false
    const snapshot: SettingsFile = { version: SETTINGS_VERSION, ...current }
    const data = `${JSON.stringify(snapshot, null, 2)}\n`

    writeChain = writeChain
      .catch(() => undefined)
      .then(() => writeAtomic(filePath, data))
      .catch((error: unknown) => {
        console.error('[settings] Failed to write settings:', error)
      })

    return writeChain
  }

  function scheduleWrite(): void {
    dirty = true
    clearTimer()
    timer = setTimeout(() => {
      timer = null
      void writeSnapshot()
    }, WRITE_DEBOUNCE_MS)
  }

  function getSettings(): Settings {
    return { ...current }
  }

  return {
    filePath,

    async load(): Promise<Settings> {
      if (loaded) return getSettings()
      loaded = true

      try {
        const raw = await readFile(filePath, 'utf8')
        current = sanitizeSettingsFile(JSON.parse(raw) as unknown)
      } catch (error) {
        if (!isMissingFile(error)) {
          console.error('[settings] Failed to read settings, using defaults:', error)
        }
        current = { ...DEFAULT_SETTINGS }
      }

      return getSettings()
    },

    get: getSettings,

    update(patch: Partial<Settings>): Settings {
      const sanitized = sanitizeSettingsPatch(patch)
      if (Object.keys(sanitized).length === 0) return getSettings()

      current = { ...current, ...sanitized }
      scheduleWrite()
      return getSettings()
    },

    async flush(): Promise<void> {
      await writeSnapshot()
    }
  }
}

export function sanitizeSettingsPatch(value: unknown): Partial<Settings> {
  if (!isRecord(value)) return {}

  const patch: Partial<Settings> = {}

  if (value.outputDir === null) {
    patch.outputDir = null
  } else if (typeof value.outputDir === 'string' && isAbsolute(value.outputDir)) {
    patch.outputDir = value.outputDir
  }

  if (isFormatId(value.defaultFormat)) patch.defaultFormat = value.defaultFormat
  if (isThemeMode(value.theme)) patch.theme = value.theme

  return patch
}

function sanitizeSettingsFile(value: unknown): Settings {
  if (!isRecord(value) || value.version !== SETTINGS_VERSION) {
    return { ...DEFAULT_SETTINGS }
  }

  return {
    outputDir:
      typeof value.outputDir === 'string' && isAbsolute(value.outputDir) ? value.outputDir : null,
    defaultFormat: isFormatId(value.defaultFormat)
      ? value.defaultFormat
      : DEFAULT_SETTINGS.defaultFormat,
    theme: isThemeMode(value.theme) ? value.theme : DEFAULT_SETTINGS.theme
  }
}

async function writeAtomic(filePath: string, data: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })

  const tempPath = `${filePath}.${process.pid}.tmp`

  try {
    await writeFile(tempPath, data, 'utf8')
    await rename(tempPath, filePath)
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFormatId(value: unknown): value is FormatId {
  return typeof value === 'string' && (FORMAT_IDS as readonly string[]).includes(value)
}

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && (THEME_MODES as readonly string[]).includes(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}
