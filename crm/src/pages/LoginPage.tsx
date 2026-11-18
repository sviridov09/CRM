import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const { t } = useTranslation()
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
      setError(error.message === 'Invalid login credentials' ? t('login.wrongCredentials') : error.message)
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
        <h1>{t('login.title')}</h1>
        <p className="muted">{t('login.subtitle')}</p>
        <label>
          {t('login.email')}
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          {t('login.password')}
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
          {busy ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  )
}
