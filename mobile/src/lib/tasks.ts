import type { Site, Task, TaskMaterial, TaskStatus } from '../../../shared/types';
import { supabase } from './supabase';
import { colors } from './ui';

export type TaskRow = Task & {
  site: Pick<Site, 'name' | 'address' | 'lat' | 'lng' | 'radius_m'> | null;
  task_materials: (TaskMaterial & { material: { name: string; unit: string } | null })[];
};

const TASK_SELECT =
  '*, site:site_id(name, address, lat, lng, radius_m), task_materials(*, material:material_id(name, unit))';

export const TASK_STATUS: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  assigned: { label: 'To do', bg: '#e8ebf0', fg: colors.muted },
  in_progress: { label: 'In progress', bg: '#fff6e0', fg: '#8a5a00' },
  done: { label: 'Done', bg: '#e5f6ea', fg: '#1d7a3a' },
};

/** Сегодня по часам телефона, YYYY-MM-DD. */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export async function loadTodayTasks(workerId: string): Promise<TaskRow[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('worker_id', workerId)
    .eq('work_date', todayISO())
    .order('created_at');
  if (error) throw error;
  return data as TaskRow[];
}
