// Рабочий вне объекта: уведомление с вопросом, когда вернётся. Ответ пишем в location_pings,
// дальше триггер в базе сам шлёт уведомление бригадиру. Нет ответа 10 минут → no_response.
//
// Кнопки уведомления открывают приложение, а вопрос дублируется экраном LeftSiteScreen:
// так ответить можно, даже если уведомление смахнули.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

const AWAITING_KEY = 'left-site-awaiting';
const RESPONSE_WINDOW_MS = 10 * 60_000;
const CHANNEL = 'left-site';
const CATEGORY = 'left_site'; // в идентификаторе категории нельзя использовать «-» и «:»

export const RETURN_OPTIONS = [15, 30, 60];

export type Awaiting = { pingId: string; deadline: number; notificationId: string };

// Без обработчика уведомление не показывается, пока приложение открыто
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function readAwaiting(): Promise<Awaiting | null> {
  const raw = await AsyncStorage.getItem(AWAITING_KEY);
  return raw ? (JSON.parse(raw) as Awaiting) : null;
}

async function finish(awaiting: Awaiting) {
  await AsyncStorage.removeItem(AWAITING_KEY);
  await Notifications.dismissNotificationAsync(awaiting.notificationId);
}

/** Спрашиваем рабочего про проверку вне объекта. Пока вопрос открыт, новый не задаём. */
export async function promptLeftSite(pingId: string) {
  if (await readAwaiting()) return;

  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Left the site',
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationCategoryAsync(
    CATEGORY,
    RETURN_OPTIONS.map((minutes) => ({
      identifier: `back_${minutes}`,
      buttonTitle: `Back in ${minutes} min`,
      options: { opensAppToForeground: true },
    })),
  );
  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'You left the site',
      body: 'When will you be back? If you don’t answer in 10 minutes, your foreman will be told.',
      categoryIdentifier: CATEGORY,
      data: { pingId },
    },
    trigger: { channelId: CHANNEL },
  });
  const awaiting: Awaiting = { pingId, deadline: Date.now() + RESPONSE_WINDOW_MS, notificationId };
  await AsyncStorage.setItem(AWAITING_KEY, JSON.stringify(awaiting));
}

/**
 * Рабочий ответил. При ошибке вопрос остаётся открытым, чтобы ответить ещё раз.
 * false — вопрос уже закрыт: ответил раньше или вышло время.
 */
export async function answerLeftSite(pingId: string, minutes: number): Promise<boolean> {
  const awaiting = await readAwaiting();
  if (awaiting?.pingId !== pingId) return false;

  const { error } = await supabase
    .from('location_pings')
    .update({ response: 'left', return_in_minutes: minutes })
    .eq('id', pingId);
  if (error) throw error;
  await finish(awaiting);
  return true;
}

/** Вызывается при каждом обновлении сервиса: вышло время — записываем no_response. */
export async function expireLeftSite() {
  const awaiting = await readAwaiting();
  if (!awaiting || Date.now() < awaiting.deadline) return;

  const { error } = await supabase
    .from('location_pings')
    .update({ response: 'no_response' })
    .eq('id', awaiting.pingId)
    .is('response', null);
  if (!error) await finish(awaiting); // нет сети — повторим при следующем обновлении
}

/** Смена остановлена: вопрос больше не актуален. */
export async function clearLeftSite() {
  const awaiting = await readAwaiting();
  if (awaiting) await finish(awaiting);
}
