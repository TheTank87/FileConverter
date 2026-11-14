import type { FormatDef, FormatId } from '@shared/types'

export interface FormatPickerProps {
  id: string
  label: string
  formats: FormatDef[]
  value: FormatId
  from?: FormatId | null
  disabled?: boolean
  hideLabel?: boolean
  onChange(format: FormatId): void
}

export function FormatPicker({
  id,
  label,
  formats,
  value,
  from,
  disabled = false,
  hideLabel = false,
  onChange
}: FormatPickerProps) {
  const source =
    from === undefined || from === null ? undefined : formats.find((format) => format.id === from)

  return (
    <div className="control">
      <label className={hideLabel ? 'sr-only' : 'control__label'} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const next = formats.find((format) => format.id === event.target.value)
          if (next) onChange(next.id)
        }}
      >
        {formats.map((format) => {
          const cannotWrite = !format.canWrite
          const cannotRead = from !== undefined && from !== null && source?.canRead !== true
          const blocked = cannotWrite || cannotRead

          return (
            <option key={format.id} value={format.id} disabled={blocked}>
              {cannotWrite
                ? `${format.label} — cannot be written`
                : cannotRead
                  ? `${format.label} — unsupported source`
                  : format.label}
            </option>
          )
        })}
      </select>
    </div>
  )
}
