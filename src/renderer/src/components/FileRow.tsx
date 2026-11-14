import type { FormatDef, Job, ProgressPhase } from '@shared/types'
import { ErrorDetails } from './ErrorDetails'
import { FormatPicker } from './FormatPicker'
import { ProgressBar } from './ProgressBar'
import { errorSentence } from '../lib/errors'
import { formatBytes } from '../lib/format'
import { canConvert, unknownError, useAppStore } from '../state/store'

export interface FileRowProps {
  job: Job
  formats: FormatDef[]
}

export function FileRow({ job, formats }: FileRowProps) {
  const removeFile = useAppStore((state) => state.removeFile)
  const setFileFormat = useAppStore((state) => state.setFileFormat)
  const setFileOptions = useAppStore((state) => state.setFileOptions)
  const moveFile = useAppStore((state) => state.moveFile)
  const files = useAppStore((state) => state.files)
  const setError = useAppStore((state) => state.setError)
  const batchId = useAppStore((state) => state.batchId)
  const progress = useAppStore((state) => state.progress[job.id])

  const source =
    job.input.format === null ? undefined : formats.find((format) => format.id === job.input.format)
  const supported = canConvert(formats, job.input.format, job.to)
  const editable = job.status === 'queued' && job.batchId === ''
  const locked = job.status === 'running' || (batchId !== null && job.batchId === batchId)
  const percent = progress?.percent ?? (job.status === 'done' ? 100 : 0)

  async function openOutput(): Promise<void> {
    if (job.outputPath === undefined) return
    const result = await window.api.openPath(job.outputPath)
    if (!result.ok) setError(result.error)
  }

  async function revealOutput(): Promise<void> {
    if (job.outputPath === undefined) return
    const result = await window.api.revealInFolder(job.outputPath)
    if (!result.ok) setError(result.error)
  }

  async function copyPath(): Promise<void> {
    if (job.outputPath === undefined) return

    try {
      await navigator.clipboard.writeText(job.outputPath)
    } catch {
      setError(unknownError('Could not copy the file path.'))
    }
  }

  return (
    <li className="file-row">
      <span className="file-row__thumb" aria-hidden="true">
        {source?.label ?? '?'}
      </span>

      <div className="file-row__info">
        <div className="file-row__name" title={job.input.path}>
          {job.input.name}
        </div>
        <div className="file-row__meta">
          <span>{formatBytes(job.input.size)}</span>
          <span>{source?.label ?? 'Unknown'}</span>
          <span aria-hidden="true">→</span>
          <span className="sr-only">convert to</span>
          <span>{targetLabel(formats, job)}</span>
        </div>
      </div>

      <div className="file-row__picker">
        <FormatPicker
          id={`format-${job.id}`}
          label={`Convert ${job.input.name} to`}
          hideLabel
          formats={formats}
          value={job.to}
          from={job.input.format}
          disabled={job.input.format === null || !editable}
          onChange={(to) => setFileFormat(job.id, to)}
        />
      </div>

      {editable && (source?.kind === 'image' || source?.kind === 'audio') && (
        <div className="file-row__options">
          {source.kind === 'image' && (
            <label>
              <span>Quality</span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={job.options.quality ?? ''}
                placeholder="Default"
                onChange={(event) =>
                  setFileOptions(job.id, { quality: optionalNumber(event.target.value) })
                }
              />
            </label>
          )}
          {source.kind === 'image' && (
            <label>
              <span>Width</span>
              <input
                type="number"
                min="1"
                max="20000"
                step="1"
                value={job.options.resizeWidth ?? ''}
                placeholder="Auto"
                onChange={(event) =>
                  setFileOptions(job.id, { resizeWidth: optionalNumber(event.target.value) })
                }
              />
            </label>
          )}
          {source.kind === 'image' && (
            <label>
              <span>Height</span>
              <input
                type="number"
                min="1"
                max="20000"
                step="1"
                value={job.options.resizeHeight ?? ''}
                placeholder="Auto"
                onChange={(event) =>
                  setFileOptions(job.id, { resizeHeight: optionalNumber(event.target.value) })
                }
              />
            </label>
          )}
          {source.kind === 'image' && job.to === 'jpg' && (
            <label>
              <span>Background</span>
              <input
                type="text"
                value={job.options.backgroundColor ?? '#ffffff'}
                pattern="#[0-9a-fA-F]{6,8}"
                onChange={(event) =>
                  setFileOptions(job.id, { backgroundColor: event.target.value })
                }
              />
            </label>
          )}
          <label className="file-row__checkbox">
            <input
              type="checkbox"
              checked={job.options.keepMetadata === true}
              onChange={(event) => setFileOptions(job.id, { keepMetadata: event.target.checked })}
            />
            <span>Keep metadata</span>
          </label>
        </div>
      )}

      <button
        type="button"
        className="icon-button file-row__remove"
        aria-label={`Remove ${job.input.name}`}
        title="Remove"
        disabled={locked}
        onClick={() => removeFile(job.id)}
      >
        ×
      </button>
      <div className="file-row__order">
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${job.input.name} up`}
          disabled={locked || files[0]?.id === job.id}
          onClick={() => moveFile(job.id, 'up')}
        >
          ↑
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={`Move ${job.input.name} down`}
          disabled={locked || files[files.length - 1]?.id === job.id}
          onClick={() => moveFile(job.id, 'down')}
        >
          ↓
        </button>
      </div>

      <div className={`file-row__status file-row__status--${job.status}`}>
        <Status job={job} supported={supported} percent={percent} phase={progress?.phase} />
        {job.status === 'done' && (
          <div className="file-row__actions">
            <button type="button" className="link-button" onClick={() => void openOutput()}>
              Save
            </button>
            <button type="button" className="link-button" onClick={() => void revealOutput()}>
              Reveal
            </button>
            <button type="button" className="link-button" onClick={() => void copyPath()}>
              Copy path
            </button>
          </div>
        )}
      </div>
    </li>
  )
}

interface StatusProps {
  job: Job
  supported: boolean
  percent: number
  phase?: ProgressPhase
}

function Status({ job, supported, percent, phase }: StatusProps) {
  if (job.status === 'running') {
    return (
      <>
        <ProgressBar value={percent} label={`Progress for ${job.input.name}`} />
        <span className="file-row__status-text">
          {phase === undefined ? 'Converting' : phaseLabel(phase)} · {percent}%
        </span>
      </>
    )
  }

  if (job.status === 'done') {
    return (
      <span className="file-row__status-text">Converted to {fileName(job.outputPath ?? '')}</span>
    )
  }

  if (job.status === 'failed') {
    if (job.error === undefined) {
      return (
        <span className="file-row__status-text" role="alert">
          Conversion failed.
        </span>
      )
    }

    return (
      <>
        <span className="file-row__status-text" role="alert">
          {errorSentence(job.error)}
        </span>
        <ErrorDetails error={job.error} />
      </>
    )
  }

  if (job.status === 'cancelled') return <span className="file-row__status-text">Cancelled.</span>

  if (job.input.format === null) {
    return <span className="file-row__status-text">Unsupported file type.</span>
  }

  if (!supported) {
    return <span className="file-row__status-text">This conversion is not supported.</span>
  }

  return <span className="file-row__status-text">Ready to convert.</span>
}

function phaseLabel(phase: ProgressPhase): string {
  return phase.charAt(0).toUpperCase() + phase.slice(1)
}

function targetLabel(formats: FormatDef[], job: Job): string {
  return formats.find((format) => format.id === job.to)?.label ?? job.to.toUpperCase()
}

function fileName(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}
