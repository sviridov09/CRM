import type { Site, Task, TaskMaterial } from '../../../shared/types';
import { supabase } from './supabase';

export type TaskRow = Task & {
  site: Pick<Site, 'name' | 'address' | 'lat' | 'lng' | 'radius_m'> | null;
  task_materials: (TaskMaterial & { material: { name: string; unit: string } | null })[];
};

const TASK_SELECT =
  '*, site:site_id(name, address, lat, lng, radius_m), task_materials(*, material:material_id(name, unit))';


/** Сегодня по часам телефона, YYYY-MM-DD. */
export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Задачи на сегодня плюс начатые в другой день: смена могла перейти через полночь
 * или рабочий забыл её закончить, а закрыть её можно только отсюда. Начатые — сверху.
 */
export async function loadTodayTasks(workerId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('worker_id', workerId)
    .or(`work_date.eq.${todayISO()},status.eq.in_progress`)
    .order('work_date')
    .order('created_at');
  if (error) throw error;
  const rows = data as TaskRow[];
  const started = (t: TaskRow) => (t.status === 'in_progress' ? 0 : 1);
  return rows.sort((a, b) => started(a) - started(b)); // sort устойчивый: порядок из базы сохранится
}
