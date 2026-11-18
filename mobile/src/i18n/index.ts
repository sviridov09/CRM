// Переводы приложения. Английский — источник, ключи сгруппированы по экранам (en.json).
// Испанский, русский и украинский добавятся перед релизом: файл рядом (es.json …),
// строка в resources и в LANGUAGES. Переключатель языка появится сам, когда языков больше одного.
//
// Импортируется первым в index.ts: тексты нужны и фоновым задачам (уведомления),
// где экраны не монтируются.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';

export const LANGUAGES = { en: 'English' } as const;
export type Language = keyof typeof LANGUAGES;

const LANGUAGE_KEY = 'language';

const isLanguage = (code: string | null | undefined): code is Language => !!code && code in LANGUAGES;

/** Язык телефона, если он среди переведённых; иначе английский. */
function deviceLanguage(): Language {
  const found = getLocales().find((l) => isLanguage(l.languageCode));
  return (found?.languageCode as Language | undefined) ?? 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React Native сам не интерпретирует HTML
  initAsync: false, // ресурсы уже в бандле — инициализируем сразу
});

// Выбор рабочего важнее языка телефона
void AsyncStorage.getItem(LANGUAGE_KEY).then((saved) => {
  if (isLanguage(saved) && saved !== i18n.language) void i18n.changeLanguage(saved);
});

export async function setLanguage(language: Language) {
  await AsyncStorage.setItem(LANGUAGE_KEY, language);
  await i18n.changeLanguage(language);
}

/** Время в формате языка приложения: «5:08 PM», «17:08». */
export function formatTime(value: number | string | Date): string {
  return new Date(value).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' });
}

/** "2026-11-04" → «Nov 4» / «4 нояб.» */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
}

export default i18n;
