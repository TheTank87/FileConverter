import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  ConversionEngine,
  ConvertOptions,
  ConvertResult,
  FileInfo,
  FormatId,
  JobDoneEvent,
  JobFailure,
  ProgressEvent
} from '@shared/types'
import { tempPathFor } from './atomic'
import { cancelledError } from './errors'
import { createConversionQueue, defaultConcurrency } from './queue'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true, maxRetries: 3 }))
  )
})

function sample(path: string, format: FormatId | null = 'png'): FileInfo {
  return { path, name: path.split('/').pop() ?? path, size: 1, format }
}

function job(
  path: string,
  to: FormatId = 'jpg'
): { id: string; input: FileInfo; to: FormatId; options: ConvertOptions } {
  return { id: randomUUID(), input: sample(path), to, options: {} }
}

function resultFor(input: {
  jobId: string
  outputPath: string
  signal?: AbortSignal
}): ConvertResult {
  return {
    jobId: input.jobId,
    outputPath: input.outputPath,
    engine: 'sharp',
    durationMs: 1
  }
}

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()

  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

describe('conversion queue', () => {
  it('caps default concurrency at four workers', () => {
    const concurrency = defaultConcurrency()
    expect(Number.isInteger(concurrency)).toBe(true)
    expect(concurrency).toBeGreaterThanOrEqual(1)
    expect(concurrency).toBeLessThanOrEqual(4)
  })

  it('starts jobs in FIFO order with bounded concurrency', async () => {
    const started: string[] = []
    const releases = new Map<string, () => void>()
    let active = 0
    let maxActive = 0

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      convert(input) {
        started.push(input.inputPath)
        active += 1
        maxActive = Math.max(maxActive, active)

        return new Promise<ConvertResult>((resolve) => {
          releases.set(input.inputPath, () => {
            active -= 1
            resolve(resultFor(input))
          })
        })
      }
    }

    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      concurrency: 2
    })

    const paths = ['/in/a.png', '/in/b.png', '/in/c.png', '/in/d.png', '/in/e.png']
    const { batchId } = queue.start({ jobs: paths.map((path) => job(path)), outputDir: null })

    await until(() => started.length === 2)
    expect(started).toEqual(['/in/a.png', '/in/b.png'])
    expect(maxActive).toBe(2)

    releases.get('/in/a.png')?.()
    releases.delete('/in/a.png')
    await until(() => started.length === 3)
    expect(started[2]).toBe('/in/c.png')

    for (;;) {
      const pending = started.find((path) => releases.has(path))
      if (pending !== undefined) {
        releases.get(pending)?.()
        releases.delete(pending)
        await new Promise((resolve) => setTimeout(resolve, 0))
        continue
      }

      if (started.length === paths.length && active === 0) break
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await queue.wait(batchId)
    expect(started).toEqual(paths)
    expect(maxActive).toBe(2)
  })

  it('isolates a failing job without aborting the rest', async () => {
    const done: JobDoneEvent[] = []

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      async convert(input) {
        if (input.inputPath.includes('bad')) throw new Error('boom')
        return resultFor(input)
      }
    }

    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      concurrency: 2,
      onJobDone: (event) => done.push(event)
    })

    const { batchId } = queue.start({
      jobs: [job('/in/a.png'), job('/in/bad.png'), job('/in/c.png')],
      outputDir: null
    })

    await queue.wait(batchId)

    expect(done).toHaveLength(3)
    const failures = done.filter((event): event is JobFailure => 'error' in event)
    expect(failures).toHaveLength(1)
    expect(failures[0]?.error.code).toBe('UNKNOWN')
  })

  it('cancels in-flight and queued jobs, reporting each once', async () => {
    const done: JobDoneEvent[] = []

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      convert(input) {
        return new Promise<ConvertResult>((_resolve, reject) => {
          const abort = (): void => reject(cancelledError())
          if (input.signal?.aborted) abort()
          else input.signal?.addEventListener('abort', abort, { once: true })
        })
      }
    }

    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      concurrency: 1,
      onJobDone: (event) => done.push(event)
    })

    const { batchId } = queue.start({
      jobs: [job('/in/a.png'), job('/in/b.png'), job('/in/c.png')],
      outputDir: null
    })

    queue.cancel(batchId)
    await queue.wait(batchId)

    expect(done).toHaveLength(3)
    for (const event of done) {
      expect('error' in event && event.error.code).toBe('CANCELLED')
    }
  })

  it('removes a failed job temp file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diat-queue-'))
    tempDirs.push(dir)

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      async convert(input) {
        await writeFile(tempPathFor(input.outputPath, input.jobId), 'partial')
        throw new Error('boom')
      }
    }

    const queue = createConversionQueue({ engines: [engine], exists: () => false })
    const { batchId } = queue.start({
      jobs: [{ id: randomUUID(), input: sample(join(dir, 'photo.png')), to: 'jpg', options: {} }],
      outputDir: null
    })

    await queue.wait(batchId)

    expect(await readdir(dir)).toEqual([])
    expect(existsSync(join(dir, 'photo.jpg'))).toBe(false)
  })

  it('reserves output paths so concurrent same-stem jobs do not collide', async () => {
    const outputs: string[] = []
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      async convert(input) {
        outputs.push(input.outputPath)
        await gate
        return resultFor(input)
      }
    }

    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      concurrency: 2
    })

    const { batchId } = queue.start({
      jobs: [job('/in/photo.png'), job('/in/photo.png')],
      outputDir: null
    })

    await until(() => outputs.length === 2)
    expect(outputs).toEqual(['/in/photo.jpg', '/in/photo-1.jpg'])

    release()
    await queue.wait(batchId)
  })

  it('reports unsupported formats without calling an engine', async () => {
    const done: JobDoneEvent[] = []
    let calls = 0

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      async convert(input) {
        calls += 1
        return resultFor(input)
      }
    }

    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      onJobDone: (event) => done.push(event)
    })

    const { batchId } = queue.start({
      jobs: [{ ...job('/in/notes.txt'), input: sample('/in/notes.txt', null) }],
      outputDir: null
    })

    await queue.wait(batchId)

    expect(calls).toBe(0)
    expect(done[0]).toMatchObject({ error: { code: 'UNSUPPORTED_CONVERSION' } })
  })

  it('cleans up an in-flight temp file when cancelled', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'diat-queue-'))
    tempDirs.push(dir)

    const queued = {
      id: randomUUID(),
      input: sample(join(dir, 'photo.png')),
      to: 'jpg' as FormatId,
      options: {}
    }
    const tempPath = tempPathFor(join(dir, 'photo.jpg'), queued.id)

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      async convert(input) {
        await writeFile(tempPath, 'partial')
        return new Promise<ConvertResult>((_resolve, reject) => {
          const abort = (): void => reject(cancelledError())
          if (input.signal?.aborted) abort()
          else input.signal?.addEventListener('abort', abort, { once: true })
        })
      }
    }

    const done: JobDoneEvent[] = []
    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      concurrency: 1,
      onJobDone: (event) => done.push(event)
    })

    const { batchId } = queue.start({ jobs: [queued], outputDir: null })
    await until(() => existsSync(tempPath))

    queue.cancel(batchId)
    await queue.wait(batchId)

    expect(done[0]).toMatchObject({ error: { code: 'CANCELLED' } })
    expect(await readdir(dir)).toEqual([])
  })

  it('emits monotonic progress across phases', async () => {
    const events: ProgressEvent[] = []

    const engine: ConversionEngine = {
      id: 'sharp',
      canConvert: () => true,
      async convert(input, onProgress) {
        onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 0 })
        onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 100 })
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 0 })
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 100 })
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 0 })
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 100 })
        return resultFor(input)
      }
    }

    const queue = createConversionQueue({
      engines: [engine],
      exists: () => false,
      onProgress: (event) => events.push(event)
    })

    const { batchId } = queue.start({ jobs: [job('/in/a.png')], outputDir: null })
    await queue.wait(batchId)

    const percentages = events.map((event) => event.percent)
    expect(percentages).toEqual([0, 10, 10, 90, 90, 100])
    expect(
      percentages.every((percent, index) => index === 0 || percent >= (percentages[index - 1] ?? 0))
    ).toBe(true)
  })
})
