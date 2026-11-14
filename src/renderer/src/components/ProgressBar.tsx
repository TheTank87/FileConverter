export interface ProgressBarProps {
  value: number
  label: string
  showLabel?: boolean
  large?: boolean
}

export function ProgressBar({ value, label, showLabel = false, large = false }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, Math.round(value)))

  return (
    <div className="progress-wrap">
      {showLabel && (
        <div className="progress-label">
          <span>{label}</span>
          <span>{percent}%</span>
        </div>
      )}
      <div
        className={large ? 'progress progress--lg' : 'progress'}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
