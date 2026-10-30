import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { useChurch } from '../App'
import { eventTimes, fmtDay } from '../lib/time'
import { useEvents } from './Services'

const AVAIL = { yes: { mark: '✓', label: 'available' }, maybe: { mark: '?', label: 'maybe' }, no: { mark: '✗', label: 'not available' } }
const REPLY = { pending: ['Awaiting reply', 'bg-amber-50 text-amber-800'], accepted: ['Accepted', 'bg-olive-100 text-olive-700'], declined: ['Declined', 'bg-red-50 text-red-700'] }

export default function Rota() {
  const { church, data, canUnit } = useChurch()
  const tz = church.timezone
  const [events] = useEvents(church.id)
  const [params, setParams] = useSearchParams()
  const eventId = params.get('event') || events?.[0]?.id
  const event = events?.find((e) => e.id === eventId)
  const [slots, setSlots] = useState(null) // role_id -> assignment row
  const [avail, setAvail] = useState({}) // person_id -> status
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!eventId) return
    const [a, av] = await Promise.all([
      supabase.from('assignments').select('*').eq('event_id', eventId),
      supabase.from('availability').select('person_id, status').eq('event_id', eventId),
    ])
    setSlots(Object.fromEntries((a.data ?? []).map((x) => [x.role_id, x])))
    setAvail(Object.fromEntries((av.data ?? []).map((x) => [x.person_id, x.status])))
  }, [eventId])
  useEffect(() => { setSlots(null); load() }, [load])

  const people = useMemo(() => Object.fromEntries((data?.people ?? []).map((p) => [p.id, p])), [data])
  if (!data || events === null) return <p className="text-stone-500">Loading…</p>
  if (!events.length) return <p className="card text-stone-500">No upcoming services yet. <Link className="font-semibold text-olive-700" to="/services">Add one →</Link></p>

  const myUnits = data.units.filter(canUnit)
  const takenBy = Object.fromEntries(Object.values(slots ?? {}).filter((s) => s.person_id).map((s) => [s.person_id, s.role_id]))
  const drafts = Object.values(slots ?? {}).filter((s) => s.person_id !== s.published_person_id && myUnits.some((u) => data.roles.find((r) => r.id === s.role_id)?.unit_id === u.id)).length

  async function setPerson(role, personId) {
    setMsg(null)
    const existing = slots[role.id]
    const res = existing
      ? await supabase.from('assignments').update({ person_id: personId || null }).eq('id', existing.id)
      : await supabase.from('assignments').insert({ church_id: church.id, event_id: eventId, role_id: role.id, person_id: personId || null })
    if (res.error) setMsg({ err: res.error.message })
    load()
  }
  async function publish() {
    setBusy(true); setMsg(null)
    const { data: changed, error } = await supabase.rpc('publish_rota', { eid: eventId })
    setBusy(false)
    if (error) return setMsg({ err: error.message })
    const n = new Set((changed ?? []).map((c) => c.person_id)).size
    setMsg({ ok: `Published. ${n} ${n === 1 ? 'person' : 'people'} will see the change on their volunteer link. (Texts arrive in a later release.)` })
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">Rota</h1>
          <select className="mt-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-semibold" value={eventId} onChange={(e) => setParams({ event: e.target.value })} aria-label="Service">
            {events.map((e) => <option key={e.id} value={e.id}>{fmtDay(e.call_at, tz)} · {e.name}</option>)}
          </select>
          {event && <p className="mt-1 text-sm text-stone-500">{eventTimes(event, tz)}</p>}
        </div>
        <div className="text-right">
          <button className="btn-primary" onClick={publish} disabled={!drafts || busy}>{busy ? 'Publishing…' : `Publish changes (${drafts})`}</button>
          <p className="mt-1 text-xs text-stone-500">Volunteers only see changes after you publish.</p>
        </div>
      </div>
      {msg?.ok && <p className="rounded-xl bg-olive-50 p-3 text-sm">{msg.ok}</p>}
      {msg?.err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.err}</p>}
      {!slots ? <p className="text-stone-500">Loading…</p> : data.departments.map((d) => {
        const units = data.units.filter((u) => u.department_id === d.id && data.roles.some((r) => r.unit_id === u.id))
        if (!units.length) return null
        return (
          <section key={d.id} className="card">
            <h2 className="font-display text-xl font-bold">{d.name}</h2>
            {units.map((u) => {
              const editable = canUnit(u)
              const members = new Set(data.members.filter((m) => m.unit_id === u.id).map((m) => m.person_id))
              const inUnit = data.people.filter((p) => members.has(p.id)), others = data.people.filter((p) => !members.has(p.id))
              const option = (p, roleId) => {
                const a = AVAIL[avail[p.id]]
                const busyElsewhere = takenBy[p.id] && takenBy[p.id] !== roleId
                return <option key={p.id} value={p.id}>{a ? `${a.mark} ` : ''}{p.name}{a ? ` (${a.label})` : ''}{busyElsewhere ? ' · already on this service' : ''}</option>
              }
              return (
                <div key={u.id} className="mt-3">
                  <p className="label mb-1">{u.name}{!editable && ' · view only'}</p>
                  <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                    {data.roles.filter((r) => r.unit_id === u.id).map((r) => {
                      const s = slots[r.id], draft = s && s.person_id !== s.published_person_id
                      const status = draft ? ['Draft · not published', 'border border-dashed border-amber-400 text-amber-800'] : s?.reply ? REPLY[s.reply] : null
                      const av = s?.person_id && avail[s.person_id]
                      return (
                        <li key={r.id} className="grid items-center gap-2 px-3 py-2 sm:grid-cols-[10rem_1fr_auto]">
                          <span className="text-sm font-semibold">{r.name}</span>
                          <select className={`input min-h-[40px] text-sm ${s?.person_id ? '' : 'text-stone-400'} ${av === 'no' ? 'border-red-400' : ''}`}
                            value={s?.person_id ?? ''} disabled={!editable} onChange={(e) => setPerson(r, e.target.value)} aria-label={`${u.name} ${r.name}`}>
                            <option value="">Unassigned</option>
                            {inUnit.length > 0 && <optgroup label={`In ${u.name}`}>{inUnit.map((p) => option(p, r.id))}</optgroup>}
                            {others.length > 0 && <optgroup label="Everyone else">{others.map((p) => option(p, r.id))}</optgroup>}
                          </select>
                          <span className="flex flex-wrap gap-1 sm:justify-end">
                            {av === 'no' && <span className="pill bg-red-50 text-red-700">Said not available</span>}
                            {status && <span className={`pill ${status[1]}`}>{status[0]}</span>}
                            {draft && s.published_person_id && <span className="pill bg-stone-100 text-stone-500">was {people[s.published_person_id]?.name ?? 'someone'}</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
