import { useCallback, useState } from 'react'
import type { Site } from '../../../shared/types'
import { Modal } from '../components/Modal'
import { useProfile } from '../lib/auth-context'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat},${lng}`

export function SitesPage() {
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<Site | 'new' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('sites').select('*').eq('archived', showArchived).order('name')
    if (error) throw error
    return data as Site[]
  }, [showArchived])
  const { data: sites, error, reload } = useAsync(load)

  async function setArchived(site: Site, archived: boolean) {
    setActionError(null)
    const { error } = await supabase.from('sites').update({ archived }).eq('id', site.id)
    if (error) setActionError(error.message)
    else reload()
  }

  return (
    <>
      <div className="page-head">
        <h1>Sites</h1>
        <label className="check">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archived
        </label>
        <button type="button" className="btn primary" onClick={() => setEditing('new')}>
          New site
        </button>
      </div>

      {(error || actionError) && <p className="error">{error ?? actionError}</p>}

      {!sites ? (
        !error && <p className="muted">Loading…</p>
      ) : sites.length === 0 ? (
        <p className="empty">{showArchived ? 'No archived sites.' : 'No sites yet. Add the first one.'}</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Address</th>
                <th>Radius</th>
                <th>Location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => (
                <tr key={s.id}>
                  <td className="strong">{s.name}</td>
                  <td>{s.address}</td>
                  <td className="nowrap">{s.radius_m} m</td>
                  <td>
                    <a href={mapsUrl(s.lat, s.lng)} target="_blank" rel="noreferrer">
                      Map
                    </a>
                  </td>
                  <td className="actions">
                    {!s.archived && (
                      <button type="button" className="btn small" onClick={() => setEditing(s)}>
                        Edit
                      </button>
                    )}
                    <button type="button" className="btn small" onClick={() => void setArchived(s, !s.archived)}>
                      {s.archived ? 'Restore' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal title={editing === 'new' ? 'New site' : 'Edit site'} onClose={() => setEditing(null)}>
          <SiteForm
            site={editing === 'new' ? null : editing}
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

/** "34.0522, -118.2437" → { lat, lng }; так копирует координаты Google Maps. */
function parseCoords(text: string): { lat: number; lng: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

function SiteForm({ site, onSaved }: { site: Site | null; onSaved: () => void }) {
  const profile = useProfile()
  const [name, setName] = useState(site?.name ?? '')
  const [address, setAddress] = useState(site?.address ?? '')
  const [coords, setCoords] = useState(site ? `${site.lat}, ${site.lng}` : '')
  const [radius, setRadius] = useState(String(site?.radius_m ?? 150))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const point = parseCoords(coords)
  const radiusM = Number(radius)

  async function save() {
    if (!point) return setError('Coordinates should look like "34.0522, -118.2437".')
    if (!Number.isInteger(radiusM) || radiusM < 20 || radiusM > 2000) {
      return setError('Radius must be a whole number from 20 to 2000 m.')
    }
    setSaving(true)
    setError(null)
    const row = { name: name.trim(), address: address.trim(), lat: point.lat, lng: point.lng, radius_m: radiusM }
    const { error } = site
      ? await supabase.from('sites').update(row).eq('id', site.id)
      : await supabase.from('sites').insert({ ...row, company_id: profile.company_id })
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
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Smith residence" />
      </label>
      <label>
        Address
        <input required value={address} onChange={(e) => setAddress(e.target.value)} />
        {address.trim() && (
          <small>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`}
              target="_blank"
              rel="noreferrer"
            >
              Find this address on Google Maps
            </a>
          </small>
        )}
      </label>
      <label>
        Coordinates
        <input required value={coords} onChange={(e) => setCoords(e.target.value)} placeholder="34.0522, -118.2437" />
        <small>
          In Google Maps, right-click the site and click the coordinates to copy them.
          {point && (
            <>
              {' '}
              <a href={mapsUrl(point.lat, point.lng)} target="_blank" rel="noreferrer">
                Check on map
              </a>
            </>
          )}
        </small>
      </label>
      <label>
        Radius, m
        <input type="number" required min={20} max={2000} step={10} value={radius} onChange={(e) => setRadius(e.target.value)} />
        <small>
          {radiusM > 0 && `≈ ${Math.round(radiusM * 3.281)} ft. `}Workers can start a task only inside this radius.
        </small>
      </label>
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
