// Прототип фоновой геолокации на смене (день 6): проверяем на реальном Android,
// что foreground service живёт в фоне и проверки срабатывают в случайное время.
// Пока без базы: журнал проверок пишется в AsyncStorage и показывается на экране.
//
// Как устроено: Android не даёт точных «будильников» в случайное время, поэтому
// сервис получает обновления раз в несколько минут, а в обработчике мы смотрим,
// не пора ли делать проверку (время следующей проверки храним в AsyncStorage).

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { nextPingDelayMs } from '../../../shared/types';

export const SHIFT_TASK = 'shift-location';
const STATE_KEY = 'shift-proto-state';

export type Check = { at: number; lat: number; lng: number; accuracy: number | null };

export type ShiftState = {
  testMode: boolean; // проверки раз в 2–4 мин вместо 60–120, чтобы не ждать часами
  startedAt: number;
  nextCheckAt: number;
  updates: number; // сколько точек прислал сервис — видно, жив ли он в фоне
  lastUpdateAt: number | null;
  checks: Check[]; // новые сверху
};

export async function readShiftState(): Promise<ShiftState | null> {
  const raw = await AsyncStorage.getItem(STATE_KEY);
  return raw ? (JSON.parse(raw) as ShiftState) : null;
}

async function writeShiftState(state: ShiftState) {
  await AsyncStorage.setItem(STATE_KEY, JSON.stringify(state));
}

const nextDelay = (testMode: boolean) => (testMode ? nextPingDelayMs(2, 4) : nextPingDelayMs());

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
    state.checks = [
      { at: last.timestamp, lat: last.coords.latitude, lng: last.coords.longitude, accuracy: last.coords.accuracy },
      ...state.checks,
    ].slice(0, 50);
    state.nextCheckAt = now + nextDelay(state.testMode);
  }
  await writeShiftState(state);
});

export async function startShift(testMode: boolean) {
  const now = Date.now();
  await writeShiftState({
    testMode,
    startedAt: now,
    nextCheckAt: now + nextDelay(testMode),
    updates: 0,
    lastUpdateAt: null,
    checks: [],
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
}

export async function stopShift() {
  if (await Location.hasStartedLocationUpdatesAsync(SHIFT_TASK)) {
    await Location.stopLocationUpdatesAsync(SHIFT_TASK);
  }
}

export async function isShiftRunning() {
  return Location.hasStartedLocationUpdatesAsync(SHIFT_TASK);
}
