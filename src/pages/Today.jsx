import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { useChurch } from '../App'
import { dayKey, eventTimes, fmtDay, fmtTime, todayKey } from '../lib/time'
import { useEvents } from './Services'

// Live board: who's here, who's missing, which slots are empty. Tap a name to mark them here or undo.
export default function Today() {
  const { church, data, canUnit } = useChurch()
  const tz = church.timezone
  const [events] = useEvents(church.id)
  const [eventId, setEventId] = useState(null)
  const [slots, setSlots] = useState(null)
  const [ins, setIns] = useState({})
  const [show, setShow] = useState('all')
  const [undo, setUndo] = useState(null)

  useEffect(() => {
    if (!events || eventId) return
    const today = events.find((e) => dayKey(e.call_at, tz) === todayKey(tz))
    setEventId((today ?? events[0])?.id ?? null)
  }, [events, eventId, tz])

  const load = useCallback(async () => {
    if (!eventId) return
    const [a, c] = await Promise.all([
      supabase.from('assignments').select('role_id, published_person_id, reply').eq('event_id', eventId),
      supabase.from('check_ins').select('person_id, checked_in_at').eq('event_id', eventId),
    ])
    setSlots(Object.fromEntries((a.data ?? []).map((x) => [x.role_id, x])))
    setIns(Object.fromEntries((c.data ?? []).map((x) => [x.person_id, x.checked_in_at])))
  }, [eventId])
  useEffect(() => {
    load()
    if (!eventId) return
    const ch = supabase.channel(`board-${eventId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins', filter: `event_id=eq.${eventId}` }, load).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, eventId])

  if (!data || events === null) return <p className="text-stone-500">Loading…</p>
  if (!events.length) return <p className="card text-stone-500">No upcoming services. <Link className="font-semibold text-olive-700" to="/services">Add one →</Link></p>
  const event = events.find((e) => e.id === eventId)
  const people = Object.fromEntries(data.people.map((p) => [p.id, p]))
  const units = data.units.filter(canUnit)
  const rows = units.flatMap((u) => data.roles.filter((r) => r.unit_id === u.id).map((r) => {
    const pid = slots?.[r.id]?.published_person_id
    return { r, u, pid, at: pid ? ins[pid] : null }
  }))
  const here = rows.filter((x) => x.at).length, missing = rows.filter((x) => x.pid && !x.at).length, gaps = rows.filter((x) => !x.pid).length
  const shown = rows.filter((x) => show === 'all' || (show === 'here' ? x.at : show === 'missing' ? x.pid && !x.at : !x.pid))

  async function toggle(x) {
    const was = x.at
    if (was) await supabase.from('check_ins').delete().eq('event_id', eventId).eq('person_id', x.pid)
    else await supabase.from('check_ins').insert({ event_id: eventId, person_id: x.pid })
    setUndo({ text: was ? `Undid ${people[x.pid]?.name}'s check-in` : `Marked ${people[x.pid]?.name} as here`, x: { ...x, at: was ? null : 'now' } })
    load()
  }
  const tile = (key, n, label, cls) => (
    <button onClick={() => setShow(show === key ? 'all' : key)} aria-pressed={show === key}
      className={`rounded-xl py-3 text-center ${cls} ${show === key ? 'ring-2 ring-ink ring-offset-2' : ''}`}>
      <b className="block text-2xl tabular-nums">{n}</b><span className="text-[11px] font-semibold tracking-wide">{label}</span>
    </button>
  )

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="h1">Today</h1>
        <select className="mt-1 rounded-lg border border-stone-200 bg-white px-2 py-1.5 font-semibold" value={eventId ?? ''} onChange={(e) => setEventId(e.target.value)} aria-label="Service">
          {events.map((e) => <option key={e.id} value={e.id}>{fmtDay(e.call_at, tz)} · {e.name}</option>)}
        </select>
        {event && <p className="mt-1 text-sm text-stone-500">{eventTimes(event, tz)}</p>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {tile('here', here, 'HERE', 'bg-olive-600 text-white')}
        {tile('missing', missing, 'MISSING', 'bg-stone-200')}
        {tile('gaps', gaps, 'UNFILLED', 'border border-stone-200 bg-white')}
      </div>
      <p className="text-sm text-stone-500">Shows the published rota. Tap a name to mark them here, or tap a green one to undo.</p>
      {!slots ? <p className="text-stone-500">Loading…</p> : shown.length === 0 ? <p className="card text-center text-stone-500">Nothing to show.</p> : (
        <ul className="space-y-1.5">
          {shown.map((x) => (
            <li key={x.r.id}>
              {x.pid ? (
                <button onClick={() => toggle(x)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${x.at ? 'bg-olive-600 text-white' : 'bg-stone-200'}`}>
                  <span><span className="block text-xs opacity-80">{x.u.name} · {x.r.name}</span><b>{people[x.pid]?.name ?? 'Removed person'}</b></span>
                  <span className="text-sm">{x.at ? `✓ ${fmtTime(x.at, tz)}` : 'tap to mark here'}</span>
                </button>
              ) : (
                <Link to={`/rota?event=${eventId}`} className="flex items-center justify-between rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-stone-400">
                  <span><span className="block text-xs">{x.u.name} · {x.r.name}</span><b>Unassigned</b></span>
                  <span className="text-sm font-semibold text-olive-700">Fill →</span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {undo && (
        <div className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-xl items-center justify-between gap-3 rounded-xl bg-ink px-4 py-3 text-white" role="status">
          <span>{undo.text}</span>
          <span className="flex gap-4">
            <button className="font-bold text-olive-100" onClick={() => { toggle(undo.x); setUndo(null) }}>UNDO</button>
            <button aria-label="Dismiss" onClick={() => setUndo(null)}>×</button>
          </span>
        </div>
      )}
    </div>
  )
}
