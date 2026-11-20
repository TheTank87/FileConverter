import { spawn } from 'node:child_process'
import type { ConversionEngine, ConvertInput, FormatId, ProgressFn } from '@shared/types'
import { resolveFfmpegPath, type BinaryResolution } from '../binaries'
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

export interface FfmpegEngineDeps {
  resolveBinary?: () => BinaryResolution
}

const AUDIO_FORMATS = new Set<FormatId>(['mp3', 'wav', 'flac', 'aac', 'ogg'])

const FFMPEG_MUXERS: Partial<Record<FormatId, string>> = {
  mp3: 'mp3',
  wav: 'wav',
  flac: 'flac',
  aac: 'adts',
  ogg: 'ogg',
  mp4: 'mp4',
  mov: 'mov',
  webm: 'webm',
  mkv: 'matroska'
}

export function buildFfmpegArgs(input: ConvertInput, tempPath: string): string[] {
  const muxer = FFMPEG_MUXERS[input.to]
  if (!muxer) throw new Error(`No FFmpeg muxer configured for ${input.to}.`)

  const args = ['-y', '-i', input.inputPath]
  if (input.options.keepMetadata !== true) args.push('-map_metadata', '-1')
  if (AUDIO_FORMATS.has(input.to)) args.push('-vn')
  args.push('-f', muxer, '-progress', 'pipe:2', tempPath)
  return args
}

export function createFfmpegEngine(deps: FfmpegEngineDeps = {}): ConversionEngine {
  const resolveBinary = deps.resolveBinary ?? resolveFfmpegPath

  return {
    id: 'ffmpeg',

    canConvert(from, to) {
      return engineCanConvert('ffmpeg', from, to)
    },

    async convert(input, onProgress) {
      const startedAt = Date.now()
      if (!engineCanConvert('ffmpeg', input.from, input.to)) {
        throw unsupportedConversionError(input.from, input.to)
      }

      throwIfAborted(input.signal)
      const binary = resolveBinary()
      if (!binary.ok) throw binary.error

      const tempPath = tempPathFor(input.outputPath, input.jobId)
      onProgress?.({ jobId: input.jobId, phase: 'reading', percent: 0 })

      try {
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 0 })
        await runFfmpeg(binary.path, input, tempPath, onProgress)
        throwIfAborted(input.signal)
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 0 })
        await promoteTemp(tempPath, input.outputPath)
        onProgress?.({ jobId: input.jobId, phase: 'writing', percent: 100 })
        return {
          jobId: input.jobId,
          outputPath: input.outputPath,
          engine: 'ffmpeg',
          durationMs: Date.now() - startedAt
        }
      } catch (error) {
        await discardTemp(tempPath)
        if (input.signal?.aborted || (isConvertError(error) && error.code === 'CANCELLED')) {
          throw cancelledError()
        }
        throw convertError('UNKNOWN', 'FFmpeg could not convert the file.', errorDetail(error))
      }
    }
  }
}

export const ffmpegEngine: ConversionEngine = createFfmpegEngine()

function runFfmpeg(
  binary: string,
  input: ConvertInput,
  tempPath: string,
  onProgress?: ProgressFn
): Promise<void> {
  const args = buildFfmpegArgs(input, tempPath)

  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true })
    let stderr = ''

    const abort = (): void => {
      child.kill()
      reject(cancelledError())
    }
    input.signal?.addEventListener('abort', abort, { once: true })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderr += text
      const match = /progress=(continue|end)/.exec(text)
      if (match?.[1] === 'continue')
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 50 })
      if (match?.[1] === 'end')
        onProgress?.({ jobId: input.jobId, phase: 'converting', percent: 100 })
    })
    child.once('error', (error) => {
      input.signal?.removeEventListener('abort', abort)
      reject(error)
    })
    child.once('close', (code) => {
      input.signal?.removeEventListener('abort', abort)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `FFmpeg exited with code ${code ?? 'unknown'}.`))
    })
  })
}
