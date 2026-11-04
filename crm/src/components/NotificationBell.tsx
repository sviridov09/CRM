import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../lib/auth-context'
import { errorMessage } from '../lib/format'
import {
  describeNotification,
  loadNotifications,
  markAllRead,
  markRead,
  notificationPath,
  type NotificationRow,
} from '../lib/notifications'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

const timeAgo = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export function NotificationBell() {
  const profile = useProfile()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const { data, error, reload } = useAsync(loadNotifications)

  const unread = data?.unread ?? 0

  // Новое уведомление появляется без перезагрузки страницы
  useEffect(() => {
    // Имя канала уникальное: StrictMode монтирует эффект дважды, а повторная подписка
    // на канал с тем же именем падает, пока старый ещё не закрыт
    const channel = supabase
      .channel(`notifications-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `company_id=eq.${profile.company_id}`,
        },
        () => reload(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile.company_id, reload])

  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Field CRM` : 'Field CRM'
  }, [unread])

  // Закрываем по клику снаружи и по Esc
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function openItem(n: NotificationRow) {
    setOpen(false)
    navigate(notificationPath(n))
    if (n.read_at) return
    try {
      await markRead(n.id)
      reload()
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  async function readAll() {
    setActionError(null)
    try {
      await markAllRead()
      reload()
    } catch (e) {
      setActionError(errorMessage(e))
    }
  }

  const problem = error ?? actionError

  return (
    <div className="bell" ref={rootRef}>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        title="Notifications"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button type="button" className="btn link" onClick={() => void readAll()}>
                Mark all read
              </button>
            )}
          </div>
          {problem && <p className="error">{problem}</p>}
          {data && data.items.length === 0 && <p className="muted bell-empty">No notifications yet.</p>}
          <ul className="bell-list">
            {data?.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={n.read_at ? 'bell-item' : 'bell-item unread'}
                  onClick={() => void openItem(n)}
                >
                  {describeNotification(n, data.materials)}
                  <span className="muted small">{timeAgo(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
