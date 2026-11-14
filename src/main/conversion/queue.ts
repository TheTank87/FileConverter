import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cpus } from 'node:os'
import { resolve } from 'node:path'
import type {
  ConversionEngine,
  ConvertInput,
  ConvertError,
  ConvertOptions,
  ConvertRequest,
  FileInfo,
  FormatId,
  JobDoneEvent,
  JobFailure,
  JobStatus,
  ProgressEvent,
  ProgressFn,
  ProgressPhase
} from '@shared/types'
import { discardTemp, tempPathFor } from './atomic'
import { EngineRegistry } from './engine'
import { cancelledError, isCancelledError, toConvertError, unsupportedFileError } from './errors'
import { detectFormat } from './formats'
import { resolveOutputPath, type FileExists } from './naming'

const PHASE_RANGES: Record<ProgressPhase, readonly [number, number]> = {
  reading: [0, 10],
  converting: [10, 90],
  writing: [90, 100]
}

export type ProgressListener = (event: ProgressEvent) => void
export type JobDoneListener = (event: JobDoneEvent) => void

export interface ConversionQueueOptions {
  engines: readonly ConversionEngine[]
  exists?: FileExists
  concurrency?: number
  onProgress?: ProgressListener
  onJobDone?: JobDoneListener
}

export interface ConversionQueue {
  start(request: ConvertRequest): { batchId: string }
  cancel(batchId: string): void
  wait(batchId: string): Promise<void>
}

interface InternalJob {
  id: string
  input: FileInfo
  to: FormatId
  options: ConvertOptions
  status: JobStatus
  outputPath?: string
  error?: ConvertError
  reservedKey?: string
  reported: boolean
}

interface Batch {
  id: string
  outputDir: string | null
  jobs: InternalJob[]
  controllers: Map<string, AbortController>
  cancelled: boolean
  remaining: number
  done: Promise<void>
  resolveDone: () => void
}

export function defaultConcurrency(): number {
  return Math.min(4, Math.max(1, cpus().length))
}

export function createConversionQueue(options: ConversionQueueOptions): ConversionQueue {
  const registry = new EngineRegistry(options.engines)
  const baseExists = options.exists ?? existsSync
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? defaultConcurrency()))
  const reservedOutputs = new Set<string>()
  const batches = new Map<string, Batch>()

  function emitProgress(event: ProgressEvent): void {
    try {
      options.onProgress?.(event)
    } catch (error) {
      console.error('[queue] progress listener failed:', error)
    }
  }

  function emitJobDone(event: JobDoneEvent): void {
    try {
      options.onJobDone?.(event)
    } catch (error) {
      console.error('[queue] job listener failed:', error)
    }
  }

  function settle(batch: Batch, job: InternalJob, event: JobDoneEvent, status: JobStatus): void {
    if (job.reported) return

    job.reported = true
    job.status = status
    if ('error' in event) job.error = event.error

    if (job.reservedKey !== undefined) {
      reservedOutputs.delete(job.reservedKey)
      job.reservedKey = undefined
    }

    emitJobDone(event)
    batch.remaining -= 1
    if (batch.remaining === 0) batch.resolveDone()
  }

  function chooseOutputPath(batch: Batch, job: InternalJob): string {
    const outputPath = resolveOutputPath(job.input.path, job.to, batch.outputDir, (candidate) => {
      if (reservedOutputs.has(resolve(candidate))) return true
      return baseExists(candidate)
    })

    job.reservedKey = resolve(outputPath)
    reservedOutputs.add(job.reservedKey)
    return outputPath
  }

  function progressReporter(job: InternalJob): ProgressFn {
    let last = 0

    return (event) => {
      const percent = overallPercent(event.phase, event.percent)
      if (percent < last) return

      last = percent
      emitProgress({ jobId: job.id, phase: event.phase, percent })
    }
  }

  async function cleanupTemp(job: InternalJob): Promise<void> {
    if (job.outputPath === undefined) return
    await discardTemp(tempPathFor(job.outputPath, job.id))
  }

  async function runJob(batch: Batch, job: InternalJob): Promise<void> {
    job.status = 'running'
    const controller = new AbortController()
    batch.controllers.set(job.id, controller)

    try {
      const from = job.input.format ?? detectFormat(job.input.path)
      if (from === null) {
        settle(batch, job, failedEvent(job.id, unsupportedFileError(job.input.name)), 'failed')
        return
      }

      const resolution = registry.resolve(from, job.to)
      if (!resolution.ok) {
        settle(batch, job, failedEvent(job.id, resolution.error), 'failed')
        return
      }

      const outputPath = chooseOutputPath(batch, job)
      job.outputPath = outputPath

      const input: ConvertInput = {
        jobId: job.id,
        inputPath: job.input.path,
        outputPath,
        from,
        to: job.to,
        options: job.options,
        signal: controller.signal
      }

      const result = await resolution.engine.convert(input, progressReporter(job))
      settle(batch, job, result, 'done')
    } catch (error) {
      await cleanupTemp(job)

      if (isCancelledError(error) || controller.signal.aborted) {
        settle(batch, job, failedEvent(job.id, cancelledError()), 'cancelled')
      } else {
        settle(batch, job, failedEvent(job.id, toConvertError(error)), 'failed')
      }
    } finally {
      batch.controllers.delete(job.id)
    }
  }

  async function work(batch: Batch): Promise<void> {
    for (;;) {
      const job = nextQueued(batch)
      if (job === undefined) return

      if (batch.cancelled) {
        settle(batch, job, failedEvent(job.id, cancelledError()), 'cancelled')
        continue
      }

      await runJob(batch, job)
    }
  }

  async function runBatch(batch: Batch): Promise<void> {
    try {
      const workers = Math.min(concurrency, batch.jobs.length)
      await Promise.all(Array.from({ length: workers }, () => work(batch)))
    } finally {
      batch.resolveDone()
    }
  }

  return {
    start(request: ConvertRequest): { batchId: string } {
      const batchId = randomUUID()
      const jobs: InternalJob[] = request.jobs.map((job) => ({
        id: randomUUID(),
        input: { ...job.input },
        to: job.to,
        options: { ...job.options },
        status: 'queued',
        reported: false
      }))

      let resolveDone: () => void = () => undefined
      const done = new Promise<void>((resolvePromise) => {
        resolveDone = resolvePromise
      })

      const batch: Batch = {
        id: batchId,
        outputDir: request.outputDir,
        jobs,
        controllers: new Map(),
        cancelled: false,
        remaining: jobs.length,
        done,
        resolveDone
      }

      batches.set(batchId, batch)
      void runBatch(batch).then(() => batches.delete(batchId))

      return { batchId }
    },

    cancel(batchId: string): void {
      const batch = batches.get(batchId)
      if (batch === undefined || batch.cancelled) return

      batch.cancelled = true

      for (const job of batch.jobs) {
        if (job.status === 'queued') {
          settle(batch, job, failedEvent(job.id, cancelledError()), 'cancelled')
        }
      }

      for (const controller of batch.controllers.values()) controller.abort()
    },

    wait(batchId: string): Promise<void> {
      return batches.get(batchId)?.done ?? Promise.resolve()
    }
  }
}

function nextQueued(batch: Batch): InternalJob | undefined {
  return batch.jobs.find((job) => job.status === 'queued')
}

function failedEvent(jobId: string, error: JobFailure['error']): JobFailure {
  return { jobId, error }
}

function overallPercent(phase: ProgressPhase, percent: number): number {
  const [start, end] = PHASE_RANGES[phase]
  const clamped = Math.min(100, Math.max(0, percent))
  return Math.round(start + ((end - start) * clamped) / 100)
}
