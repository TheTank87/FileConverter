import type { ConversionEngine, ConvertError, FormatId } from '@shared/types'
import { unsupportedConversionError } from './errors'

export type EngineResolution =
  { ok: true; engine: ConversionEngine } | { ok: false; error: ConvertError }

export function resolveEngine(
  engines: readonly ConversionEngine[],
  from: FormatId,
  to: FormatId
): EngineResolution {
  const engine = engines.find((candidate) => candidate.canConvert(from, to))

  return engine === undefined
    ? { ok: false, error: unsupportedConversionError(from, to) }
    : { ok: true, engine }
}

export class EngineRegistry {
  private readonly engines: ConversionEngine[]

  constructor(engines: readonly ConversionEngine[]) {
    this.engines = [...engines]
  }

  resolve(from: FormatId, to: FormatId): EngineResolution {
    return resolveEngine(this.engines, from, to)
  }

  list(): readonly ConversionEngine[] {
    return [...this.engines]
  }
}
