// Переводы CRM. Английский — источник (en.json), ключи по разделам.
// Пока на ключах: шапка, вход и уведомления; остальные страницы переводим на ключи,
// когда их трогаем. Переводы бригадиру — во вторую очередь, после мобилки.
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'

export const LANGUAGES = { en: 'English' } as const
export type Language = keyof typeof LANGUAGES

const isLanguage = (code: string): code is Language => code in LANGUAGES

/** Язык браузера, если он среди переведённых; иначе английский. */
function browserLanguage(): Language {
  const code = navigator.languages.map((l) => l.split('-')[0]).find(isLanguage)
  return code ?? 'en'
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: browserLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React сам экранирует
  initAsync: false,
})

export default i18n
