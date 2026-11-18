// Ключи переводов проверяются TypeScript'ом: опечатка в t('…') — ошибка сборки.
import 'i18next';
import type en from './en.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof en };
  }
}
