import { create } from 'zustand'
import type {
  ConvertError,
  ConversionPreset,
  ConvertRequest,
  FileInfo,
  FormatDef,
  FormatId,
  Job,
  JobDoneEvent,
  JobStatus,
  ConvertOptions,
  ProgressEvent,
  RecentConversion,
  Settings,
  ThemeMode
} from '@shared/types'

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  outputDir: null,
  defaultFormat: 'png',
  theme: 'system'
})

export interface AppState {
  files: Job[]
  targetFormat: FormatId
  outputDir: string | null
  formats: FormatDef[]
  settings: Settings
  batchId: string | null
  progress: Record<string, ProgressEvent>
  loading: boolean
  loadError: ConvertError | null
  error: ConvertError | null
  liveMessage: string
  recentConversions: RecentConversion[]
  presets: ConversionPreset[]
  load(): Promise<void>
  addFiles(files: FileInfo[]): void
  pickAndAdd(): Promise<void>
  addPaths(paths: string[]): Promise<void>
  removeFile(jobId: string): void
  setFileFormat(jobId: string, to: FormatId): void
  setFileOptions(jobId: string, options: Partial<ConvertOptions>): void
  moveFile(jobId: string, direction: 'up' | 'down'): void
  savePreset(name: string, to: FormatId, options: ConvertOptions): void
  deletePreset(id: string): void
  applyPreset(id: string): void
  openRecent(id: string): Promise<void>
  revealRecent(id: string): Promise<void>
  setTargetFormat(format: FormatId): void
  setOutputDir(dir: string | null): Promise<void>
  setTheme(theme: ThemeMode): Promise<void>
  start(): Promise<void>
  cancel(): Promise<void>
  handleProgress(event: ProgressEvent): void
  handleJobDone(event: JobDoneEvent): void
  setError(error: ConvertError | null): void
  dismissError(): void
}

export function canConvert(formats: FormatDef[], from: FormatId | null, to: FormatId): boolean {
  if (from === null) return false

  const source = formats.find((format) => format.id === from)
  const target = formats.find((format) => format.id === to)
  return source?.canRead === true && target?.canWrite === true
}

export function isConvertible(job: Job, formats: FormatDef[]): boolean {
  return job.status === 'queued' && canConvert(formats, job.input.format, job.to)
}

export function selectConvertibleFiles(state: AppState): Job[] {
  return state.files.filter((job) => isConvertible(job, state.formats))
}

export function selectAggregateProgress(state: AppState): number {
  if (state.batchId === null) return 0

  const batchJobs = state.files.filter((job) => job.batchId === state.batchId)
  if (batchJobs.length === 0) return 0

  const total = batchJobs.reduce((sum, job) => {
    if (job.status !== 'queued' && job.status !== 'running') return sum + 100
    return sum + (state.progress[job.id]?.percent ?? 0)
  }, 0)

  return Math.round(total / batchJobs.length)
}

function createJob(file: FileInfo, to: FormatId): Job {
  return {
    id: crypto.randomUUID(),
    batchId: '',
    input: file,
    to,
    options: {},
    status: 'queued'
  }
}

const THEME_STORAGE_KEY = 'diat.theme'
const RECENTS_STORAGE_KEY = 'diat.recents'
const PRESETS_STORAGE_KEY = 'diat.presets'
const MAX_RECENTS = 20

function applyTheme(theme: ThemeMode): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme

  // Mirror the saved theme locally so the inline boot script can paint it before settings load.
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Storage can be unavailable under strict privacy settings; settings.json remains canonical.
  }
}

export function unknownError(message: string): ConvertError {
  return { code: 'UNKNOWN', message }
}

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local storage is an enhancement; conversion remains usable if it is unavailable.
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  files: [],
  targetFormat: DEFAULT_SETTINGS.defaultFormat,
  outputDir: DEFAULT_SETTINGS.outputDir,
  formats: [],
  settings: { ...DEFAULT_SETTINGS },
  batchId: null,
  progress: {},
  loading: false,
  loadError: null,
  error: null,
  liveMessage: '',
  recentConversions: readStored<RecentConversion[]>(RECENTS_STORAGE_KEY, []),
  presets: readStored<ConversionPreset[]>(PRESETS_STORAGE_KEY, []),

  async load() {
    if (get().loading) return
    set({ loading: true, loadError: null })

    let loadError: ConvertError | null = null

    try {
      const settingsResult = await window.api.getSettings()
      if (settingsResult.ok) {
        applyTheme(settingsResult.value.theme)
        set({
          settings: settingsResult.value,
          targetFormat: settingsResult.value.defaultFormat,
          outputDir: settingsResult.value.outputDir
        })
      } else {
        loadError = settingsResult.error
      }

      const formatsResult = await window.api.getFormats()
      if (formatsResult.ok) {
        set({ formats: formatsResult.value })
      } else {
        loadError ??= formatsResult.error
      }
    } catch (error) {
      loadError ??= unknownError(error instanceof Error ? error.message : 'Could not load the app.')
    }

    set({ loading: false, loadError })
  },

  addFiles(files) {
    const seen = new Set(get().files.map((job) => job.input.path))
    const additions: Job[] = []
    const targetFormat = get().targetFormat

    for (const file of files) {
      if (seen.has(file.path)) continue
      seen.add(file.path)
      additions.push(createJob(file, targetFormat))
    }

    if (additions.length > 0) set((state) => ({ files: [...state.files, ...additions] }))
  },

  async pickAndAdd() {
    const result = await window.api.pickFiles()
    if (!result.ok) {
      set({ error: result.error })
      return
    }

    get().addFiles(result.value)
  },

  async addPaths(paths) {
    if (paths.length === 0) return

    const result = await window.api.statFiles(paths)
    if (!result.ok) {
      set({ error: result.error })
      return
    }

    get().addFiles(result.value)
  },

  removeFile(jobId) {
    const { files, batchId, progress } = get()
    const job = files.find((candidate) => candidate.id === jobId)
    if (!job) return
    if (job.status === 'running' || (batchId !== null && job.batchId === batchId)) return

    const nextProgress = { ...progress }
    delete nextProgress[jobId]
    set({ files: files.filter((candidate) => candidate.id !== jobId), progress: nextProgress })
  },

  setFileFormat(jobId, to) {
    set((state) => ({
      files: state.files.map((job) =>
        job.id === jobId && job.status === 'queued' && job.batchId === '' ? { ...job, to } : job
      )
    }))
  },

  setFileOptions(jobId, options) {
    set((state) => ({
      files: state.files.map((job) =>
        job.id === jobId && job.status === 'queued' && job.batchId === ''
          ? { ...job, options: { ...job.options, ...options } }
          : job
      )
    }))
  },

  moveFile(jobId, direction) {
    set((state) => {
      const index = state.files.findIndex((job) => job.id === jobId)
      if (index < 0) return {}
      const target = direction === 'up' ? index - 1 : index + 1
      if (target < 0 || target >= state.files.length) return {}
      const files = [...state.files]
      const current = files[index]
      const adjacent = files[target]
      if (current === undefined || adjacent === undefined) return {}
      files[index] = adjacent
      files[target] = current
      return { files }
    })
  },

  savePreset(name, to, options) {
    const trimmed = name.trim()
    if (trimmed === '') return
    const preset: ConversionPreset = {
      id: crypto.randomUUID(),
      name: trimmed.slice(0, 60),
      to,
      options: { ...options }
    }
    set((state) => {
      const presets = [...state.presets, preset]
      writeStored(PRESETS_STORAGE_KEY, presets)
      return { presets }
    })
  },

  deletePreset(id) {
    set((state) => {
      const presets = state.presets.filter((preset) => preset.id !== id)
      writeStored(PRESETS_STORAGE_KEY, presets)
      return { presets }
    })
  },

  applyPreset(id) {
    const preset = get().presets.find((candidate) => candidate.id === id)
    if (!preset) return
    set((state) => ({
      targetFormat: preset.to,
      files: state.files.map((job) =>
        job.status === 'queued' && job.batchId === ''
          ? { ...job, to: preset.to, options: { ...preset.options } }
          : job
      )
    }))
  },

  async openRecent(id) {
    const recent = get().recentConversions.find((item) => item.id === id)
    if (!recent) return
    const result = await window.api.openPath(recent.outputPath)
    if (!result.ok) set({ error: result.error })
  },

  async revealRecent(id) {
    const recent = get().recentConversions.find((item) => item.id === id)
    if (!recent) return
    const result = await window.api.revealInFolder(recent.outputPath)
    if (!result.ok) set({ error: result.error })
  },

  setTargetFormat(format) {
    set((state) => ({
      targetFormat: format,
      settings: { ...state.settings, defaultFormat: format },
      files: state.files.map((job) =>
        job.status === 'queued' && job.batchId === '' ? { ...job, to: format } : job
      )
    }))

    void window.api
      .setSettings({ defaultFormat: format })
      .then((result) => {
        if (!result.ok) {
          set({ error: result.error })
          return
        }

        set({ settings: result.value })
      })
      .catch((error: unknown) => {
        set({
          error: unknownError(error instanceof Error ? error.message : 'Could not save settings.')
        })
      })
  },

  async setOutputDir(dir) {
    const previous = get().outputDir
    set({ outputDir: dir })

    const result = await window.api.setSettings({ outputDir: dir })
    if (!result.ok) {
      set({ outputDir: previous, error: result.error })
      return
    }

    set({ settings: result.value, outputDir: result.value.outputDir })
  },

  async setTheme(theme) {
    applyTheme(theme)
    set((state) => ({ settings: { ...state.settings, theme } }))

    const result = await window.api.setSettings({ theme })
    if (!result.ok) {
      set({ error: result.error })
      return
    }

    set({ settings: result.value })
  },

  async start() {
    const state = get()
    if (state.batchId !== null) return

    const selected = selectConvertibleFiles(state)
    if (selected.length === 0) return

    const request: ConvertRequest = {
      jobs: selected.map((job) => ({
        id: job.id,
        input: job.input,
        to: job.to,
        options: job.options
      })),
      outputDir: state.outputDir
    }

    const result = await window.api.startConversion(request)
    if (!result.ok) {
      set({ error: result.error })
      return
    }

    const batchId = result.value.batchId
    const ids = new Set(selected.map((job) => job.id))
    const progress = { ...get().progress }
    for (const id of ids) delete progress[id]

    set((current) => {
      const files = current.files.map((job) => {
        if (!ids.has(job.id)) return job
        if (job.status !== 'queued') return { ...job, batchId }
        return { ...job, batchId, error: undefined, outputPath: undefined }
      })

      const active = files.some(
        (job) => ids.has(job.id) && (job.status === 'queued' || job.status === 'running')
      )

      return {
        files,
        batchId: active ? batchId : null,
        progress,
        error: null,
        liveMessage: `Converting ${selected.length} ${selected.length === 1 ? 'file' : 'files'}.`
      }
    })
  },

  async cancel() {
    const { batchId } = get()
    if (batchId === null) return

    set({ liveMessage: 'Cancelling…' })
    const result = await window.api.cancelBatch(batchId)
    if (!result.ok) set({ error: result.error })
  },

  handleProgress(event) {
    set((state) => {
      const job = state.files.find((candidate) => candidate.id === event.jobId)
      if (!job) return {}
      if (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled') return {}

      const running: JobStatus = 'running'
      const files =
        job.status === 'running'
          ? state.files
          : state.files.map((candidate) =>
              candidate.id === event.jobId ? { ...candidate, status: running } : candidate
            )

      return { files, progress: { ...state.progress, [event.jobId]: event } }
    })
  },

  handleJobDone(event) {
    set((state) => {
      const job = state.files.find((candidate) => candidate.id === event.jobId)
      if (!job) return {}

      const failed = 'error' in event
      const status: JobStatus = failed
        ? event.error.code === 'CANCELLED'
          ? 'cancelled'
          : 'failed'
        : 'done'

      const files = state.files.map((candidate) => {
        if (candidate.id !== event.jobId) return candidate
        if (failed) return { ...candidate, status, error: event.error }
        return { ...candidate, status, outputPath: event.outputPath, error: undefined }
      })

      const progress = { ...state.progress }
      if (failed) delete progress[event.jobId]
      else progress[event.jobId] = { jobId: event.jobId, phase: 'writing', percent: 100 }

      const stillActive =
        state.batchId !== null &&
        files.some(
          (candidate) =>
            candidate.batchId === state.batchId &&
            (candidate.status === 'queued' || candidate.status === 'running')
        )

      let liveMessage = failed
        ? event.error.code === 'CANCELLED'
          ? `${job.input.name} cancelled.`
          : `${job.input.name} failed: ${event.error.message}`
        : `${job.input.name} converted.`

      if (!stillActive && state.batchId !== null) liveMessage += ' Batch complete.'

      let recentConversions = state.recentConversions
      if (!failed) {
        const recent: RecentConversion = {
          id: crypto.randomUUID(),
          inputName: job.input.name,
          inputPath: job.input.path,
          outputPath: event.outputPath,
          to: job.to,
          completedAt: new Date().toISOString()
        }
        recentConversions = [recent, ...state.recentConversions].slice(0, MAX_RECENTS)
        writeStored(RECENTS_STORAGE_KEY, recentConversions)
      }

      return {
        files,
        progress,
        recentConversions,
        batchId: stillActive ? state.batchId : null,
        liveMessage
      }
    })
  },

  setError(error) {
    set({ error })
  },

  dismissError() {
    set({ error: null })
  }
}))
