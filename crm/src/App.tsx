import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { useAuth } from './lib/auth-context'
import { LoginPage } from './pages/LoginPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { SitesPage } from './pages/SitesPage'
import { TasksPage } from './pages/TasksPage'
import { WorkersPage } from './pages/WorkersPage'

export default function App() {
  const auth = useAuth()

  if (auth.status === 'loading') return <div className="center-screen muted">Loading…</div>
  if (auth.status === 'signed-out') return <LoginPage />
  if (auth.status === 'error' || auth.status === 'not-foreman') {
    return (
      <div className="center-screen">
        <div className="card form login">
          <h1>No access</h1>
          <p className="muted">
            {auth.status === 'error'
              ? auth.message
              : "This account can't use the CRM. Workers sign in through the mobile app."}
          </p>
          <button type="button" className="btn" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<TasksPage />} />
        <Route path="sites" element={<SitesPage />} />
        <Route path="workers" element={<WorkersPage />} />
        <Route path="materials" element={<MaterialsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
