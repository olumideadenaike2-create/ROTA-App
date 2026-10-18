import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fmtDay, fmtStamp, pickCurrent, sessionTimes } from '../format'
import { Loading, SessionTabs, useData } from './useData'

export default function Board() {
  const { data, error, reload } = useData()
  const [sid, setSid] = useState(null)
  const [show, setShow] = useState('all') // all | here | missing | unfilled
  const [podFilter, setPodFilter] = useState('all')
  const [q, setQ] = useState('')

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

  const shown = data.roles.filter((r) => {
    const v = vol[slotByRole[r.id]?.volunteer_id]
    if (podFilter !== 'all' && r.pod_id !== podFilter) return false
    if (show === 'here' && !(v && ins[v.id])) return false
    if (show === 'missing' && !(v && !ins[v.id])) return false
    if (show === 'unfilled' && v) return false
    const needle = q.trim().toLowerCase()
    return !needle || r.name.toLowerCase().includes(needle) || (v?.name ?? '').toLowerCase().includes(needle)
  })

  // Admin override: undo a check-in (e.g. test taps) or mark someone present by hand.
  async function toggle(v) {
    const c = ins[v.id]
    if (c) {
      if (!confirm(`Undo ${v.name}'s check-in for ${session.code}? (checked in at ${fmtStamp(c.checked_in_at)})`)) return
      const { error: err } = await supabase.from('check_ins').delete().eq('id', c.id)
      if (err) return alert(err.message)
    } else {
      if (!confirm(`Mark ${v.name} as here for ${session.code}?`)) return
      const { error: err } = await supabase.from('check_ins').insert({ session_id: sid, volunteer_id: v.id })
      if (err) return alert(err.message)
    }
    reload()
  }

  return (
    <div>
      <SessionTabs sessions={data.sessions} value={sid} onChange={setSid} />
      <p className="font-semibold">{session.name} · {fmtDay(session.day)}</p>
      <p className="mb-3 text-sm text-stone-600">{sessionTimes(session)}</p>
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <Stat n={present} label="Here" cls="bg-olive-600 text-white" active={show === 'here'} onClick={() => setShow(show === 'here' ? 'all' : 'here')} />
        <Stat n={people.length - present} label="Missing" cls="bg-stone-200" active={show === 'missing'} onClick={() => setShow(show === 'missing' ? 'all' : 'missing')} />
        <Stat n={unfilled} label="Unfilled" cls="bg-white border border-stone-200" active={show === 'unfilled'} onClick={() => setShow(show === 'unfilled' ? 'all' : 'unfilled')} />
      </div>
      <p className="mb-3 text-sm text-stone-500">Tap a name to mark them here, or tap a green one to undo a check-in.</p>
      <div className="card mb-3 space-y-2 p-3">
        <input className="input" placeholder="Search name or role" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className="input px-2 text-sm" value={show} onChange={(e) => setShow(e.target.value)} aria-label="Show">
            <option value="all">Everyone</option>
            <option value="here">Here</option>
            <option value="missing">Missing</option>
            <option value="unfilled">Unassigned slots</option>
          </select>
          <select className="input px-2 text-sm" value={podFilter} onChange={(e) => setPodFilter(e.target.value)} aria-label="Pod">
            <option value="all">All pods</option>
            {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {(show !== 'all' || podFilter !== 'all' || q) && (
          <div className="flex justify-between text-sm text-stone-500">
            <span>Showing {shown.length} of {data.roles.length} slots</span>
            <button className="underline" onClick={() => { setShow('all'); setPodFilter('all'); setQ('') }}>Clear filters</button>
          </div>
        )}
      </div>
      {shown.length === 0 && <p className="card text-center text-stone-500">Nothing matches these filters.</p>}
      {data.pods.filter((pod) => shown.some((r) => r.pod_id === pod.id)).map((pod) => (
        <section key={pod.id} className="mb-4">
          <h3 className="label mb-2">{pod.name}</h3>
          <ul className="space-y-1.5">
            {shown.filter((r) => r.pod_id === pod.id).map((r) => {
              const v = vol[slotByRole[r.id]?.volunteer_id]
              const c = v && ins[v.id]
              return (
                <li key={r.id}>
                  <button type="button" disabled={!v} onClick={() => v && toggle(v)}
                    title={v ? (c ? 'Tap to undo check-in' : 'Tap to mark as here') : undefined}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${
                    !v ? 'border border-dashed border-stone-300 text-stone-400' : c ? 'bg-olive-600 text-white' : 'bg-stone-200 text-stone-700'}`}>
                    <span>
                      <span className="block text-xs opacity-80">{r.name}</span>
                      <span className="font-semibold">{v ? v.name : 'Unassigned'}</span>
                    </span>
                    {c ? <span className="text-sm">✓ {fmtStamp(c.checked_in_at)}</span> : v && <span className="text-xs opacity-60">tap to mark here</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Stat({ n, label, cls, active, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-xl py-3 ${cls} ${active ? 'ring-2 ring-ink ring-offset-2' : ''}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs uppercase tracking-wide">{label}</div>
    </button>
  )
}
