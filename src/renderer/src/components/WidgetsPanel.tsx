import { useState } from 'react'
import type { FormatDef } from '@shared/types'
import { useAppStore } from '../state/store'

export function WidgetsPanel({ formats }: { formats: FormatDef[] }) {
  const recent = useAppStore((state) => state.recentConversions)
  const presets = useAppStore((state) => state.presets)
  const savePreset = useAppStore((state) => state.savePreset)
  const deletePreset = useAppStore((state) => state.deletePreset)
  const applyPreset = useAppStore((state) => state.applyPreset)
  const openRecent = useAppStore((state) => state.openRecent)
  const revealRecent = useAppStore((state) => state.revealRecent)
  const targetFormat = useAppStore((state) => state.targetFormat)
  const files = useAppStore((state) => state.files)
  const [name, setName] = useState('')

  function createPreset(): void {
    const source = files.find((job) => job.status === 'queued' && job.batchId === '')
    savePreset(name, source?.to ?? targetFormat, source?.options ?? {})
    setName('')
  }

  return (
    <section className="widgets" aria-label="Presets and recent conversions">
      <details className="widget">
        <summary>Presets ({presets.length})</summary>
        <div className="widget__body">
          <div className="preset-create">
            <input
              aria-label="Preset name"
              placeholder="Preset name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              type="button"
              className="button"
              disabled={name.trim() === ''}
              onClick={createPreset}
            >
              Save current
            </button>
          </div>
          {presets.length === 0 ? (
            <p className="widget__empty">Save a format and option combination for reuse.</p>
          ) : (
            <ul className="widget__list">
              {presets.map((preset) => (
                <li key={preset.id}>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => applyPreset(preset.id)}
                  >
                    {preset.name}
                  </button>
                  <span>{formatLabel(formats, preset.to)}</span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Delete ${preset.name}`}
                    onClick={() => deletePreset(preset.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="widget">
        <summary>Recent conversions ({recent.length})</summary>
        <div className="widget__body">
          {recent.length === 0 ? (
            <p className="widget__empty">Completed conversions will appear here.</p>
          ) : (
            <ul className="widget__list">
              {recent.map((item) => (
                <li key={item.id}>
                  <span title={item.outputPath}>
                    {item.inputName} → {formatLabel(formats, item.to)}
                  </span>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void openRecent(item.id)}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => void revealRecent(item.id)}
                  >
                    Reveal
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </section>
  )
}

function formatLabel(formats: FormatDef[], id: FormatDef['id']): string {
  return formats.find((format) => format.id === id)?.label ?? id.toUpperCase()
}
