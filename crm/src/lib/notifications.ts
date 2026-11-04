import type { AppNotification, Material } from '../../../shared/types'
import { supabase } from './supabase'

export type NotificationRow = AppNotification & {
  worker: { full_name: string } | null
  task: { title: string; work_date: string; site: { name: string } | null } | null
}

type MaterialInfo = Pick<Material, 'id' | 'name' | 'unit'>

export type NotificationList = {
  items: NotificationRow[]
  unread: number
  materials: Record<string, MaterialInfo> // для текста о перерасходе: в payload только id
}

const SELECT = '*, worker:worker_id(full_name), task:task_id(title, work_date, site:site_id(name))'

export async function loadNotifications(): Promise<NotificationList> {
  const [list, unread] = await Promise.all([
    supabase.from('notifications').select(SELECT).order('created_at', { ascending: false }).limit(30),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
  ])
  if (list.error) throw list.error
  if (unread.error) throw unread.error
  const items = list.data as NotificationRow[]

  const ids = items.filter((n) => n.type === 'overuse').map((n) => String(n.payload.material_id))
  const materials: NotificationList['materials'] = {}
  if (ids.length > 0) {
    const { data, error } = await supabase.from('materials').select('id, name, unit').in('id', ids)
    if (error) throw error
    for (const m of data as MaterialInfo[]) materials[m.id] = m
  }
  return { items, unread: unread.count ?? 0, materials }
}

export async function markRead(id: string) {
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function markAllRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export function describeNotification(n: NotificationRow, materials: NotificationList['materials']): string {
  const worker = n.worker?.full_name ?? 'A worker'
  const site = n.task?.site?.name ?? 'the site'
  const at = clock(String(n.payload.at ?? n.created_at))

  switch (n.type) {
    case 'left_site': {
      const back = n.payload.return_in_minutes
      return `${worker} left ${site} at ${at}${back ? ` · back in ${back} min` : ''}`
    }
    case 'absence':
      return `${worker} didn't answer a location check at ${site} (${at})`
    case 'overuse': {
      const m = materials[String(n.payload.material_id)]
      const what = m ? `${n.payload.actual} ${m.unit} of ${m.name}` : `${n.payload.actual}`
      return `${worker} used ${what}, ${n.payload.planned} allocated · ${n.task?.title ?? 'task'}`
    }
    case 'material_request':
      return `${worker} requested a new material: ${n.payload.name} (${n.payload.unit})`
  }
}

/** Куда ведёт клик по уведомлению. */
export function notificationPath(n: NotificationRow): string {
  if (n.type === 'material_request') return '/materials'
  return n.task ? `/?date=${n.task.work_date}` : '/'
}
