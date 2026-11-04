import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
// Здесь лежит publishable key (sb_publishable_...), имя переменной осталось от anon key
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env');
}

export const supabase = createClient(url, key, {
  auth: {
    storage: AsyncStorage, // сессия переживает перезапуск приложения
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // в приложении нет адресной строки
  },
});

// Токен обновляем только пока приложение на экране: в фоне таймеры на телефоне ненадёжны
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
