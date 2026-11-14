import { describe, expect, it } from 'vitest'
import {
  cancelledError,
  convertError,
  errorDetail,
  isCancelledError,
  isConvertError,
  isWriteErrorCode,
  nodeErrorCode,
  outputNotWritableError,
  throwIfAborted,
  toConvertError,
  unreadableFileError,
  unsupportedConversionError,
  unsupportedFileError
} from './errors'

describe('convertError', () => {
  it('includes a non-empty detail and omits an empty one', () => {
    expect(convertError('UNKNOWN', 'Boom', 'stack')).toEqual({
      code: 'UNKNOWN',
      message: 'Boom',
      detail: 'stack'
    })
    expect(convertError('UNKNOWN', 'Boom', '')).toEqual({ code: 'UNKNOWN', message: 'Boom' })
  })
})

describe('error constructors', () => {
  it('builds unsupported conversion and file errors', () => {
    expect(unsupportedConversionError('heic', 'png')).toEqual({
      code: 'UNSUPPORTED_CONVERSION',
      message: 'Cannot convert HEIC to PNG.'
    })
    expect(unsupportedFileError('notes.txt')).toEqual({
      code: 'UNSUPPORTED_CONVERSION',
      message: 'Unsupported file type: notes.txt.'
    })
  })

  it('builds cancellation errors', () => {
    expect(cancelledError()).toEqual({ code: 'CANCELLED', message: 'Conversion cancelled.' })
  })

  it('names output and input files in write/read errors', () => {
    expect(outputNotWritableError('/tmp/missing/out.jpg', 'EACCES')).toEqual({
      code: 'OUTPUT_NOT_WRITABLE',
      message: 'Could not write out.jpg.',
      detail: 'EACCES'
    })
    expect(unreadableFileError('C:\\photos\\café.HEIC')).toEqual({
      code: 'UNREADABLE_FILE',
      message: 'Could not read café.HEIC.'
    })
  })
})

describe('throwIfAborted', () => {
  it('does nothing without an aborted signal', () => {
    expect(() => throwIfAborted(undefined)).not.toThrow()
    expect(() => throwIfAborted(new AbortController().signal)).not.toThrow()
  })

  it('throws a typed cancellation once aborted', () => {
    const controller = new AbortController()
    controller.abort()

    expect(() => throwIfAborted(controller.signal)).toThrowError(
      expect.objectContaining({ code: 'CANCELLED' })
    )
  })
})

describe('isConvertError', () => {
  it('accepts valid shapes with or without details', () => {
    expect(isConvertError({ code: 'CANCELLED', message: 'Stopped.' })).toBe(true)
    expect(isConvertError({ code: 'UNKNOWN', message: 'Boom', detail: 'stack' })).toBe(true)
  })

  it('rejects malformed values', () => {
    for (const value of [
      null,
      'error',
      [],
      {},
      { code: 1, message: 'Boom' },
      { code: 'UNKNOWN', message: 1 },
      { code: 'UNKNOWN', message: 'Boom', detail: null }
    ]) {
      expect(isConvertError(value)).toBe(false)
    }
  })

  it('identifies cancellation errors specifically', () => {
    expect(isCancelledError(cancelledError())).toBe(true)
    expect(isCancelledError({ code: 'UNKNOWN', message: 'Boom' })).toBe(false)
  })
})

describe('node error helpers', () => {
  it('reads a string code from record-like errors', () => {
    expect(nodeErrorCode({ code: 'ENOENT' })).toBe('ENOENT')
    expect(nodeErrorCode(Object.assign(new Error('missing'), { code: 'EACCES' }))).toBe('EACCES')
    expect(nodeErrorCode({ code: 1 })).toBeUndefined()
    expect(nodeErrorCode(null)).toBeUndefined()
  })

  it('recognizes write-related codes', () => {
    expect(isWriteErrorCode('EACCES')).toBe(true)
    expect(isWriteErrorCode('ENOSPC')).toBe(true)
    expect(isWriteErrorCode('ENOENT')).toBe(true)
    expect(isWriteErrorCode('EUNKNOWN')).toBe(false)
    expect(isWriteErrorCode(undefined)).toBe(false)
  })
})

describe('errorDetail', () => {
  it('prefers trimmed stderr from child processes', () => {
    expect(errorDetail({ stderr: '  permission denied\n' })).toBe('permission denied')
  })

  it('falls back to an Error message or a string', () => {
    expect(errorDetail(new Error('boom'))).toBe('boom')
    expect(errorDetail(Object.assign(new Error('boom'), { stderr: '   ' }))).toBe('boom')
    expect(errorDetail('plain detail')).toBe('plain detail')
    expect(errorDetail({ stderr: '   ' })).toBeUndefined()
    expect(errorDetail(null)).toBeUndefined()
  })
})

describe('toConvertError', () => {
  it('preserves already-typed errors and drops empty details', () => {
    expect(toConvertError({ code: 'CANCELLED', message: 'Stopped.', detail: '' })).toEqual({
      code: 'CANCELLED',
      message: 'Stopped.'
    })
  })

  it('wraps Error instances as UNKNOWN with a stack detail', () => {
    const error = new Error('boom')
    const converted = toConvertError(error)

    expect(converted).toMatchObject({ code: 'UNKNOWN', message: 'boom' })
    expect(converted.detail).toContain('boom')
  })

  it('wraps strings and arbitrary values without losing context', () => {
    expect(toConvertError('oops')).toEqual({
      code: 'UNKNOWN',
      message: 'Something went wrong.',
      detail: 'oops'
    })
    expect(toConvertError(null)).toMatchObject({ code: 'UNKNOWN', detail: 'null' })
    expect(toConvertError(42)).toMatchObject({ code: 'UNKNOWN', detail: '42' })
  })
})
