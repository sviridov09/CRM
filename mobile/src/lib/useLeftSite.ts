import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { answerLeftSite, readAwaiting, type Awaiting } from '../geo/leftSite';
import { rescheduleCheck } from '../geo/shiftTracking';

// Запас к обещанному времени: рабочему нужно дойти, а точка приходит раз в несколько минут
const RETURN_GRACE_MINUTES = 2;

/** Открытый вопрос «You left the site» и ответы на него из уведомления. */
export function useLeftSite() {
  const [awaiting, setAwaiting] = useState<Awaiting | null>(null);

  const refresh = useCallback(async () => {
    setAwaiting(await readAwaiting());
  }, []);

  const answer = useCallback(
    async (pingId: string, minutes: number) => {
      // Проверяем, вернулся ли рабочий к обещанному времени
      if (await answerLeftSite(pingId, minutes)) {
        await rescheduleCheck((minutes + RETURN_GRACE_MINUTES) * 60_000);
      }
      await refresh();
    },
    [refresh],
  );

  useEffect(() => {
    async function handle(response: Notifications.NotificationResponse) {
      const pingId = response.notification.request.content.data?.pingId;
      const minutes = Number(/^back_(\d+)$/.exec(response.actionIdentifier)?.[1]);
      // Нажали на само уведомление — просто откроется экран с вопросом
      if (typeof pingId === 'string' && minutes) {
        // Ошибка сети: вопрос останется на экране, ответить можно ещё раз
        await answer(pingId, minutes).catch(() => undefined);
      }
      await refresh();
    }

    void refresh();
    // Кнопка нажата, когда приложение было закрыто: ответ ждёт нас при запуске
    void Notifications.getLastNotificationResponseAsync().then(async (response) => {
      if (!response) return;
      await Notifications.clearLastNotificationResponseAsync();
      await handle(response);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((r) => void handle(r));
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    // Вопрос появляется из фоновой задачи, пока экран открыт
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      sub.remove();
      appState.remove();
      clearInterval(timer);
    };
  }, [answer, refresh]);

  return { awaiting, answer };
}
