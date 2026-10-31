import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useChurch } from '../App'
import { fmtDay, fmtTime } from '../lib/time'

// Cover requests from volunteers. Approving turns the slot into a draft for the new person;
// it goes out (with texts) the next time the rota is published.
export default function Swaps() {
  const { church, data, canUnit } = useChurch()
  const tz = church.timezone
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState(null)

  const load = useCallback(async () => {
    const { data: s } = await supabase.from('swap_requests')
      .select('id, status, created_at, from_person, to_person, assignment:assignments(id, role_id, event:events(id, name, call_at))')
      .eq('church_id', church.id).order('created_at', { ascending: false }).limit(50)
    setRows(s ?? [])
  }, [church.id])
  useEffect(() => { load() }, [load])

  if (!data || !rows) return <p className="text-stone-500">Loading…</p>
  const person = (id) => data.people.find((p) => p.id === id)?.name ?? 'Someone'
  const role = (id) => data.roles.find((r) => r.id === id)
  const unit = (r) => data.units.find((u) => u.id === r?.unit_id)
  const mine = rows.filter((s) => unit(role(s.assignment?.role_id)) && canUnit(unit(role(s.assignment.role_id))))
  const pending = mine.filter((s) => s.status === 'pending'), done = mine.filter((s) => s.status !== 'pending').slice(0, 15)

  async function decide(s, approve) {
    setMsg(null)
    const { error } = await supabase.rpc('decide_swap', { sid: s.id, approve })
    if (error) setMsg({ err: error.message })
    else setMsg({ ok: approve ? `Approved. ${person(s.to_person)} is now a draft on the rota.` : 'Declined.', event: approve && s.assignment.event.id })
    load()
  }

  return (
    <div className="space-y-4">
      <div><h1 className="h1">Swaps</h1><p className="text-stone-600">Volunteers can ask someone in their unit to cover them. You approve or decline here.</p></div>
      {msg?.err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg.err}</p>}
      {msg?.ok && <p className="rounded-xl bg-olive-50 p-3 text-sm">{msg.ok} {msg.event && <Link className="font-semibold text-olive-700 underline" to={`/rota?event=${msg.event}`}>Publish the rota</Link>}{msg.event && ' to tell them.'}</p>}
      {pending.length === 0 ? <p className="card text-center text-stone-500">No requests waiting.</p> : (
        <ul className="space-y-2">
          {pending.map((s) => {
            const r = role(s.assignment.role_id), e = s.assignment.event
            return (
              <li key={s.id} className="card">
                <p className="font-semibold">{person(s.from_person)} → {person(s.to_person)}</p>
                <p className="text-sm text-stone-500">{unit(r)?.name} · {r?.name} · {e.name}, {fmtDay(e.call_at, tz)} {fmtTime(e.call_at, tz)}</p>
                <div className="mt-2 flex gap-2"><button className="btn-primary btn-sm" onClick={() => decide(s, true)}>Approve</button><button className="btn-ghost btn-sm" onClick={() => decide(s, false)}>Decline</button></div>
              </li>
            )
          })}
        </ul>
      )}
      {done.length > 0 && (
        <section className="card"><h2 className="font-semibold">Recent</h2>
          <ul className="mt-1 divide-y divide-stone-100 text-sm">
            {done.map((s) => <li key={s.id} className="flex justify-between gap-2 py-2"><span>{person(s.from_person)} → {person(s.to_person)} · {s.assignment.event.name}, {fmtDay(s.assignment.event.call_at, tz)}</span><span className="text-stone-500">{s.status}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  )
}
