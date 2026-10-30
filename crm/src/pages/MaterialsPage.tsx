import { useState } from 'react'
import type { Material, MaterialStatus } from '../../../shared/types'
import { Modal } from '../components/Modal'
import { useProfile } from '../lib/auth-context'
import { money } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

type MaterialRow = Material & { creator: { full_name: string } | null }

const UNITS = ['pcs', 'sq ft', 'ft', 'gal', 'bag', 'box', 'lb', 'roll', 'sheet']

const loadMaterials = async () => {
  const { data, error } = await supabase
    .from('materials')
    .select('*, creator:created_by(full_name)')
    .neq('status', 'rejected')
    .order('name')
  if (error) throw error
  return data as MaterialRow[]
}

export function MaterialsPage() {
  const [editing, setEditing] = useState<Material | 'new' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const { data: materials, error, reload } = useAsync(loadMaterials)

  const pending = materials?.filter((m) => m.status === 'pending') ?? []
  const approved = materials?.filter((m) => m.status === 'approved') ?? []

  async function setStatus(m: Material, status: MaterialStatus) {
    setActionError(null)
    const { error } = await supabase.from('materials').update({ status }).eq('id', m.id)
    if (error) setActionError(error.message)
    else reload()
  }

  return (
    <>
      <div className="page-head">
        <h1>Materials</h1>
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          New material
        </button>
      </div>

      {(error || actionError) && <p className="error">{error ?? actionError}</p>}
      {!materials && !error && <p className="muted">Loading…</p>}

      {pending.length > 0 && (
        <section className="card attention">
          <h2>Requests from workers</h2>
          <p className="muted">Workers added these materials on site. Approve to add them to the catalog.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Requested by</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.map((m) => (
                  <tr key={m.id}>
                    <td className="strong">{m.name}</td>
                    <td>{m.unit}</td>
                    <td>{m.creator?.full_name ?? '—'}</td>
                    <td className="actions">
                      <button type="button" className="btn small primary" onClick={() => void setStatus(m, 'approved')}>
                        Approve
                      </button>
                      <button type="button" className="btn small" onClick={() => void setStatus(m, 'rejected')}>
                        Reject
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {materials && approved.length === 0 ? (
        <p className="empty">The catalog is empty. Add materials you allocate to tasks.</p>
      ) : (
        approved.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Unit</th>
                  <th>Price per unit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {approved.map((m) => (
                  <tr key={m.id}>
                    <td className="strong">
                      {m.name}
                      {m.is_custom && <span className="badge">from worker</span>}
                    </td>
                    <td>{m.unit}</td>
                    <td>{m.price == null ? <span className="muted">not set</span> : money(m.price)}</td>
                    <td className="actions">
                      <button type="button" className="btn small" onClick={() => setEditing(m)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New material' : 'Edit material'} onClose={() => setEditing(null)}>
          <MaterialForm
            material={editing === 'new' ? null : editing}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
          />
        </Modal>
      )}
    </>
  )
}

function MaterialForm({ material, onSaved }: { material: Material | null; onSaved: () => void }) {
  const profile = useProfile()
  const [name, setName] = useState(material?.name ?? '')
  const [unit, setUnit] = useState(material?.unit ?? '')
  const [price, setPrice] = useState(material?.price == null ? '' : String(material.price))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    setError(null)
    const row = { name: name.trim(), unit: unit.trim(), price: price === '' ? null : Number(price) }
    const { error } = material
      ? await supabase.from('materials').update(row).eq('id', material.id)
      : await supabase.from('materials').insert({ ...row, company_id: profile.company_id, created_by: profile.id })
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
        Name
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ceramic tile" />
      </label>
      <div className="row">
        <label>
          Unit
          <input required list="units" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="sq ft" />
          <datalist id="units">
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
        <label>
          Price per unit, USD
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
