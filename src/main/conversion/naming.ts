import { basename, dirname, extname, join, resolve } from 'node:path'
import type { FormatId } from '@shared/types'
import { FORMAT_MATRIX } from './formats'

export type FileExists = (path: string) => boolean

/**
 * Resolve a unique output path for a job. Pure: the caller supplies the
 * existence check so naming can be tested without touching the filesystem.
 */
export function resolveOutputPath(
  inputPath: string,
  to: FormatId,
  outputDir: string | null,
  exists: FileExists
): string {
  const extension = outputExtension(to)
  const directory = outputDir ?? dirname(inputPath)
  const sourceName = basename(inputPath)
  const sourceExtension = extname(sourceName)
  const stem =
    sourceExtension.length > 0 ? sourceName.slice(0, -sourceExtension.length) : sourceName

  for (let attempt = 0; ; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt}`
    const candidate = join(directory, `${stem}${suffix}${extension}`)

    if (!isTaken(candidate, inputPath, exists)) return candidate
  }
}

function isTaken(candidate: string, inputPath: string, exists: FileExists): boolean {
  // The source must never be overwritten, even if the caller's existence
  // check is unaware of it (e.g. a same-format conversion).
  if (resolve(candidate) === resolve(inputPath)) return true
  return exists(candidate)
}

function outputExtension(to: FormatId): string {
  const extension = FORMAT_MATRIX[to].extensions[0] ?? to
  return `.${extension}`
}
