import { describe, expect, it } from 'vitest'
import type { BinaryResolution } from '../binaries'
import { createPandocEngine } from './pandocEngine'

describe('pandoc engine', () => {
  it('accepts supported document conversions only', () => {
    const engine = createPandocEngine({
      resolveBinary: () => ({ ok: true, path: '/usr/local/bin/pandoc' })
    })

    expect(engine.canConvert('md', 'docx')).toBe(true)
    expect(engine.canConvert('docx', 'odt')).toBe(true)
    expect(engine.canConvert('png', 'docx')).toBe(false)
  })

  it('reports a missing binary before starting a conversion', async () => {
    const missing: BinaryResolution = {
      ok: false,
      error: { code: 'ENGINE_MISSING', message: 'Pandoc is missing.' }
    }
    const engine = createPandocEngine({ resolveBinary: () => missing })

    await expect(
      engine.convert({
        jobId: '00000000-0000-4000-8000-000000000002',
        inputPath: '/tmp/input.md',
        outputPath: '/tmp/output.docx',
        from: 'md',
        to: 'docx',
        options: {}
      })
    ).rejects.toEqual(missing.error)
  })
})
