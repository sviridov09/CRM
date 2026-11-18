// Фоновая геолокация на смене: foreground service + проверки в случайное время.
//
// Как устроено: Android не даёт точных «будильников» в случайное время, поэтому
// сервис получает обновления раз в несколько минут, а в обработчике мы смотрим,
// не пора ли делать проверку (время следующей проверки храним в AsyncStorage).
//
// С sessionId проверки пишутся в location_pings. Без него (экран Location test) —
// только в локальный журнал.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundTask from 'expo-background-task';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { nextPingDelayMs } from '../../../shared/types';
import { supabase } from '../lib/supabase';
import { clearLeftSite, expireLeftSite, promptLeftSite } from './leftSite';
import { clearShiftHealth, reportShiftHealth } from './shiftHealth';

export const SHIFT_TASK = 'shift-location';
// Резервное пробуждение: точки не приходят, если геолокацию выключили
const SHIFT_WATCH_TASK = 'shift-watch';
const STATE_KEY = 'shift-proto-state';

export type Check = {
  at: number;
  lat: number;
  lng: number;
  accuracy: number | null;
  onSite?: boolean | null; // ответ базы; пусто, пока проверка не дошла до сервера
};

type PendingPing = {
  session_id: string;
  device_time: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
};

export type ShiftState = {
  testMode: boolean; // проверки раз в 2–4 мин вместо 60–120, чтобы не ждать часами
  sessionId: string | null;
  startedAt: number;
  nextCheckAt: number;
  updates: number; // сколько точек прислал сервис — видно, жив ли он в фоне
  lastUpdateAt: number | null;
  checks: Check[]; // новые сверху
  pendingPings: PendingPing[]; // ждут отправки (нет сети)
};

export async function readShiftState(): Promise<ShiftState | null> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  if (!raw) return null;
  // Смена могла начаться на старой версии приложения: новых полей в сохранённом состоянии нет
  return { sessionId: null, pendingPings: [], ...(JSON.parse(raw) as Partial<ShiftState>) } as ShiftState;
}

async function writeShiftState(state: ShiftState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

const nextDelay = (testMode: boolean) => (testMode ? nextPingDelayMs(2, 4) : nextPingDelayMs());

/** Отправляет накопленные проверки. При ошибке они остаются в очереди до следующего обновления. */
async function flushPings(state: ShiftState) {
  const { data, error } = await supabase
    .from('location_pings')
    .insert(state.pendingPings)
    .select('id, device_time, on_site');
  if (error) return;
  state.pendingPings = [];
  for (const row of data) {
    const check = state.checks.find((c) => c.at === Date.parse(row.device_time));
    if (check) check.onSite = row.on_site;
    if (row.on_site === false) await promptLeftSite(row.id);
  }
}

// Задача должна быть объявлена на верхнем уровне бандла (импортируется из index.ts):
// когда Android будит приложение в фоне, экраны не монтируются, выполняется только этот код.
TaskManager.defineTask<{ locations: Location.LocationObject[] }>(SHIFT_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const state = await readShiftState();
  if (!state) return;

  const now = Date.now();
  const last = data.locations[data.locations.length - 1];
  state.updates += data.locations.length;
  state.lastUpdateAt = now;

  if (now >= state.nextCheckAt) {
    const { latitude: lat, longitude: lng, accuracy } = last.coords;
    state.checks = [{ at: last.timestamp, lat, lng, accuracy }, ...state.checks].slice(0, 50);
    state.nextCheckAt = now + nextDelay(state.testMode);
    if (state.sessionId) {
      state.pendingPings.push({
        session_id: state.sessionId,
        device_time: new Date(last.timestamp).toISOString(),
        lat,
        lng,
        accuracy_m: accuracy,
      });
    }
  }
  // Сначала на диск: сеть может зависнуть, а проверку терять нельзя
  await writeShiftState(state);

  await expireLeftSite();
  if (state.pendingPings.length > 0) {
    await flushPings(state);
    await writeShiftState(state);
  }
  if (state.sessionId) await reportShiftHealth(state.sessionId);
});

// Раз в ~15 минут (чаще Android не даёт): сердцебиение и проверка, не выключена ли геолокация
TaskManager.defineTask(SHIFT_WATCH_TASK, async () => {
  try {
    const state = await readShiftState();
    if (state?.sessionId && (await isShiftRunning())) await reportShiftHealth(state.sessionId);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function startShift({ testMode, sessionId = null }: { testMode: boolean; sessionId?: string | null }) {
  const now = Date.now();
  const prev = await readShiftState();
  if (prev?.sessionId !== sessionId) {
    await clearLeftSite();
    await clearShiftHealth();
  }
  await writeShiftState({
    testMode,
    sessionId,
    startedAt: now,
    nextCheckAt: now + nextDelay(testMode),
    updates: 0,
    lastUpdateAt: null,
    checks: [],
    // Возобновили ту же смену — неотправленные проверки сохраняем
    pendingPings: sessionId && prev?.sessionId === sessionId ? prev.pendingPings : [],
  });
  await Location.startLocationUpdatesAsync(SHIFT_TASK, {
    // High = GPS: радиус объекта ~150 м, сетевой точности (~100 м) мало
    accuracy: Location.Accuracy.High,
    // Как часто сервис будит обработчик. Точность момента проверки — плюс-минус этот интервал
    timeInterval: testMode ? 60_000 : 5 * 60_000,
    distanceInterval: 0,
    foregroundService: {
      notificationTitle: "You're on shift",
      notificationBody: 'Your location is checked from time to time until you finish work.',
      killServiceOnDestroy: false,
    },
  });
  if (sessionId) {
    await BackgroundTask.registerTaskAsync(SHIFT_WATCH_TASK, { minimumInterval: 15 });
    await reportShiftHealth(sessionId);
  }
}

/** Внеочередная проверка: следующая будет через delayMs, дальше снова по случайному расписанию. */
export async function rescheduleCheck(delayMs: number) {
  const state = await readShiftState();
  if (!state) return;
  state.nextCheckAt = Date.now() + delayMs;
  await writeShiftState(state);
}

export async function stopShift() {
  if (await Location.hasStartedLocationUpdatesAsync(SHIFT_TASK)) {
    await Location.stopLocationUpdatesAsync(SHIFT_TASK);
  }
  if (await TaskManager.isTaskRegisteredAsync(SHIFT_WATCH_TASK)) {
    await BackgroundTask.unregisterTaskAsync(SHIFT_WATCH_TASK);
  }
  await clearLeftSite();
  await clearShiftHealth();
}

export async function isShiftRunning() {
  return Location.hasStartedLocationUpdatesAsync(SHIFT_TASK);
}
