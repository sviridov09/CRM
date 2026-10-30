import { useState } from 'react'
import { USERNAME_RE, type PayType, type Profile } from '../../../shared/types'
import { Modal } from '../components/Modal'
import { payLabel } from '../lib/format'
import { functionErrorMessage, supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

type Credentials = { username: string; password: string }

const loadWorkers = async () => {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'worker').order('full_name')
  if (error) throw error
  return data as Profile[]
}

export function WorkersPage() {
  const [editing, setEditing] = useState<Profile | 'new' | null>(null)
  // Логин и пароль, которые надо один раз показать бригадиру (после создания или сброса)
  const [shown, setShown] = useState<{ title: string; creds: Credentials } | null>(null)
  const { data: workers, error, reload } = useAsync(loadWorkers)

  return (
    <>
      <div className="page-head">
        <h1>Workers</h1>
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          New worker
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {!workers ? (
        !error && <p className="muted">Loading…</p>
      ) : workers.length === 0 ? (
        <p className="empty">No workers yet. Create an account and give the worker the login and password.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>Pay</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id} className={w.active ? undefined : 'inactive'}>
                  <td className="strong">{w.full_name}</td>
                  <td>{w.username ?? '—'}</td>
                  <td className="nowrap">{payLabel(w.pay_type, w.rate)}</td>
                  <td>{w.active ? 'Active' : 'Disabled'}</td>
                  <td className="actions">
                    <button type="button" className="btn small" onClick={() => setEditing(w)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing === 'new' && (
        <Modal title="New worker" onClose={() => setEditing(null)}>
          <NewWorkerForm
            onCreated={(creds) => {
              setEditing(null)
              setShown({ title: 'Worker created', creds })
              reload()
            }}
          />
        </Modal>
      )}

      {editing && editing !== 'new' && (
        <Modal title="Edit worker" onClose={() => setEditing(null)}>
          <EditWorkerForm
            worker={editing}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
            onPasswordReset={(creds) => {
              setEditing(null)
              setShown({ title: 'Password reset', creds })
            }}
          />
        </Modal>
      )}

      {shown && (
        <Modal title={shown.title} onClose={() => setShown(null)}>
          <CredentialsView creds={shown.creds} />
        </Modal>
      )}
    </>
  )
}

function generatePassword(length = 10): string {
  // без похожих символов: 0/O, 1/l/I
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(length))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

function PayFields(props: {
  payType: PayType
  rate: string
  onPayType: (v: PayType) => void
  onRate: (v: string) => void
}) {
  return (
    <div className="row">
      <label>
        Pay type
        <select value={props.payType} onChange={(e) => props.onPayType(e.target.value as PayType)}>
          <option value="daily">Daily rate</option>
          <option value="hourly">Hourly rate</option>
        </select>
      </label>
      <label>
        Rate, USD
        <input type="number" min={0} step="0.01" required value={props.rate} onChange={(e) => props.onRate(e.target.value)} />
      </label>
    </div>
  )
}

function NewWorkerForm({ onCreated }: { onCreated: (creds: Credentials) => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState(() => generatePassword())
  const [payType, setPayType] = useState<PayType>('daily')
  const [rate, setRate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    const login = username.trim().toLowerCase()
    if (!USERNAME_RE.test(login)) {
      return setError('Login: 3–32 characters — lowercase letters, digits, dot, dash or underscore.')
    }
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    setSaving(true)
    setError(null)
    const creds = { username: login, password }
    const { error } = await supabase.functions.invoke('create-worker', {
      body: { ...creds, fullName: fullName.trim(), payType, rate: Number(rate) },
    })
    if (error) {
      setError(await functionErrorMessage(error))
      setSaving(false)
    } else {
      onCreated(creds)
    }
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label>
        Full name
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <label>
        Login
        <input
          required
          autoCapitalize="none"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="john.smith"
        />
        <small>The worker signs in to the app with this login. Lowercase letters, digits, dot, dash, underscore.</small>
      </label>
      <label>
        Password
        <div className="input-with-btn">
          <input required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
          <button type="button" className="btn" onClick={() => setPassword(generatePassword())}>
            Generate
          </button>
        </div>
      </label>
      <PayFields payType={payType} rate={rate} onPayType={setPayType} onRate={setRate} />
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create account'}
        </button>
      </div>
    </form>
  )
}

function CredentialsView({ creds }: { creds: Credentials }) {
  const [copied, setCopied] = useState(false)
  const text = `Field CRM app\nLogin: ${creds.username}\nPassword: ${creds.password}`

  return (
    <div className="form">
      <p>Give these sign-in details to the worker. The password is not shown again.</p>
      <pre className="creds">{text}</pre>
      <div className="form-actions">
        <button
          type="button"
          className="btn primary"
          onClick={() => void navigator.clipboard.writeText(text).then(() => setCopied(true))}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

function EditWorkerForm(props: {
  worker: Profile
  onSaved: () => void
  onPasswordReset: (creds: Credentials) => void
}) {
  const { worker, onSaved } = props
  const [fullName, setFullName] = useState(worker.full_name)
  const [payType, setPayType] = useState<PayType>(worker.pay_type)
  const [rate, setRate] = useState(String(worker.rate))
  const [active, setActive] = useState(worker.active)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)

  async function resetPassword() {
    if (!confirm(`Set a new password for ${worker.full_name}? The old one will stop working.`)) return
    setResetting(true)
    setError(null)
    const password = generatePassword()
    const { data, error } = await supabase.functions.invoke('reset-worker-password', {
      body: { workerId: worker.id, password },
    })
    if (error) {
      setError(await functionErrorMessage(error))
      setResetting(false)
    } else {
      props.onPasswordReset({ username: data?.username ?? worker.username ?? '', password })
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim(), pay_type: payType, rate: Number(rate), active })
      .eq('id', worker.id)
    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      onSaved()
    }
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label>
        Full name
        <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </label>
      <PayFields payType={payType} rate={rate} onPayType={setPayType} onRate={setRate} />
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active (disabled workers can't be assigned new tasks)
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button
          type="button"
          className="btn"
          onClick={() => void resetPassword()}
          disabled={saving || resetting}
        >
          {resetting ? 'Resetting…' : 'Reset password'}
        </button>
        <button className="btn primary" disabled={saving || resetting}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
