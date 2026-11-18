// Здоровье смены: сердцебиение для сервера и контроль выключенной геолокации.
//
// Сервис геолокации просыпается только от новых точек, а с выключенной геолокацией
// их нет. Поэтому проверку зовут из трёх мест: из обработчика точек, из нативного
// приёмника переключателя геолокации (modules/shift-guard) и из фоновой задачи
// раз в ~15 минут (shiftTracking.ts). Если приложение убито совсем, бригадиру
// сообщит сервер: нет сердцебиения 20 минут → уведомление «No signal» (миграция 0005).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { ShiftGuard } from '../../modules/shift-guard';
import { supabase } from '../lib/supabase';

const OFF_KEY = 'location-off-reported';
const CHANNEL = 'location-off';
const NOTIFICATION_ID = 'location-off'; // одно и то же: новое уведомление заменяет старое

export type LocationProblem = 'services' | 'permission' | null;

export async function locationProblem(): Promise<LocationProblem> {
  const [services, fg, bg] = await Promise.all([
    Location.hasServicesEnabledAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  if (!services) return 'services';
  if (!fg.granted || !bg.granted) return 'permission';
  return null;
}

async function warnWorker(problem: Exclude<LocationProblem, null>) {
  const title = problem === 'services' ? 'Location is off' : 'Location permission is off';
  const body = 'Turn it back on to stay on shift. Your foreman has been notified.';
  // То же уведомление, что показывает нативный приёмник: не дублируем
  if (ShiftGuard) {
    ShiftGuard.showLocationOff(title, body);
    return;
  }
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Location is off',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title, body },
    trigger: { channelId: CHANNEL },
  });
}

/**
 * Сердцебиение + отметка о выключенной геолокации в work_sessions одним запросом.
 * Время ставит сервер (триггер), уведомления бригадиру — тоже он.
 */
export async function reportShiftHealth(sessionId: string) {
  const problem = await locationProblem();
  const reported = (await AsyncStorage.getItem(OFF_KEY)) === 'yes';

  const update: Record<string, string | null> = { last_seen_at: new Date().toISOString() };
  if (problem && !reported) update.location_off_since = new Date().toISOString();
  if (!problem && reported) update.location_off_since = null;

  // Рабочему напоминаем при каждой проверке, пока не включит
  if (problem) await warnWorker(problem);
  else if (reported) await dismissWarning();

  const { error } = await supabase.from('work_sessions').update(update).eq('id', sessionId);
  // Нет сети — повторим при следующем пробуждении
  if (!error && 'location_off_since' in update) {
    if (problem) await AsyncStorage.setItem(OFF_KEY, 'yes');
    else await AsyncStorage.removeItem(OFF_KEY);
  }
}

async function dismissWarning() {
  if (ShiftGuard) ShiftGuard.hideLocationOff();
  else await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
}

/** Смена закончена: убираем напоминание и отметку. */
export async function clearShiftHealth() {
  await AsyncStorage.removeItem(OFF_KEY);
  await dismissWarning();
}
