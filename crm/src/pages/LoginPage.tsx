import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    // При успехе AuthProvider сам переключит экран
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message)
      setBusy(false)
    }
  }

  return (
    <div className="center-screen">
      <form
        className="card form login"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <h1>Field CRM</h1>
        <p className="muted">Sign in to manage sites, crews and daily tasks.</p>
        <label>
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
