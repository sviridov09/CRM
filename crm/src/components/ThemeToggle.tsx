import { useState } from 'react'
import { applyTheme, currentTheme } from '../lib/theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme)
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}
