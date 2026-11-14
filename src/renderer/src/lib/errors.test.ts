import { describe, expect, it } from 'vitest'
import type { ConvertError } from '@shared/types'
import { errorDetailText, errorSentence } from './errors'

function error(overrides: Partial<ConvertError>): ConvertError {
  return { code: 'UNKNOWN', message: 'boom', ...overrides }
}

describe('error presentation', () => {
  it('hides technical validation messages behind a human sentence', () => {
    expect(
      errorSentence(error({ code: 'INVALID_REQUEST', message: 'request.jobs must be an array.' }))
    ).toBe('The app could not start that conversion. Try again.')
  })

  it('adds actionable context for unreadable files', () => {
    expect(
      errorSentence(error({ code: 'UNREADABLE_FILE', message: 'Could not read a.jpg.' }))
    ).toBe('Could not read a.jpg. It may be damaged or use an unsupported encoding.')
  })

  it('uses a generic sentence for unknown errors', () => {
    expect(errorSentence(error({ message: 'ENOENT: no such file' }))).toBe(
      'Something went wrong. Open Details for the technical error.'
    )
  })

  it('formats code, message, and detail for the expandable panel', () => {
    expect(errorDetailText(error({ detail: 'stderr: corrupt data' }))).toBe(
      'Code: UNKNOWN\nMessage: boom\n\nstderr: corrupt data'
    )
    expect(errorDetailText(error({ detail: '   ' }))).toBe('Code: UNKNOWN\nMessage: boom')
  })
})
