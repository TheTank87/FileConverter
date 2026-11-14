import { useAppStore } from '../state/store'

export function SettingsPanel() {
  const outputDir = useAppStore((state) => state.outputDir)
  const setOutputDir = useAppStore((state) => state.setOutputDir)
  const setError = useAppStore((state) => state.setError)

  async function choose(): Promise<void> {
    const result = await window.api.pickOutputFolder()
    if (!result.ok) {
      setError(result.error)
      return
    }

    if (result.value !== null) await setOutputDir(result.value)
  }

  return (
    <div className="settings-panel">
      <span className="settings-panel__label">Output</span>
      <span className="settings-panel__value" title={outputDir ?? 'Same folder as each source'}>
        {outputDir ?? 'Same folder'}
      </span>
      <button type="button" className="button button--ghost" onClick={() => void choose()}>
        Choose…
      </button>
      {outputDir !== null && (
        <button type="button" className="link-button" onClick={() => void setOutputDir(null)}>
          Clear
        </button>
      )}
    </div>
  )
}
