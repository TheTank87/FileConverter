import { execFile } from 'node:child_process'
import type {
  ConversionEngine,
  ConvertError,
  ConvertInput,
  ConvertOptions,
  FormatId
} from '@shared/types'
import { resolveMagickPath, type BinaryResolution } from '../binaries'
import { discardTemp, promoteTemp, tempPathFor } from './atomic'
import {
  cancelledError,
  convertError,
  errorDetail,
  isConvertError,
  isWriteErrorCode,
  nodeErrorCode,
  outputNotWritableError,
  throwIfAborted,
  unreadableFileError,
  unsupportedConversionError
} from './errors'
import { engineCanConvert, resolveOptions } from './formats'

const MAGICK_CODERS = {
  png: 'PNG',
  jpg: 'JPEG',
  webp: 'WEBP',
  avif: 'AVIF',
  tiff: 'TIFF',
  gif: 'GIF',
  bmp: 'BMP'
} satisfies Record<Exclude<FormatId, 'heic'>, string>

export interface MagickEngineDeps {
  resolveBinary?: () => BinaryResolution
}

export function createMagickEngine(deps: MagickEngineDeps = {}): ConversionEngine {
  const resolveBinary = deps.resolveBinary ?? resolveMagickPath

  return {
    id: 'magick',

    canConvert(from, to) {
      return engineCanConvert('magick', from, to)
    },

    async convert(input, onProgress) {
      const startedAt = Date.now()
      const options = resolveOptions(input.to, input.options)

      if (!engineCanConvert('magick', input.from, input.to)) {
        throw unsupportedConversionError(input.from, input.to)
      }

      throwIfAborted(input.signal)

      const binary = resolveBinary()
      if (!binary.ok) throw binary.error

      onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 0 })
      throwIfAborted(input.signal)

      const tempPath = tempPathFor(input.outputPath, input.jobId)

      try {
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 0 })
        const args = buildArgs(input, options, tempPath)
        await runMagick(binary.path, args, input.signal)
        throwIfAborted(input.signal)

        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 0 })
        await promoteTemp(tempPath, input.outputPath)
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 100 })

        return {
          jobId: input.jobId,
          outputPath: input.outputPath,
          engine: 'magick',
          durationMs: Date.now() - startedAt
        }
      } catch (error) {
        await discardTemp(tempPath)
        if (input.signal?.aborted) throw cancelledError()
        throw mapMagickError(error, input)
      }
    }
  }
}

export const magickEngine: ConversionEngine = createMagickEngine()

function buildArgs(input: ConvertInput, options: ConvertOptions, tempPath: string): string[] {
  const args = [input.inputPath, '-auto-orient']

  if (options.resizeWidth !== undefined || options.resizeHeight !== undefined) {
    args.push('-resize', `${options.resizeWidth ?? ''}x${options.resizeHeight ?? ''}>`)
  }

  if (options.keepMetadata !== true) args.push('-strip')

  if (input.to === 'jpg') {
    args.push(
      '-background',
      options.backgroundColor ?? 'white',
      '-alpha',
      'remove',
      '-alpha',
      'off'
    )
  }

  if (input.to === 'jpg' || input.to === 'webp' || input.to === 'avif') {
    args.push('-quality', String(options.quality ?? 80))
  }

  if (input.to === 'tiff') args.push('-compress', 'LZW')

  args.push(`${coderFor(input.to)}:${tempPath}`)
  return args
}

function coderFor(to: FormatId): string {
  if (to === 'heic') throw unsupportedConversionError('heic', 'heic')
  return MAGICK_CODERS[to]
}

function runMagick(
  binaryPath: string,
  args: readonly string[],
  signal: AbortSignal | undefined
): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      [...args],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, signal },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve()
          return
        }

        reject(new MagickExecError(error, stderr || stdout))
      }
    )
  })
}

class MagickExecError extends Error {
  readonly code: string | undefined
  readonly stderr: string

  constructor(cause: Error, stderr: string) {
    super(cause.message)
    this.name = 'MagickExecError'

    const code = nodeErrorCode(cause)
    this.code = code
    this.stderr = stderr.trim()
  }
}

function mapMagickError(error: unknown, input: ConvertInput): ConvertError {
  if (isConvertError(error)) return error

  const detail = errorDetail(error)
  const code = nodeErrorCode(error)

  if (code === 'ENOENT') {
    return convertError('ENGINE_MISSING', 'ImageMagick is not available.', detail)
  }

  if (code === 'ABORT_ERR' || code === 'ERR_CANCELED') {
    return cancelledError()
  }

  if (isWriteErrorCode(code)) {
    return outputNotWritableError(input.outputPath, detail)
  }

  const stderr = detail ?? ''

  if (
    /permission denied|read-only file system|no space left|unable to open.*for writing/i.test(
      stderr
    )
  ) {
    return outputNotWritableError(input.outputPath, stderr)
  }

  if (
    /no such file|does not exist|unable to open|no decode delegate|improper image header|corrupt/i.test(
      stderr
    )
  ) {
    return unreadableFileError(input.inputPath, stderr)
  }

  return convertError('UNKNOWN', 'ImageMagick could not convert the file.', stderr)
}
