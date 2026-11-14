import { rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export function tempPathFor(outputPath: string, jobId: string): string {
  const safeJobId = jobId.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(dirname(outputPath), `.${basename(outputPath)}.${safeJobId}.tmp`)
}

export async function promoteTemp(tempPath: string, outputPath: string): Promise<void> {
  await rename(tempPath, outputPath)
}

export async function discardTemp(tempPath: string): Promise<void> {
  await rm(tempPath, { force: true }).catch(() => undefined)
}
