import { spawn } from 'node:child_process'
import type { ConversionEngine, ConvertInput, FormatId, ProgressFn } from '@shared/types'
import { resolvePandocPath, type BinaryResolution } from '../binaries'
import { discardTemp, promoteTemp, tempPathFor } from './atomic'
import {
  cancelledError,
  convertError,
  errorDetail,
  isConvertError,
  throwIfAborted,
  unsupportedConversionError
} from './errors'
import { engineCanConvert } from './formats'

export interface PandocEngineDeps {
  resolveBinary?: () => BinaryResolution
}

export function createPandocEngine(deps: PandocEngineDeps = {}): ConversionEngine {
  const resolveBinary = deps.resolveBinary ?? resolvePandocPath

  return {
    id: 'pandoc',

    canConvert(from, to) {
      return engineCanConvert('pandoc', from, to)
    },

    async convert(input, onProgress) {
      const startedAt = Date.now()
      if (!engineCanConvert('pandoc', input.from, input.to)) {
        throw unsupportedConversionError(input.from, input.to)
      }

      throwIfAborted(input.signal)
      const binary = resolveBinary()
      if (!binary.ok) throw binary.error

      const tempPath = tempPathFor(input.outputPath, input.jobId)
      onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 0 })

      try {
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 0 })
        await runPandoc(binary.path, input, tempPath, onProgress)
        throwIfAborted(input.signal)
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 0 })
        await promoteTemp(tempPath, input.outputPath)
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 100 })
        return {
          jobId: input.jobId,
          outputPath: input.outputPath,
          engine: 'pandoc',
          durationMs: Date.now() - startedAt
        }
      } catch (error) {
        await discardTemp(tempPath)
        if (input.signal?.aborted || (isConvertError(error) && error.code === 'CANCELLED')) {
          throw cancelledError()
        }
        throw convertError('UNKNOWN', 'Pandoc could not convert the document.', errorDetail(error))
      }
    }
  }
}

export const pandocEngine: ConversionEngine = createPandocEngine()

function runPandoc(
  binary: string,
  input: ConvertInput,
  tempPath: string,
  onProgress?: ProgressFn
): Promise<void> {
  const args = [
    '--from',
    pandocFormat(input.from),
    '--to',
    pandocFormat(input.to),
    '--output',
    tempPath,
    input.inputPath
  ]
  if (input.options.keepMetadata !== true) args.splice(0, 0, '--strip-comments')

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    let stderr = ''

    const abort = (): void => {
      child.kill()
      reject(cancelledError())
    }
    input.signal?.addEventListener('abort', abort, { once: true })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', (error) => {
      input.signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (code) => {
      input.signal?.removeEventListener('abort', abort)
      if (code === 0) {
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 100 })
        resolve()
      } else {
        reject(new Error(stderr.trim() || `Pandoc exited with code ${code ?? 'unknown'}.`))
      }
    })
  })
}

function pandocFormat(id: FormatId): string {
  switch (id) {
    case 'txt':
      return 'plain'
    case 'md':
      return 'markdown'
    case 'html':
      return 'html'
    case 'docx':
      return 'docx'
    case 'odt':
      return 'odt'
    default:
      throw unsupportedConversionError(id, id)
  }
}
