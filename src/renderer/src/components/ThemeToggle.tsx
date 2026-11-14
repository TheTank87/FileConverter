import type { ThemeMode } from '@shared/types'
import { useAppStore } from '../state/store'

const OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' }
]

export function ThemeToggle() {
  const theme = useAppStore((state) => state.settings.theme)
  const setTheme = useAppStore((state) => state.setTheme)

  return (
    <div className="segmented" role="group" aria-label="Theme">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="segmented__button"
          aria-pressed={theme === option.value}
          onClick={() => void setTheme(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
