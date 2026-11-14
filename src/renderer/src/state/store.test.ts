import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FileInfo,
  FormatDef,
  IpcResult,
  JobDoneEvent,
  ProgressEvent,
  Settings,
  WindowApi
} from '@shared/types'
import { DEFAULT_SETTINGS, selectConvertibleFiles, useAppStore } from './store'

const FORMATS: FormatDef[] = [
  {
    id: 'png',
    label: 'PNG',
    extensions: ['png'],
    mime: 'image/png',
    kind: 'image',
    canRead: true,
    canWrite: true,
    defaultOptions: {}
  },
  {
    id: 'jpg',
    label: 'JPG',
    extensions: ['jpg', 'jpeg'],
    mime: 'image/jpeg',
    kind: 'image',
    canRead: true,
    canWrite: true,
    defaultOptions: { quality: 80 }
  },
  {
    id: 'heic',
    label: 'HEIC',
    extensions: ['heic'],
    mime: 'image/heic',
    kind: 'image',
    canRead: true,
    canWrite: false,
    defaultOptions: {}
  }
]

const SETTINGS: Settings = { outputDir: null, defaultFormat: 'png', theme: 'system' }

function ok<T>(value: T): IpcResult<T> {
  return { ok: true, value }
}

function file(path: string, format: FileInfo['format'] = 'png'): FileInfo {
  return { path, name: path.split('/').pop() ?? path, size: 1024, format }
}

function subscribe(api: WindowApi): void {
  api.onProgress(useAppStore.getState().handleProgress)
  api.onJobDone(useAppStore.getState().handleJobDone)
}

let onProgress: ((event: ProgressEvent) => void) | null = null
let onJobDone: ((event: JobDoneEvent) => void) | null = null

function createApi(overrides: Partial<WindowApi> = {}): WindowApi {
  return {
    pickFiles: vi.fn(async () => ok<FileInfo[]>([])),
    getPathForFile: vi.fn(() => '/tmp/a.png'),
    statFiles: vi.fn(async () => ok<FileInfo[]>([])),
    getFormats: vi.fn(async () => ok(FORMATS)),
    pickOutputFolder: vi.fn(async () => ok<string | null>(null)),
    getSettings: vi.fn(async () => ok(SETTINGS)),
    setSettings: vi.fn(async (patch: Partial<Settings>) => ok({ ...SETTINGS, ...patch })),
    startConversion: vi.fn(async () => ok({ batchId: 'batch-1' })),
    cancelBatch: vi.fn(async () => ok(undefined)),
    onProgress: vi.fn((callback: (event: ProgressEvent) => void) => {
      onProgress = callback
      return () => {
        onProgress = null
      }
    }),
    onJobDone: vi.fn((callback: (event: JobDoneEvent) => void) => {
      onJobDone = callback
      return () => {
        onJobDone = null
      }
    }),
    openPath: vi.fn(async () => ok(undefined)),
    revealInFolder: vi.fn(async () => ok(undefined)),
    ...overrides
  }
}

beforeEach(() => {
  onProgress = null
  onJobDone = null
  useAppStore.setState({
    files: [],
    targetFormat: DEFAULT_SETTINGS.defaultFormat,
    outputDir: DEFAULT_SETTINGS.outputDir,
    formats: FORMATS,
    settings: { ...DEFAULT_SETTINGS },
    batchId: null,
    progress: {},
    loading: false,
    loadError: null,
    error: null,
    liveMessage: ''
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderer store', () => {
  it('loads formats and applies saved settings', async () => {
    const saved: Settings = { ...SETTINGS, defaultFormat: 'jpg', theme: 'dark' }
    const api = createApi({
      getSettings: vi.fn(async () => ok(saved))
    })
    vi.stubGlobal('window', { api })

    await useAppStore.getState().load()

    expect(useAppStore.getState().formats).toEqual(FORMATS)
    expect(useAppStore.getState().targetFormat).toBe('jpg')
    expect(useAppStore.getState().settings.theme).toBe('dark')
    expect(useAppStore.getState().loadError).toBeNull()
  })

  it('reports a failed load without throwing', async () => {
    const api = createApi({
      getFormats: vi.fn(async () => ({
        ok: false as const,
        error: { code: 'UNKNOWN' as const, message: 'no formats' }
      }))
    })
    vi.stubGlobal('window', { api })

    await useAppStore.getState().load()

    expect(useAppStore.getState().loadError?.message).toBe('no formats')
    expect(useAppStore.getState().loading).toBe(false)
  })

  it('adds files once and applies the current target format', () => {
    useAppStore.setState({ formats: FORMATS })
    useAppStore.getState().setTargetFormat('jpg')

    useAppStore.getState().addFiles([file('/tmp/a.png'), file('/tmp/b.png')])
    useAppStore.getState().addFiles([file('/tmp/a.png')])

    const state = useAppStore.getState()
    expect(state.files).toHaveLength(2)
    expect(state.files.every((job) => job.to === 'jpg' && job.status === 'queued')).toBe(true)
    expect(new Set(state.files.map((job) => job.id)).size).toBe(2)
  })

  it('populates rows from the browse picker', async () => {
    const api = createApi({
      pickFiles: vi.fn(async () => ok([file('/tmp/a.png'), file('/tmp/b.jpg', 'jpg')]))
    })
    vi.stubGlobal('window', { api })

    await useAppStore.getState().pickAndAdd()

    expect(useAppStore.getState().files.map((job) => job.input.path)).toEqual([
      '/tmp/a.png',
      '/tmp/b.jpg'
    ])
  })

  it('populates rows from dropped paths', async () => {
    const api = createApi({
      statFiles: vi.fn(async (paths: string[]) => ok(paths.map((path) => file(path))))
    })
    vi.stubGlobal('window', { api })

    await useAppStore.getState().addPaths(['/tmp/a.png', '/tmp/b.png'])

    expect(useAppStore.getState().files).toHaveLength(2)
    expect(api.statFiles).toHaveBeenCalledWith(['/tmp/a.png', '/tmp/b.png'])
  })

  it('excludes unsupported and unwritable targets from the batch', () => {
    useAppStore.setState({ formats: FORMATS })
    useAppStore.getState().addFiles([file('/tmp/a.png'), file('/tmp/b.unknown', null)])

    expect(selectConvertibleFiles(useAppStore.getState())).toHaveLength(1)

    useAppStore.getState().setTargetFormat('heic')
    expect(selectConvertibleFiles(useAppStore.getState())).toHaveLength(0)
  })

  it('runs the full start → progress → done flow with renderer job ids', async () => {
    const api = createApi()
    vi.stubGlobal('window', { api })
    subscribe(api)

    useAppStore.getState().addFiles([file('/tmp/a.png'), file('/tmp/b.png')])
    const ids = useAppStore.getState().files.map((job) => job.id)

    await useAppStore.getState().start()

    expect(api.startConversion).toHaveBeenCalledTimes(1)
    const request = vi.mocked(api.startConversion).mock.calls[0]?.[0]
    expect(request?.jobs.map((job) => job.id)).toEqual(ids)
    expect(useAppStore.getState().batchId).toBe('batch-1')

    onProgress?.({ jobId: ids[0] ?? '', phase: 'converting', percent: 45 })
    expect(useAppStore.getState().files[0]?.status).toBe('running')
    expect(useAppStore.getState().progress[ids[0] ?? '']?.percent).toBe(45)

    onJobDone?.({ jobId: ids[0] ?? '', outputPath: '/tmp/a.jpg', engine: 'sharp', durationMs: 5 })
    expect(useAppStore.getState().files[0]?.status).toBe('done')
    expect(useAppStore.getState().files[0]?.outputPath).toBe('/tmp/a.jpg')
    expect(useAppStore.getState().batchId).toBe('batch-1')

    onJobDone?.({ jobId: ids[1] ?? '', outputPath: '/tmp/b.jpg', engine: 'sharp', durationMs: 5 })
    expect(useAppStore.getState().files[1]?.status).toBe('done')
    expect(useAppStore.getState().batchId).toBeNull()
    expect(useAppStore.getState().liveMessage).toContain('Batch complete')
  })

  it('cancels the batch and clears it once every job reports', async () => {
    const api = createApi()
    vi.stubGlobal('window', { api })
    subscribe(api)

    useAppStore.getState().addFiles([file('/tmp/a.png')])
    const jobId = useAppStore.getState().files[0]?.id ?? ''

    await useAppStore.getState().start()
    await useAppStore.getState().cancel()

    expect(api.cancelBatch).toHaveBeenCalledWith('batch-1')

    onJobDone?.({
      jobId,
      error: { code: 'CANCELLED', message: 'Conversion cancelled.' }
    })

    expect(useAppStore.getState().files[0]?.status).toBe('cancelled')
    expect(useAppStore.getState().batchId).toBeNull()
  })

  it('ignores late progress for a finished job', () => {
    useAppStore.getState().addFiles([file('/tmp/a.png')])
    const jobId = useAppStore.getState().files[0]?.id ?? ''

    useAppStore.getState().handleJobDone({
      jobId,
      error: { code: 'UNKNOWN', message: 'boom' }
    })
    useAppStore.getState().handleProgress({ jobId, phase: 'writing', percent: 90 })

    expect(useAppStore.getState().files[0]?.status).toBe('failed')
    expect(useAppStore.getState().progress[jobId]).toBeUndefined()
  })
})
