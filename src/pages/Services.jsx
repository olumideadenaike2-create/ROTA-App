import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useChurch } from '../App'
import { eventTimes, fmtDay, toIso } from '../lib/time'

export function useEvents(churchId, { past = false } = {}) {
  const [events, setEvents] = useState(null)
  const load = useCallback(async () => {
    const since = new Date(Date.now() - (past ? 60 : 1) * 86400000).toISOString()
    const { data } = await supabase.from('events').select('*').eq('church_id', churchId).gte('call_at', since).order('call_at')
    setEvents(data ?? [])
  }, [churchId, past])
  useEffect(() => { load() }, [load])
  return [events, load]
}

export default function Services() {
  const { church, myRoles } = useChurch()
  const tz = church.timezone
  const [events, reload] = useEvents(church.id)
  const canPlan = myRoles.some((r) => ['admin', 'dept_head', 'dept_assistant'].includes(r.role))
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState(null)

  async function remove(e) {
    if (!confirm(`Delete ${e.name} on ${fmtDay(e.call_at, tz)}? Its rota and check-ins are deleted too.`)) return
    const { error } = await supabase.from('events').delete().eq('id', e.id)
    if (error) setErr(error.message)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Services</h1><p className="text-stone-600">Services and events are shared by every department. Each one gets its own rota.</p></div>
        {canPlan && <button className="btn-primary" onClick={() => setOpen(!open)}>+ Add service</button>}
      </div>
      {open && <NewService church={church} onDone={() => { setOpen(false); reload() }} />}
      {err && <p className="text-sm text-red-700">{err}</p>}
      {events === null ? <p className="text-stone-500">Loading…</p> : events.length === 0 ? (
        <p className="card text-center text-stone-500">No upcoming services. {canPlan ? 'Add your next Sunday service to start a rota.' : 'Ask your church admin to add one.'}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="card flex flex-wrap items-center justify-between gap-3 p-3">
              <div>
                <p className="font-semibold">{e.name} <span className="font-normal text-stone-500">· {fmtDay(e.call_at, tz)}</span></p>
                <p className="text-sm text-stone-500">{eventTimes(e, tz)}{e.notes ? ` · ${e.notes}` : ''}</p>
              </div>
              <div className="flex items-center gap-3">
                <Link to={`/rota?event=${e.id}`} className="btn-ghost btn-sm">Rota</Link>
                {canPlan && <button className="text-sm text-red-700 underline" onClick={() => remove(e)}>Delete</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function NewService({ church, onDone }) {
  const [f, setF] = useState({ name: 'Sunday Service', date: '', call: '08:30', start: '10:00', end: '12:00', notes: '', repeat: '1' })
  const [err, setErr] = useState(null)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function submit(e) {
    e.preventDefault()
    if (!f.date) return setErr('Choose a date.')
    const rows = Array.from({ length: Number(f.repeat) }, (_, i) => {
      const d = new Date(`${f.date}T12:00`); d.setDate(d.getDate() + 7 * i)
      const ds = d.toLocaleDateString('en-CA')
      return { church_id: church.id, name: f.name.trim() || 'Service', call_at: toIso(ds, f.call), starts_at: toIso(ds, f.start), ends_at: toIso(ds, f.end), notes: f.notes.trim() || null }
    })
    const { error } = await supabase.from('events').insert(rows)
    if (error) return setErr(error.message)
    onDone()
  }
  return (
    <form onSubmit={submit} className="card grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2"><span className="label">Name</span><input className="input mt-1" value={f.name} onChange={set('name')} /></label>
      <label className="block"><span className="label">Date</span><input className="input mt-1" type="date" value={f.date} onChange={set('date')} /></label>
      <label className="block"><span className="label">Repeat</span>
        <select className="input mt-1" value={f.repeat} onChange={set('repeat')}>
          <option value="1">Just this date</option><option value="4">Weekly for 4 weeks</option><option value="8">Weekly for 8 weeks</option><option value="13">Weekly for 13 weeks</option>
        </select></label>
      <label className="block"><span className="label">Team call time</span><input className="input mt-1" type="time" value={f.call} onChange={set('call')} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Starts</span><input className="input mt-1" type="time" value={f.start} onChange={set('start')} /></label>
        <label className="block"><span className="label">Ends</span><input className="input mt-1" type="time" value={f.end} onChange={set('end')} /></label>
      </div>
      <label className="block sm:col-span-2"><span className="label">Notes (optional)</span><input className="input mt-1" value={f.notes} onChange={set('notes')} placeholder="e.g. Baptism service, guest speaker" /></label>
      {err && <p className="text-sm text-red-700 sm:col-span-2">{err}</p>}
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Add</button><button type="button" className="btn-ghost" onClick={onDone}>Cancel</button></div>
    </form>
  )
}
