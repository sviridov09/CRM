import type { AppNotification, Material } from '../../../shared/types'
import i18n from '../i18n'
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

/** «5:08 PM» за сегодня, «Nov 4, 11:53 PM» — за другой день. */
function clock(iso: string): string {
  const d = new Date(iso)
  const today = d.toDateString() === new Date().toDateString()
  return d.toLocaleString(i18n.language, {
    ...(today ? {} : { month: 'short', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function describeNotification(n: NotificationRow, materials: NotificationList['materials']): string {
  const t = i18n.getFixedT(i18n.language)
  const worker = n.worker?.full_name ?? t('notification.someWorker')
  const site = n.task?.site?.name ?? t('notification.theSite')
  const at = clock(String(n.payload.at ?? n.created_at))
  const p = n.payload

  switch (n.type) {
    case 'left_site': {
      const back = p.return_in_minutes
      return t('notification.left_site', { worker, site, at }) + (back ? t('notification.backIn', { minutes: back }) : '')
    }
    case 'absence':
      return t('notification.absence', { worker, site, at })
    case 'overuse': {
      const m = materials[String(p.material_id)]
      const what = m ? t('notification.overuseWhat', { actual: p.actual, unit: m.unit, name: m.name }) : String(p.actual)
      return t('notification.overuse', { worker, what, planned: p.planned, task: n.task?.title ?? t('notification.task') })
    }
    case 'material_request':
      return t('notification.material_request', { worker, name: p.name, unit: p.unit })
    case 'location_off':
      return t('notification.location_off', { worker, at, site })
    case 'location_on':
      return t('notification.location_on', { worker, at })
    case 'no_signal':
      return t('notification.no_signal', { worker, at, site })
  }
}

/** Куда ведёт клик по уведомлению. */
export function notificationPath(n: NotificationRow): string {
  if (n.type === 'material_request') return '/materials'
  return n.task ? `/?date=${n.task.work_date}` : '/'
}
