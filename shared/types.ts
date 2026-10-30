// Общие типы для CRM и мобилки. Повторяют схему из supabase/migrations/0001_schema.sql.
// Позже их можно генерировать автоматически: npx supabase gen types typescript

export type UserRole = "foreman" | "worker";
export type PayType = "daily" | "hourly";
export type MaterialStatus = "approved" | "pending" | "rejected";
export type TaskStatus = "assigned" | "in_progress" | "done";
export type PingResponse = "left" | "no_response";
export type MediaKind = "before" | "after";
export type MediaType = "photo" | "video";
export type NotificationType = "left_site" | "absence" | "overuse" | "material_request";

export interface Profile {
  id: string;
  company_id: string;
  full_name: string;
  role: UserRole;
  pay_type: PayType;
  rate: number;
  active: boolean;
  created_at: string;
}

export interface Site {
  id: string;
  company_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  radius_m: number;
  archived: boolean;
  created_at: string;
}

export interface Material {
  id: string;
  company_id: string;
  name: string;
  unit: string;
  price: number | null;
  status: MaterialStatus;
  created_by: string | null;
  is_custom: boolean;
  created_at: string;
}

export interface Task {
  id: string;
  company_id: string;
  site_id: string;
  worker_id: string;
  work_date: string; // YYYY-MM-DD
  title: string;
  description: string | null;
  status: TaskStatus;
  created_by: string | null;
  created_at: string;
}

export interface TaskMaterial {
  id: string;
  task_id: string;
  material_id: string;
  planned_qty: number;
  actual_qty: number | null;
}

export interface WorkSession {
  id: string;
  task_id: string;
  worker_id: string;
  started_at: string;
  device_started_at: string | null;
  start_lat: number;
  start_lng: number;
  finished_at: string | null;
  device_finished_at: string | null;
  end_lat: number | null;
  end_lng: number | null;
}

export interface LocationPing {
  id: string;
  session_id: string;
  received_at: string;
  device_time: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
  on_site: boolean | null;
  response: PingResponse | null;
  return_in_minutes: number | null;
  deduct: boolean | null;
}

export interface Report {
  id: string;
  task_id: string;
  session_id: string | null;
  comment: string | null;
  created_at: string;
}

export interface Media {
  id: string;
  task_id: string;
  kind: MediaKind;
  type: MediaType;
  storage_path: string; // <company_id>/<task_id>/<file>
  taken_at: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  company_id: string;
  type: NotificationType;
  task_id: string | null;
  worker_id: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// ── Утилиты ──────────────────────────────────────────────────────

/** Расстояние в метрах между двумя точками (как distance_m в базе). */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Случайная задержка до следующей проверки геолокации: от 60 до 120 минут, в мс. */
export function nextPingDelayMs(minMinutes = 60, maxMinutes = 120): number {
  const minutes = minMinutes + Math.random() * (maxMinutes - minMinutes);
  return Math.round(minutes * 60 * 1000);
}
