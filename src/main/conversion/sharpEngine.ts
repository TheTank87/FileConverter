import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import sharp from 'sharp'
import type {
  ConversionEngine,
  ConvertError,
  ConvertInput,
  ConvertOptions,
  FormatId
} from '@shared/types'
import { discardTemp, promoteTemp, tempPathFor } from './atomic'
import {
  cancelledError,
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

type Sharp = ReturnType<typeof sharp>

export const sharpEngine: ConversionEngine = {
  id: 'sharp',

  canConvert(from, to) {
    return engineCanConvert('sharp', from, to)
  },

  async convert(input, onProgress) {
    const startedAt = Date.now()
    const options = resolveOptions(input.to, input.options)

    if (!engineCanConvert('sharp', input.from, input.to)) {
      throw unsupportedConversionError(input.from, input.to)
    }

    throwIfAborted(input.signal)
    onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 0 })

    try {
      await access(input.inputPath, constants.R_OK)
    } catch (error) {
      throw unreadableFileError(input.inputPath, errorDetail(error))
    }

    onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 100 })
    throwIfAborted(input.signal)

    const tempPath = tempPathFor(input.outputPath, input.jobId)

    try {
      onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 0 })
      const pipeline = buildPipeline(input.inputPath, input.from, input.to, options)
      onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 100 })
      throwIfAborted(input.signal)

      onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 0 })
      await pipeline.toFile(tempPath)
      throwIfAborted(input.signal)

      await promoteTemp(tempPath, input.outputPath)
      onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 100 })

      return {
        jobId: input.jobId,
        outputPath: input.outputPath,
        engine: 'sharp',
        durationMs: Date.now() - startedAt
      }
    } catch (error) {
      await discardTemp(tempPath)
      if (input.signal?.aborted) throw cancelledError()
      throw mapSharpError(error, input)
    }
  }
}

function buildPipeline(
  inputPath: string,
  from: FormatId,
  to: FormatId,
  options: ConvertOptions
): Sharp {
  const animated = isAnimatedPair(from, to)
  let pipeline = sharp(inputPath, { animated }).autoOrient()

  if (options.resizeWidth !== undefined || options.resizeHeight !== undefined) {
    pipeline = pipeline.resize({
      width: options.resizeWidth,
      height: options.resizeHeight,
      fit: 'inside',
      withoutEnlargement: true
    })
  }

  if (to === 'jpg') {
    pipeline = pipeline.flatten({ background: options.backgroundColor ?? '#ffffff' })
  }

  pipeline = options.keepMetadata === true ? pipeline.keepMetadata() : pipeline.keepIccProfile()

  return encode(pipeline, to, options)
}

function encode(pipeline: Sharp, to: FormatId, options: ConvertOptions): Sharp {
  const quality = options.quality ?? 80

  switch (to) {
    case 'png':
      return pipeline.png()
    case 'jpg':
      return pipeline.jpeg({ quality })
    case 'webp':
      return pipeline.webp({ quality })
    case 'avif':
      return pipeline.avif({ quality })
    case 'tiff':
      return pipeline.tiff({ compression: 'lzw', predictor: 'horizontal' })
    case 'gif':
      return pipeline.gif()
    case 'heic':
    case 'bmp':
      throw new Error(`sharp cannot encode ${to.toUpperCase()}`)
  }
}

function isAnimatedPair(from: FormatId, to: FormatId): boolean {
  return (from === 'gif' || from === 'webp') && (to === 'gif' || to === 'webp')
}

function mapSharpError(error: unknown, input: ConvertInput): ConvertError {
  if (isConvertError(error)) return error

  const code = nodeErrorCode(error)
  const detail = errorDetail(error)

  if (isWriteErrorCode(code)) {
    return outputNotWritableError(input.outputPath, detail)
  }

  return unreadableFileError(input.inputPath, detail)
}
