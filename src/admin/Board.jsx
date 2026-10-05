import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fmtDay, fmtStamp, pickCurrent, sessionTimes } from '../format'
import { Loading, SessionTabs, useData } from './useData'

export default function Board() {
  const { data, error, reload } = useData()
  const [sid, setSid] = useState(null)

  // Live: refresh whenever anyone checks in.
  useEffect(() => {
    const ch = supabase.channel('board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'check_ins' }, reload)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [reload])

  useEffect(() => {
    if (data && !sid) setSid(pickCurrent(data.sessions)?.id ?? null)
  }, [data, sid])

  if (!data) return <Loading error={error} />
  if (!sid) return <p className="text-stone-500">No sessions yet.</p>

  const session = data.sessions.find((s) => s.id === sid)
  const vol = Object.fromEntries(data.volunteers.map((v) => [v.id, v]))
  const ins = Object.fromEntries(data.checkIns.filter((c) => c.session_id === sid).map((c) => [c.volunteer_id, c]))
  const slots = data.assignments.filter((a) => a.session_id === sid)
  const slotByRole = Object.fromEntries(slots.map((a) => [a.role_id, a]))
  const people = [...new Set(slots.map((a) => a.volunteer_id).filter(Boolean))]
  const present = people.filter((id) => ins[id]).length
  const unfilled = data.roles.filter((r) => !slotByRole[r.id]?.volunteer_id).length

  return (
    <div>
      <SessionTabs sessions={data.sessions} value={sid} onChange={setSid} />
      <p className="font-semibold">{session.name} · {fmtDay(session.day)}</p>
      <p className="mb-3 text-sm text-stone-600">{sessionTimes(session)}</p>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Stat n={present} label="Here" cls="bg-olive-600 text-white" />
        <Stat n={people.length - present} label="Missing" cls="bg-stone-200" />
        <Stat n={unfilled} label="Unfilled" cls="bg-white border border-stone-200" />
      </div>
      {data.pods.map((pod) => (
        <section key={pod.id} className="mb-4">
          <h3 className="label mb-2">{pod.name}</h3>
          <ul className="space-y-1.5">
            {data.roles.filter((r) => r.pod_id === pod.id).map((r) => {
              const v = vol[slotByRole[r.id]?.volunteer_id]
              const c = v && ins[v.id]
              return (
                <li key={r.id} className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                  !v ? 'border border-dashed border-stone-300 text-stone-400' : c ? 'bg-olive-600 text-white' : 'bg-stone-200 text-stone-700'}`}>
                  <span>
                    <span className="block text-xs opacity-80">{r.name}</span>
                    <span className="font-semibold">{v ? v.name : 'Unassigned'}</span>
                  </span>
                  {c && <span className="text-sm">✓ {fmtStamp(c.checked_in_at)}</span>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Stat({ n, label, cls }) {
  return (
    <div className={`rounded-xl py-3 ${cls}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </div>
  )
}
