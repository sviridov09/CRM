import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, useProfile } from '../lib/auth-context'
import { NotificationBell } from './NotificationBell'
import { ThemeToggle } from './ThemeToggle'

const links = [
  { to: '/', label: 'nav.tasks' },
  { to: '/sites', label: 'nav.sites' },
  { to: '/workers', label: 'nav.workers' },
  { to: '/materials', label: 'nav.materials' },
] as const

export function Layout() {
  const { t } = useTranslation()
  const { signOut } = useAuth()
  const profile = useProfile()

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Field CRM</span>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}>
              {t(l.label)}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="muted">{profile.full_name}</span>
          <NotificationBell />
          <ThemeToggle />
          <button type="button" className="btn link" onClick={() => void signOut()}>
            {t('nav.signOut')}
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
