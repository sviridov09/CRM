import { NavLink, Outlet } from 'react-router-dom'
import { useAuth, useProfile } from '../lib/auth-context'
import { ThemeToggle } from './ThemeToggle'

const links = [
  { to: '/', label: 'Tasks' },
  { to: '/sites', label: 'Sites' },
  { to: '/workers', label: 'Workers' },
  { to: '/materials', label: 'Materials' },
]

export function Layout() {
  const { signOut } = useAuth()
  const profile = useProfile()

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Field CRM</span>
        <nav className="nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'}>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="user">
          <span className="muted">{profile.full_name}</span>
          <ThemeToggle />
          <button type="button" className="btn link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
