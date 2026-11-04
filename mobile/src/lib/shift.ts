// Шаги старта смены: геолокация, фото «до», запись сессии в базу.
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { distanceM } from '../../../shared/types';
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
  return `You're ${meters} m from the site. Move within ${task.site!.radius_m} m and try again.`;
}

/** Открывает камеру. null — рабочий передумал и вышел из камеры. */
export async function takePhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Allow camera access in Settings to take the photo.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
  return result.canceled ? null : result.assets[0].uri;
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
