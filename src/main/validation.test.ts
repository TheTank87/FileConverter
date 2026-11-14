import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { ConvertError } from '@shared/types'
import {
  MAX_BATCH_FILES,
  parseBatchId,
  parseConvertRequest,
  parsePath,
  parsePathList
} from './validation'

function thrown(work: () => unknown): ConvertError {
  try {
    work()
  } catch (error) {
    return error as ConvertError
  }

  throw new Error('Expected the call to throw.')
}

describe('parsePath', () => {
  it('accepts absolute paths', () => {
    expect(parsePath('/tmp/photo.png')).toBe('/tmp/photo.png')
  })

  it('rejects relative, empty, and null-byte paths', () => {
    expect(thrown(() => parsePath('photo.png')).code).toBe('INVALID_REQUEST')
    expect(thrown(() => parsePath('')).code).toBe('INVALID_REQUEST')
    expect(thrown(() => parsePath('/tmp/a\0b.png')).code).toBe('INVALID_REQUEST')
  })
})

describe('parsePathList', () => {
  it('dedupes while preserving order', () => {
    expect(parsePathList(['/tmp/a.png', '/tmp/b.png', '/tmp/a.png'])).toEqual([
      '/tmp/a.png',
      '/tmp/b.png'
    ])
  })

  it('rejects non-arrays and oversized batches', () => {
    expect(thrown(() => parsePathList('nope')).code).toBe('INVALID_REQUEST')
    const tooMany = Array.from({ length: MAX_BATCH_FILES + 1 }, (_, index) => `/tmp/${index}.png`)
    expect(thrown(() => parsePathList(tooMany)).code).toBe('INVALID_REQUEST')
  })
})

describe('parseBatchId', () => {
  it('accepts UUIDs and rejects junk', () => {
    expect(parseBatchId(randomUUID())).toHaveLength(36)
    expect(thrown(() => parseBatchId('batch-1')).code).toBe('INVALID_REQUEST')
    expect(thrown(() => parseBatchId(42)).code).toBe('INVALID_REQUEST')
  })
})

function requestJob(overrides = {}) {
  return {
    id: randomUUID(),
    input: { path: '/tmp/a.png' },
    to: 'jpg',
    options: {},
    ...overrides
  }
}

describe('parseConvertRequest', () => {
  it('re-derives file metadata from the path', () => {
    const request = parseConvertRequest({
      jobs: [
        requestJob({
          input: { path: '/tmp/photo.HEIC', name: 'spoofed.exe', size: -5, format: 'gif' },
          to: 'png',
          options: {
            quality: 500,
            keepMetadata: true,
            resizeWidth: 1200,
            resizeHeight: 800,
            backgroundColor: '#3366CC'
          }
        })
      ],
      outputDir: null
    })

    expect(request.jobs[0]?.input).toEqual({
      path: '/tmp/photo.HEIC',
      name: 'photo.HEIC',
      size: 0,
      format: 'heic'
    })
    expect(request.jobs[0]?.options).toEqual({
      quality: 100,
      keepMetadata: true,
      resizeWidth: 1200,
      resizeHeight: 800,
      backgroundColor: '#3366cc'
    })
  })

  it('accepts an absolute output directory', () => {
    const request = parseConvertRequest({
      jobs: [requestJob()],
      outputDir: '/tmp/out'
    })

    expect(request.outputDir).toBe('/tmp/out')
  })

  it('rejects empty, oversized, and malformed batches', () => {
    expect(thrown(() => parseConvertRequest({ jobs: [], outputDir: null })).code).toBe(
      'INVALID_REQUEST'
    )

    const jobs = Array.from({ length: MAX_BATCH_FILES + 1 }, () => requestJob())
    expect(thrown(() => parseConvertRequest({ jobs, outputDir: null })).code).toBe(
      'INVALID_REQUEST'
    )

    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [requestJob({ to: 'nope' })],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')

    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [requestJob({ input: { path: 'relative.png' } })],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')
  })

  it('rejects duplicate job ids', () => {
    const duplicate = requestJob()
    expect(
      thrown(() => parseConvertRequest({ jobs: [duplicate, duplicate], outputDir: null })).code
    ).toBe('INVALID_REQUEST')
  })

  it('rejects missing or malformed job ids', () => {
    expect(
      thrown(() => parseConvertRequest({ jobs: [requestJob({ id: undefined })], outputDir: null }))
        .code
    ).toBe('INVALID_REQUEST')

    expect(
      thrown(() => parseConvertRequest({ jobs: [requestJob({ id: 'job-1' })], outputDir: null }))
        .code
    ).toBe('INVALID_REQUEST')
  })

  it('rejects invalid option types', () => {
    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [requestJob({ options: { quality: 'high' } })],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')

    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [requestJob({ options: { keepMetadata: 'yes' } })],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')
  })
})
