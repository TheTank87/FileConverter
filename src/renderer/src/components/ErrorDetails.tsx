import type { ConvertError } from '@shared/types'
import { errorDetailText } from '../lib/errors'

export function ErrorDetails({ error }: { error: ConvertError }) {
  return (
    <details className="error-details">
      <summary>Details</summary>
      <pre>{errorDetailText(error)}</pre>
    </details>
  )
}
