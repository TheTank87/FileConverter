import { useState } from 'react'
import type { ConvertError, FormatDef } from '@shared/types'

export function App() {
  const [formats, setFormats] = useState<FormatDef[]>([])
  const [error, setError] = useState<ConvertError | null>(null)

  async function loadFormats(): Promise<void> {
    const result = await window.api.getFormats()
    if (!result.ok) {
      setError(result.error)
      return
    }

    console.log('[formats]', result.value)
    setFormats(result.value)
    setError(null)
  }

  return (
    <main>
      <h1>The Diat Converter</h1>
      <button type="button" onClick={() => void loadFormats()}>
        Log formats
      </button>
      {error === null ? (
        <p>{formats.length === 0 ? 'Scaffold ready.' : `${formats.length} formats loaded.`}</p>
      ) : (
        <p role="alert">{error.message}</p>
      )}
    </main>
  )
}
