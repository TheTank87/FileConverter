import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { FileInfo } from '@shared/types'
import { detectFormat } from './conversion/formats'

export async function statFiles(paths: readonly string[]): Promise<FileInfo[]> {
  const unique = [...new Set(paths)]
  const results = await Promise.all(unique.map(statFile))
  return results.filter((file): file is FileInfo => file !== null)
}

async function statFile(path: string): Promise<FileInfo | null> {
  try {
    const info = await stat(path)
    if (!info.isFile()) return null

    return {
      path,
      name: basename(path),
      size: info.size,
      format: detectFormat(path)
    }
  } catch (error) {
    console.warn(`[files] Skipping unreadable path: ${path}`, error)
    return null
  }
}
