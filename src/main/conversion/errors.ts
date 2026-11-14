import type { ConvertError, ErrorCode, FormatId } from '@shared/types'

const WRITE_ERROR_CODES = new Set([
  'EACCES',
  'EPERM',
  'EROFS',
  'ENOSPC',
  'ENOENT',
  'ENOTDIR',
  'EISDIR',
  'EEXIST',
  'EBUSY'
])

export function convertError(code: ErrorCode, message: string, detail?: string): ConvertError {
  return detail === undefined || detail.length === 0 ? { code, message } : { code, message, detail }
}

export function unsupportedConversionError(from: FormatId, to: FormatId): ConvertError {
  return convertError(
    'UNSUPPORTED_CONVERSION',
    `Cannot convert ${from.toUpperCase()} to ${to.toUpperCase()}.`
  )
}

export function cancelledError(): ConvertError {
  return convertError('CANCELLED', 'Conversion cancelled.')
}

export function outputNotWritableError(outputPath: string, detail?: string): ConvertError {
  return convertError('OUTPUT_NOT_WRITABLE', `Could not write ${fileName(outputPath)}.`, detail)
}

export function unreadableFileError(inputPath: string, detail?: string): ConvertError {
  return convertError('UNREADABLE_FILE', `Could not read ${fileName(inputPath)}.`, detail)
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw cancelledError()
}

export function isConvertError(value: unknown): value is ConvertError {
  return (
    isRecord(value) &&
    typeof value.code === 'string' &&
    typeof value.message === 'string' &&
    (value.detail === undefined || typeof value.detail === 'string')
  )
}

export function isCancelledError(value: unknown): boolean {
  return isConvertError(value) && value.code === 'CANCELLED'
}

export function nodeErrorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === 'string' ? value.code : undefined
}

export function isWriteErrorCode(code: string | undefined): boolean {
  return code !== undefined && WRITE_ERROR_CODES.has(code)
}

export function errorDetail(value: unknown): string | undefined {
  if (isRecord(value) && typeof value.stderr === 'string') {
    const stderr = value.stderr.trim()
    if (stderr.length > 0) return stderr
  }
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  return undefined
}

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] ?? filePath
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
