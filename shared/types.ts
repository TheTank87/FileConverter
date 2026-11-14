// Cross-process contract shared by main, preload, and renderer.
// Keep this module dependency-free: no `electron`, no Node built-ins.

export type FormatId = 'heic' | 'png' | 'jpg' | 'webp' | 'avif' | 'tiff' | 'gif' | 'bmp'

export type FormatKind = 'image' | 'audio' | 'video' | 'document'

export type ThemeMode = 'system' | 'light' | 'dark'

export type EngineId = 'sharp' | 'magick'

export interface ConvertOptions {
  quality?: number
  keepMetadata?: boolean
}

export interface FormatDef {
  id: FormatId
  label: string
  extensions: string[]
  mime: string
  kind: FormatKind
  canRead: boolean
  canWrite: boolean
  defaultOptions: ConvertOptions
}

export interface FileInfo {
  path: string
  name: string
  size: number
  format: FormatId | null
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'

export interface Job {
  id: string
  batchId: string
  input: FileInfo
  to: FormatId
  options: ConvertOptions
  status: JobStatus
  outputPath?: string
  error?: ConvertError
}

export interface ConvertRequest {
  jobs: Array<Pick<Job, 'input' | 'to' | 'options'>>
  outputDir: string | null
}

export interface ConvertResult {
  jobId: string
  outputPath: string
  engine: EngineId
  durationMs: number
}

export type ProgressPhase = 'reading' | 'converting' | 'writing'

export interface ProgressEvent {
  jobId: string
  phase: ProgressPhase
  percent: number
}

export interface Settings {
  outputDir: string | null
  defaultFormat: FormatId
  theme: ThemeMode
}

export type ErrorCode =
  | 'UNSUPPORTED_CONVERSION'
  | 'UNREADABLE_FILE'
  | 'OUTPUT_NOT_WRITABLE'
  | 'ENGINE_MISSING'
  | 'CANCELLED'
  | 'UNKNOWN'

export interface ConvertError {
  code: ErrorCode
  message: string
  detail?: string
}

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: ConvertError }

export interface JobFailure {
  jobId: string
  error: ConvertError
}

export type JobDoneEvent = ConvertResult | JobFailure

export interface ConvertInput {
  jobId: string
  inputPath: string
  outputPath: string
  from: FormatId
  to: FormatId
  options: ConvertOptions
  signal?: AbortSignal
}

export type ProgressFn = (event: ProgressEvent) => void

export interface ConversionEngine {
  readonly id: EngineId
  canConvert(from: FormatId, to: FormatId): boolean
  convert(input: ConvertInput, onProgress?: ProgressFn): Promise<ConvertResult>
}

export const IPC_CHANNELS = {
  pickFiles: 'dialog:pickFiles',
  pickOutputFolder: 'dialog:pickOutputFolder',
  statFiles: 'files:stat',
  getFormats: 'formats:get',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  startConversion: 'convert:start',
  cancelBatch: 'convert:cancel',
  progress: 'convert:progress',
  jobDone: 'convert:jobDone',
  openPath: 'shell:openPath',
  revealInFolder: 'shell:reveal'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
