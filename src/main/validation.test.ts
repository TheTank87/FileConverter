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

describe('parseConvertRequest', () => {
  it('re-derives file metadata from the path', () => {
    const request = parseConvertRequest({
      jobs: [
        {
          input: { path: '/tmp/photo.HEIC', name: 'spoofed.exe', size: -5, format: 'gif' },
          to: 'png',
          options: { quality: 500, keepMetadata: true }
        }
      ],
      outputDir: null
    })

    expect(request.jobs[0]?.input).toEqual({
      path: '/tmp/photo.HEIC',
      name: 'photo.HEIC',
      size: 0,
      format: 'heic'
    })
    expect(request.jobs[0]?.options).toEqual({ quality: 100, keepMetadata: true })
  })

  it('accepts an absolute output directory', () => {
    const request = parseConvertRequest({
      jobs: [{ input: { path: '/tmp/a.png' }, to: 'jpg', options: {} }],
      outputDir: '/tmp/out'
    })

    expect(request.outputDir).toBe('/tmp/out')
  })

  it('rejects empty, oversized, and malformed batches', () => {
    expect(thrown(() => parseConvertRequest({ jobs: [], outputDir: null })).code).toBe(
      'INVALID_REQUEST'
    )

    const jobs = Array.from({ length: MAX_BATCH_FILES + 1 }, () => ({
      input: { path: '/tmp/a.png' },
      to: 'jpg',
      options: {}
    }))
    expect(thrown(() => parseConvertRequest({ jobs, outputDir: null })).code).toBe(
      'INVALID_REQUEST'
    )

    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [{ input: { path: '/tmp/a.png' }, to: 'nope', options: {} }],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')

    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [{ input: { path: 'relative.png' }, to: 'jpg', options: {} }],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')
  })

  it('rejects invalid option types', () => {
    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [{ input: { path: '/tmp/a.png' }, to: 'jpg', options: { quality: 'high' } }],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')

    expect(
      thrown(() =>
        parseConvertRequest({
          jobs: [{ input: { path: '/tmp/a.png' }, to: 'jpg', options: { keepMetadata: 'yes' } }],
          outputDir: null
        })
      ).code
    ).toBe('INVALID_REQUEST')
  })
})
