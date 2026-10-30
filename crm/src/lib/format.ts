import type { PayType, TaskStatus } from '../../../shared/types'

/** Дата в формате YYYY-MM-DD по локальному времени браузера. */
export function toISODate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

export function formatDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
export const money = (n: number) => usd.format(n)

export function payLabel(payType: PayType, rate: number): string {
  return `${money(rate)} / ${payType === 'daily' ? 'day' : 'hour'}`
}

export const statusLabel: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'In progress',
  done: 'Done',
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object' && 'message' in e) return String(e.message)
  return String(e)
}
