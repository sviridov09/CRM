export type Theme = 'light' | 'dark'

const KEY = 'theme'

/**
 * Сохранённый выбор → системная настройка → тёмная по умолчанию.
 * Начальную тему ставит скрипт в index.html, здесь — чтение и переключение.
 */
export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // приватный режим или запрещённое хранилище — тема просто не запомнится
  }
}
