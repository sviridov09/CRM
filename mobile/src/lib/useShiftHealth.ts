import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import i18n from '../i18n';
import { ShiftGuard } from '../../modules/shift-guard';
import { locationProblem, reportShiftHealth, type LocationProblem } from '../geo/shiftHealth';
import { isShiftRunning, readShiftState } from '../geo/shiftTracking';

/** Идёт смена, а геолокация выключена: экран-предупреждение, пока не включат. */
export function useShiftHealth() {
  const [problem, setProblem] = useState<LocationProblem>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const lastReported = useRef<LocationProblem | undefined>(undefined);

  const refresh = useCallback(async () => {
    const state = await readShiftState();
    const id = state?.sessionId && (await isShiftRunning()) ? state.sessionId : null;
    if (id) ShiftGuard?.startWatching(i18n.t('locationOff.servicesTitle'), i18n.t('locationOff.notificationBody')); // приложение перезапустилось посреди смены
    const current = id ? await locationProblem() : null;
    setSessionId(id);
    setProblem(current);
    // Сразу сообщаем серверу о смене состояния, не дожидаясь фоновой проверки
    if (id && current !== lastReported.current) {
      lastReported.current = current;
      await reportShiftHealth(id).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refresh();
    });
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [refresh]);

  return { problem, sessionId, refresh };
}
