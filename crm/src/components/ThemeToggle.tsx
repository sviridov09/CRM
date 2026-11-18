import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { applyTheme, currentTheme } from '../lib/theme'

export function ThemeToggle() {
  const { t } = useTranslation()
  const [theme, setTheme] = useState(currentTheme)
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = t('nav.switchTheme', { theme: t(next === 'dark' ? 'nav.themeDark' : 'nav.themeLight') })

  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      onClick={() => {
        applyTheme(next)
        setTheme(next)
      }}
      aria-label={label}
      title={label}
    >
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}
