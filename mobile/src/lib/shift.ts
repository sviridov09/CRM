// Шаги старта и финиша смены: геолокация, фото «до», запись сессии в базу.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { distanceM } from '../../../shared/types';
import { readShiftState, stopShift } from '../geo/shiftTracking';
import i18n from '../i18n';
import { supabase } from './supabase';
import type { TaskRow } from './tasks';

export function getPosition(): Promise<Location.LocationObject> {
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
}

/** Метры до объекта. Считаем так же, как триггер в базе, чтобы сказать рабочему расстояние. */
export function distanceToSite(task: TaskRow, pos: Location.LocationObject): number {
  const { lat, lng } = task.site!;
  return distanceM(lat, lng, pos.coords.latitude, pos.coords.longitude);
}

export function offSiteMessage(task: TaskRow, pos: Location.LocationObject): string {
  const meters = Math.round(distanceToSite(task, pos));
  return i18n.t('shift.offSite', { meters, radius: task.site!.radius_m });
}

const PHOTO_MAX_SIDE = 1600;
const PHOTO_QUALITY = 0.7;

/** Длинная сторона до 1600 px, JPEG 0.7: ~200–400 КБ вместо 3–5 МБ с камеры. */
async function compressPhoto(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  const context = ImageManipulator.manipulate(asset.uri);
  if (Math.max(asset.width, asset.height) > PHOTO_MAX_SIDE) {
    context.resize(
      asset.width >= asset.height
        ? { width: PHOTO_MAX_SIDE, height: null }
        : { width: null, height: PHOTO_MAX_SIDE },
    );
  }
  const image = await context.renderAsync();
  const result = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
  return result.uri;
}

/** Открывает камеру и возвращает сжатое фото. null — рабочий передумал и вышел из камеры. */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error(i18n.t('shift.cameraDenied'));
  // Сжимаем сами одним проходом, поэтому с камеры берём без потерь
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  return result.canceled ? null : compressPhoto(result.assets[0]);
}

export async function saveBeforePhoto(task: TaskRow, uri: string, pos: Location.LocationObject) {
  const path = `${task.company_id}/${task.id}/before-${Date.now()}.jpg`;
  const file = await (await fetch(uri)).arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(path, file, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { error } = await supabase.from('media').insert({
    task_id: task.id,
    kind: 'before',
    type: 'photo',
    storage_path: path,
    taken_at: new Date(pos.timestamp).toISOString(),
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
  });
  if (error) throw error;
}

/** Создаёт рабочую сессию. Вне радиуса база отвечает ошибкой NOT_ON_SITE. */
export async function createSession(task: TaskRow, pos: Location.LocationObject) {
  const { data, error } = await supabase
    .from('work_sessions')
    .insert({
      task_id: task.id,
      worker_id: task.worker_id,
      device_started_at: new Date(pos.timestamp).toISOString(),
      start_lat: pos.coords.latitude,
      start_lng: pos.coords.longitude,
    })
    .select('id, started_at')
    .single();
  if (error) {
    if (error.message === 'NOT_ON_SITE') throw new Error(offSiteMessage(task, pos));
    throw error;
  }
  return data as OpenSession;
}

export type OpenSession = { id: string; started_at: string };

/** Незавершённая сессия задачи: нужна, чтобы вернуться к смене после перезапуска. */
export async function loadOpenSession(taskId: string): Promise<OpenSession | null> {
  const { data, error } = await supabase
    .from('work_sessions')
    .select('id, started_at')
    .eq('task_id', taskId)
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as OpenSession | null;
}

/** Координаты для финиша; если геолокация выключена или не отвечает — смену всё равно закрываем. */
async function positionOrNull(): Promise<Location.LocationObject | null> {
  try {
    return await Promise.race([
      getPosition(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 15_000)),
    ]);
  } catch {
    return null;
  }
}

/**
 * Финиш смены: время ставит сервер, задачу в done переводит триггер.
 * Отчёт (фото «после», материалы) встанет сюда же перед записью.
 */
export async function finishShift(sessionId: string) {
  const pos = await positionOrNull();
  const { error } = await supabase
    .from('work_sessions')
    .update({
      finished_at: new Date().toISOString(),
      device_finished_at: new Date().toISOString(),
      end_lat: pos?.coords.latitude ?? null,
      end_lng: pos?.coords.longitude ?? null,
    })
    .eq('id', sessionId)
    .is('finished_at', null);
  if (error) throw error;
  // Сервис останавливаем, только если он работает на эту смену
  if ((await readShiftState())?.sessionId === sessionId) await stopShift();
}
