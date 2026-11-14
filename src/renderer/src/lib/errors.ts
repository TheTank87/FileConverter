import type { ConvertError, ErrorCode } from '@shared/types'

const FALLBACKS: Record<ErrorCode, string> = {
  UNSUPPORTED_CONVERSION: 'That conversion is not supported.',
  UNREADABLE_FILE: 'The file could not be read.',
  OUTPUT_NOT_WRITABLE: 'The output could not be written.',
  ENGINE_MISSING: 'A required conversion tool is missing.',
  INVALID_REQUEST: 'The app could not start that conversion.',
  CANCELLED: 'The conversion was cancelled.',
  UNKNOWN: 'Something went wrong.'
}

export function errorSentence(error: ConvertError): string {
  const message = error.message.trim()

  switch (error.code) {
    case 'INVALID_REQUEST':
      return 'The app could not start that conversion. Try again.'
    case 'CANCELLED':
      return 'The conversion was cancelled.'
    case 'UNREADABLE_FILE':
      return `${message || FALLBACKS.UNREADABLE_FILE} It may be damaged or use an unsupported encoding.`
    case 'OUTPUT_NOT_WRITABLE':
      return `${message || FALLBACKS.OUTPUT_NOT_WRITABLE} Choose another output folder and try again.`
    case 'ENGINE_MISSING':
      return `${message || FALLBACKS.ENGINE_MISSING} Reinstall the app to restore the bundled tools.`
    case 'UNSUPPORTED_CONVERSION':
      return message || FALLBACKS.UNSUPPORTED_CONVERSION
    case 'UNKNOWN':
      return 'Something went wrong. Open Details for the technical error.'
  }
}

export function errorDetailText(error: ConvertError): string {
  const detail = error.detail?.trim()
  return detail === undefined || detail.length === 0
    ? `Code: ${error.code}\nMessage: ${error.message}`
    : `Code: ${error.code}\nMessage: ${error.message}\n\n${detail}`
}
