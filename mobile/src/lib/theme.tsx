// Тема приложения: цвета только отсюда — как тексты только через ключи i18n.
// Палитры по смыслу те же, что в CRM (crm/src/index.css), чтобы продукт выглядел единым.
// Контраст текста к своему фону ≥ 4.5:1 (проверено расчётом WCAG).
//
// По умолчанию — системная тема телефона. Выбор Light/Dark сохраняется и через
// Appearance.setColorScheme переключает и системные части: диалоги Alert, клавиатуру.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SystemUI from 'expo-system-ui';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, StyleSheet, useColorScheme } from 'react-native';
import type { TaskStatus } from '../../../shared/types';

export type Palette = {
  bg: string;
  surface: string;
  border: string;
  text: string;
  muted: string;
  accent: string; // ссылки и второстепенные кнопки
  primary: string; // фон главной кнопки
  onPrimary: string;
  success: string; // фон кнопки Finish shift
  danger: string; // текст ошибок
  dangerButton: string; // фон красной кнопки с белым текстом
  errorBg: string;
  selectedBg: string; // выбранный вариант в переключателях
  status: Record<TaskStatus, { bg: string; fg: string }>;
};

const light: Palette = {
  bg: '#f5f6f8',
  surface: '#ffffff',
  border: '#dfe2e7',
  text: '#1c2129',
  muted: '#626b7a',
  accent: '#1a62d6',
  primary: '#1f6feb',
  onPrimary: '#ffffff',
  success: '#1d7a3a',
  danger: '#b8322d',
  dangerButton: '#b8322d',
  errorBg: '#fdecea',
  selectedBg: '#e8effd',
  status: {
    assigned: { bg: '#e8ebf0', fg: '#555e6c' },
    in_progress: { bg: '#fff6e0', fg: '#8a5a00' },
    done: { bg: '#e5f6ea', fg: '#1d7a3a' },
  },
};

const dark: Palette = {
  bg: '#0f1216',
  surface: '#171b21',
  border: '#2c333d',
  text: '#e6e9ee',
  muted: '#9aa3b0',
  accent: '#6ea4ff',
  primary: '#2f6fde',
  onPrimary: '#ffffff',
  success: '#1d7a3a',
  danger: '#ff7b72',
  dangerButton: '#b8322d',
  errorBg: '#3a1d1f',
  selectedBg: '#16284a',
  status: {
    assigned: { bg: '#262c35', fg: '#9aa3b0' },
    in_progress: { bg: '#3a2e12', fg: '#f2c46b' },
    done: { bg: '#13301e', fg: '#6fd391' },
  },
};

/** Общие стили экранов. */
function createUi(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    centered: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14 },
    h1: { fontSize: 26, fontWeight: '700', color: c.text },
    text: { fontSize: 16, lineHeight: 23, color: c.text },
    muted: { fontSize: 15, lineHeight: 21, color: c.muted },
    label: { fontSize: 14, fontWeight: '600', color: c.text },
    input: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.text,
    },
    card: { backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 16 },
    button: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 15, alignItems: 'center' },
    buttonText: { color: c.onPrimary, fontSize: 17, fontWeight: '600' },
    buttonSuccess: { backgroundColor: c.success },
    buttonDanger: { backgroundColor: c.dangerButton },
    buttonSecondary: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    buttonSecondaryText: { color: c.accent, fontSize: 16, fontWeight: '600' },
    disabled: { opacity: 0.5 },
    error: { color: c.danger, backgroundColor: c.errorBg, padding: 12, borderRadius: 10, fontSize: 15 },
    badge: {
      alignSelf: 'flex-start',
      fontSize: 13,
      fontWeight: '600',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: 'hidden',
    },
  });
}

export type ThemeMode = 'system' | 'light' | 'dark';
export const THEME_MODES: ThemeMode[] = ['system', 'light', 'dark'];

type Theme = {
  colors: Palette;
  ui: ReturnType<typeof createUi>;
  scheme: 'light' | 'dark';
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

const MODE_KEY = 'theme-mode';
const isMode = (v: string | null): v is ThemeMode => v === 'system' || v === 'light' || v === 'dark';

// Готовые наборы: при переключении темы стили не пересоздаются
const THEMES = {
  light: { colors: light, ui: createUi(light) },
  dark: { colors: dark, ui: createUi(dark) },
};

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system');
  // Учитывает и Appearance.setColorScheme: при выбранной Light/Dark вернёт её
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    void AsyncStorage.getItem(MODE_KEY).then((saved) => {
      if (isMode(saved)) setModeState(saved);
    });
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  const value = useMemo<Theme>(
    () => ({
      ...THEMES[scheme],
      scheme,
      mode,
      setMode: (next) => {
        setModeState(next);
        void AsyncStorage.setItem(MODE_KEY, next);
      },
    }),
    [scheme, mode],
  );

  // Фон окна под экранами: без белой вспышки при переходах в тёмной теме
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(value.colors.bg);
  }, [value.colors.bg]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
}

/** Стили экрана, зависящие от цветов: фабрика вне компонента, пересчёт только при смене темы. */
export function useThemedStyles<T>(factory: (c: Palette) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
