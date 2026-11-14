import { basename, isAbsolute } from 'node:path'
import type { ConvertError, ConvertOptions, ConvertRequest, FileInfo } from '@shared/types'
import { convertError } from './conversion/errors'
import { detectFormat, isFormatId } from './conversion/formats'

export const MAX_BATCH_FILES = 1000
export const MAX_PATH_LENGTH = 4096

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function invalidRequestError(message: string): ConvertError {
  return convertError('INVALID_REQUEST', message)
}

export function parsePath(value: unknown, label = 'path'): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} must be a non-empty string.`)
  }
  if (value.length > MAX_PATH_LENGTH) fail(`${label} is too long.`)
  if (value.includes('\0')) fail(`${label} contains an invalid character.`)
  if (!isAbsolute(value)) fail(`${label} must be an absolute path.`)
  return value
}

export function parsePathList(value: unknown): string[] {
  if (!Array.isArray(value)) fail('paths must be an array.')
  if (value.length > MAX_BATCH_FILES) {
    fail(`At most ${MAX_BATCH_FILES} paths may be processed at once.`)
  }

  const paths: string[] = []
  const seen = new Set<string>()

  for (const [index, item] of value.entries()) {
    const path = parsePath(item, `paths[${index}]`)
    if (seen.has(path)) continue
    seen.add(path)
    paths.push(path)
  }

  return paths
}

export function parseBatchId(value: unknown): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail('batchId must be a valid batch identifier.')
  }
  return value
}

export function parseConvertRequest(value: unknown): ConvertRequest {
  if (!isRecord(value)) fail('request must be an object.')
  if (!Array.isArray(value.jobs)) fail('request.jobs must be an array.')
  if (value.jobs.length === 0) fail('request.jobs must not be empty.')
  if (value.jobs.length > MAX_BATCH_FILES) {
    fail(`A batch may contain at most ${MAX_BATCH_FILES} files.`)
  }

  let outputDir: string | null = null
  if (value.outputDir !== undefined && value.outputDir !== null) {
    outputDir = parsePath(value.outputDir, 'outputDir')
  }

  const seen = new Set<string>()
  const jobs = value.jobs.map((job, index) => {
    const parsed = parseJob(job, index)
    if (seen.has(parsed.id)) fail(`jobs[${index}].id must be unique within a batch.`)
    seen.add(parsed.id)
    return parsed
  })

  return { jobs, outputDir }
}

function parseJob(value: unknown, index: number): ConvertRequest['jobs'][number] {
  if (!isRecord(value)) fail(`jobs[${index}] must be an object.`)
  if (!isFormatId(value.to)) fail(`jobs[${index}].to must be a supported format.`)

  return {
    id: parseJobId(value.id, index),
    input: parseFileInfo(value.input, index),
    to: value.to,
    options: parseOptions(value.options, index)
  }
}

function parseJobId(value: unknown, index: number): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(`jobs[${index}].id must be a valid job identifier.`)
  }
  return value
}

function parseFileInfo(value: unknown, index: number): FileInfo {
  if (!isRecord(value)) fail(`jobs[${index}].input must be an object.`)

  const path = parsePath(value.path, `jobs[${index}].path`)

  // Renderer-supplied metadata is untrusted; re-derive it from the path.
  return {
    path,
    name: basename(path),
    size: 0,
    format: detectFormat(path)
  }
}

function parseOptions(value: unknown, index: number): ConvertOptions {
  if (value === undefined || value === null) return {}
  if (!isRecord(value)) fail(`jobs[${index}].options must be an object.`)

  const options: ConvertOptions = {}

  if (value.quality !== undefined) {
    if (typeof value.quality !== 'number' || !Number.isFinite(value.quality)) {
      fail(`jobs[${index}].options.quality must be a number.`)
    }
    options.quality = Math.min(100, Math.max(1, Math.round(value.quality)))
  }

  if (value.keepMetadata !== undefined) {
    if (typeof value.keepMetadata !== 'boolean') {
      fail(`jobs[${index}].options.keepMetadata must be a boolean.`)
    }
    options.keepMetadata = value.keepMetadata
  }

  for (const dimension of ['resizeWidth', 'resizeHeight'] as const) {
    if (value[dimension] !== undefined) {
      if (
        typeof value[dimension] !== 'number' ||
        !Number.isFinite(value[dimension]) ||
        !Number.isInteger(value[dimension]) ||
        value[dimension] < 1 ||
        value[dimension] > 20000
      ) {
        fail(`jobs[${index}].options.${dimension} must be an integer from 1 to 20000.`)
      }
      options[dimension] = value[dimension]
    }
  }

  if (value.backgroundColor !== undefined) {
    if (
      typeof value.backgroundColor !== 'string' ||
      !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(value.backgroundColor)
    ) {
      fail(`jobs[${index}].options.backgroundColor must be a #RRGGBB or #RRGGBBAA color.`)
    }
    options.backgroundColor = value.backgroundColor.toLowerCase()
  }

  return options
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(message: string): never {
  throw invalidRequestError(message)
}
