import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Material, Profile, Site, Task, TaskMaterial } from '../../../shared/types'
import { Modal } from '../components/Modal'
import { useProfile } from '../lib/auth-context'
import { addDaysISO, formatDate, statusLabel, todayISO } from '../lib/format'
import { supabase } from '../lib/supabase'
import { useAsync } from '../lib/useAsync'

type TaskRow = Task & {
  site: { name: string; address: string } | null
  worker: { full_name: string } | null
  task_materials: (TaskMaterial & { material: { name: string; unit: string } | null })[]
}

type Refs = { sites: Site[]; workers: Profile[]; materials: Material[] }

// У tasks две ссылки на profiles (worker_id, created_by) — поэтому связь указываем по колонке
const TASK_SELECT =
  '*, site:site_id(name, address), worker:worker_id(full_name), task_materials(*, material:material_id(name, unit))'

// Справочники для формы задачи
const loadRefs = async (): Promise<Refs> => {
  const [sites, workers, materials] = await Promise.all([
    supabase.from('sites').select('*').eq('archived', false).order('name'),
    supabase.from('profiles').select('*').eq('role', 'worker').eq('active', true).order('full_name'),
    supabase.from('materials').select('*').eq('status', 'approved').order('name'),
  ])
  for (const r of [sites, workers, materials]) if (r.error) throw r.error
  return { sites: sites.data as Site[], workers: workers.data as Profile[], materials: materials.data as Material[] }
}

export function TasksPage() {
  const [params, setParams] = useSearchParams()
  const date = params.get('date') ?? todayISO()
  const setDate = (d: string) => setParams(d === todayISO() ? {} : { date: d })

  const [editing, setEditing] = useState<TaskRow | 'new' | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('work_date', date).order('created_at')
    if (error) throw error
    const rows = data as TaskRow[]
    return rows.sort((a, b) => (a.worker?.full_name ?? '').localeCompare(b.worker?.full_name ?? ''))
  }, [date])
  const { data: tasks, error, reload } = useAsync(load)
  const refs = useAsync(loadRefs)

  async function remove(task: TaskRow) {
    if (!confirm(`Delete task "${task.title}"?`)) return
    setActionError(null)
    const { error } = await supabase.from('tasks').delete().eq('id', task.id)
    if (error) setActionError(error.message)
    else reload()
  }

  const count = (s: Task['status']) => tasks?.filter((t) => t.status === s).length ?? 0

  return (
    <>
      <div className="page-head">
        <h1>Tasks</h1>
        <div className="date-nav">
          <button type="button" className="btn" onClick={() => setDate(addDaysISO(date, -1))} aria-label="Previous day">
            ←
          </button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <button type="button" className="btn" onClick={() => setDate(addDaysISO(date, 1))} aria-label="Next day">
            →
          </button>
          {date !== todayISO() && (
            <button type="button" className="btn link" onClick={() => setDate(todayISO())}>
              Today
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn primary"
          onClick={() => setEditing('new')}
          disabled={!refs.data}
        >
          New task
        </button>
      </div>

      <p className="muted subhead">
        {formatDate(date)}
        {tasks && tasks.length > 0 && (
          <>
            {' · '}
            {tasks.length} tasks · {count('in_progress')} in progress · {count('done')} done
          </>
        )}
      </p>

      {(error || actionError || refs.error) && <p className="error">{error ?? actionError ?? refs.error}</p>}

      {!tasks ? (
        !error && <p className="muted">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="empty">No tasks for this day.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Worker</th>
                <th>Site</th>
                <th>Task</th>
                <th>Materials</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id}>
                  <td className="strong nowrap">{t.worker?.full_name}</td>
                  <td>
                    {t.site?.name}
                    <div className="muted small">{t.site?.address}</div>
                  </td>
                  <td>
                    {t.title}
                    {t.description && <div className="muted small pre">{t.description}</div>}
                  </td>
                  <td>
                    {t.task_materials.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <ul className="plain">
                        {t.task_materials.map((tm) => (
                          <li key={tm.id} className={tm.actual_qty != null && tm.actual_qty > tm.planned_qty ? 'over' : undefined}>
                            {tm.material?.name}: {tm.planned_qty} {tm.material?.unit}
                            {tm.actual_qty != null && <span className="muted"> (used {tm.actual_qty})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td>
                    <span className={`badge status-${t.status}`}>{statusLabel[t.status]}</span>
                  </td>
                  <td className="actions">
                    {t.status === 'assigned' && (
                      <>
                        <button type="button" className="btn small" onClick={() => setEditing(t)} disabled={!refs.data}>
                          Edit
                        </button>
                        <button type="button" className="btn small danger" onClick={() => void remove(t)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && refs.data && (
        <Modal title={editing === 'new' ? 'New task' : 'Edit task'} onClose={() => setEditing(null)}>
          <TaskForm
            task={editing === 'new' ? null : editing}
            defaultDate={date}
            refs={refs.data}
            onSaved={(savedDate) => {
              setEditing(null)
              if (savedDate === date) reload()
              else setDate(savedDate)
            }}
          />
        </Modal>
      )}
    </>
  )
}

type Line = { materialId: string; qty: string }

function TaskForm(props: { task: TaskRow | null; defaultDate: string; refs: Refs; onSaved: (date: string) => void }) {
  const { task, refs } = props
  const profile = useProfile()
  const [workDate, setWorkDate] = useState(task?.work_date ?? props.defaultDate)
  const [siteId, setSiteId] = useState(task?.site_id ?? '')
  const [workerId, setWorkerId] = useState(task?.worker_id ?? '')
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [lines, setLines] = useState<Line[]>(
    task?.task_materials.map((tm) => ({ materialId: tm.material_id, qty: String(tm.planned_qty) })) ?? [],
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const unitOf = (id: string) => refs.materials.find((m) => m.id === id)?.unit ?? ''
  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  async function save() {
    const filled = lines.filter((l) => l.materialId)
    if (filled.some((l) => !(Number(l.qty) > 0))) return setError('Enter a quantity for every material.')
    if (new Set(filled.map((l) => l.materialId)).size !== filled.length) {
      return setError('Each material can be listed only once.')
    }
    setSaving(true)
    setError(null)

    const row = {
      work_date: workDate,
      site_id: siteId,
      worker_id: workerId,
      title: title.trim(),
      description: description.trim() || null,
    }

    let taskId: string
    if (task) {
      const { error } = await supabase.from('tasks').update(row).eq('id', task.id)
      if (error) return fail(error.message)
      // Задача ещё не начата, факта нет — строки материалов просто пересоздаём
      const { error: delError } = await supabase.from('task_materials').delete().eq('task_id', task.id)
      if (delError) return fail(delError.message)
      taskId = task.id
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ ...row, company_id: profile.company_id, created_by: profile.id })
        .select('id')
        .single()
      if (error) return fail(error.message)
      taskId = data.id
    }

    if (filled.length > 0) {
      const { error } = await supabase
        .from('task_materials')
        .insert(filled.map((l) => ({ task_id: taskId, material_id: l.materialId, planned_qty: Number(l.qty) })))
      if (error) {
        // Новую задачу без материалов не оставляем
        if (!task) await supabase.from('tasks').delete().eq('id', taskId)
        return fail(error.message)
      }
    }
    props.onSaved(workDate)
  }

  function fail(message: string) {
    setError(message)
    setSaving(false)
  }

  // Если объект уже в архиве или рабочий выключен, всё равно показываем их в списке
  const sites = task && !refs.sites.some((s) => s.id === task.site_id)
    ? [...refs.sites, { id: task.site_id, name: task.site?.name ?? 'Archived site' }]
    : refs.sites
  const workers = task && !refs.workers.some((w) => w.id === task.worker_id)
    ? [...refs.workers, { id: task.worker_id, full_name: task.worker?.full_name ?? 'Disabled worker' }]
    : refs.workers

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="row">
        <label>
          Date
          <input type="date" required value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        </label>
        <label>
          Worker
          <select required value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">Select…</option>
            {workers.map((w) => (
              <option key={w.id} value={w.id}>
                {w.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Site
        <select required value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          <option value="">Select…</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Task
        <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tile the master bathroom floor" />
      </label>
      <label>
        Details
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <fieldset>
        <legend>Allocated materials</legend>
        {lines.map((l, i) => (
          <div className="line" key={i}>
            <select value={l.materialId} onChange={(e) => setLine(i, { materialId: e.target.value })} aria-label="Material">
              <option value="">Select material…</option>
              {refs.materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={0}
              step="any"
              value={l.qty}
              onChange={(e) => setLine(i, { qty: e.target.value })}
              aria-label="Quantity"
              placeholder="Qty"
            />
            <span className="unit muted">{unitOf(l.materialId)}</span>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
              aria-label="Remove material"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => setLines((ls) => [...ls, { materialId: '', qty: '' }])}>
          + Add material
        </button>
      </fieldset>

      {(refs.sites.length === 0 || refs.workers.length === 0) && (
        <p className="muted small">Add at least one site and one worker before creating tasks.</p>
      )}
      {error && <p className="error">{error}</p>}
      <div className="form-actions">
        <button className="btn primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  )
}
