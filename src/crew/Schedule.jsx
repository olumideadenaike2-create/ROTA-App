import { useState } from 'react'
import { supabase } from '../supabase'
import { fmtDay, fmtStamp, pickCurrent, sessionTimes } from '../format'
import { Shell } from './CrewApp'

// One volunteer may hold more than one slot in a session; group rows by session.
function groupBySession(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.session_id)) map.set(r.session_id, { ...r, slots: [] })
    map.get(r.session_id).slots.push(r)
  }
  return [...map.values()]
}

export default function Schedule({ auth, data, reload, onSignOut }) {
  const sessions = groupBySession(data.schedule)
  const teamFor = (sid) => (data.pod_team ?? []).filter((t) => t.session_id === sid)
  const current = pickCurrent(sessions)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function checkIn() {
    setBusy(true); setErr(null)
    const { data: res, error } = await supabase.rpc('crew_check_in', { vid: auth.id, pin: auth.pin, sid: current.session_id })
    if (error || res?.error) setErr(error?.message ?? res.error)
    else await reload()
    setBusy(false)
  }

  return (
    <Shell>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-lg font-semibold">{data.me.name}</p>
        <button onClick={onSignOut} className="text-sm text-stone-500">Not you?</button>
      </div>

      {!current ? (
        <div className="card text-center text-stone-600">
          You're not on any sessions yet. Check back once the rota is out.
        </div>
      ) : (
        <section className="card mb-6 border-olive-100 bg-olive-50">
          <p className="label text-olive-700">
            {new Date(current.starts_at) <= new Date() && new Date() <= new Date(current.ends_at) ? 'Now' : 'Next up'}
          </p>
          <h2 className="text-xl font-bold">{current.code} · {fmtDay(current.day)}</h2>
          <p className="mb-3 text-stone-700">{sessionTimes(current)}</p>
          {current.slots.map((s) => <SlotDetails key={s.role} s={s} />)}
          {current.checked_in_at ? (
            <div className="mt-4 rounded-xl bg-olive-600 p-4 text-center text-lg font-semibold text-white">
              ✓ Checked in at {fmtStamp(current.checked_in_at)}
            </div>
          ) : (
            <button onClick={checkIn} disabled={busy} className="btn-primary mt-4 w-full min-h-[72px] text-2xl">
              {busy ? 'Checking in…' : 'I’m here'}
            </button>
          )}
          {err && <p className="mt-2 text-red-700">{err}</p>}
          <PodTeam team={teamFor(current.session_id)} open />
        </section>
      )}

      {sessions.length > 0 && (
        <>
          <h3 className="mb-2 text-lg font-semibold">My schedule</h3>
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.session_id} className="card">
                <div className="flex items-baseline justify-between">
                  <p className="font-semibold">{s.code} · {fmtDay(s.day)}</p>
                  {s.checked_in_at && <span className="text-sm font-medium text-olive-700">✓ In</span>}
                </div>
                <p className="mb-2 text-sm text-stone-600">{sessionTimes(s)}</p>
                {s.notes && <p className="mb-2 text-sm italic text-stone-600">{s.notes}</p>}
                {s.slots.map((x) => <SlotDetails key={x.role} s={x} />)}
                <PodTeam team={teamFor(s.session_id)} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  )
}

function SlotDetails({ s }) {
  const rows = [
    ['Role', s.role],
    ['Pod', s.section ? `${s.pod} — ${s.section}` : s.pod],
    ['Pod lead', s.pod_lead ? (s.pod_lead_phone ? <a className="underline" href={`tel:${s.pod_lead_phone}`}>{s.pod_lead}</a> : s.pod_lead) : '—'],
    ['Position', s.room_position || '—'],
    ['Callsign', s.callsign || '—'],
  ]
  return (
    <dl className="grid grid-cols-[6rem_1fr] gap-y-1 border-t border-stone-200/70 py-2 text-[15px] first-of-type:border-t-0">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-stone-500">{k}</dt>
          <dd className="font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

// Who else is on your pod this session. Names and roles only, never phone numbers.
function PodTeam({ team, open = false }) {
  if (team.length === 0) return null
  const pods = [...new Set(team.map((t) => t.pod))]
  return (
    <details open={open} className="mt-2 border-t border-stone-200/70 pt-2">
      <summary className="cursor-pointer py-1 text-[15px] font-semibold text-olive-700">
        Your pod this session ({team.length})
      </summary>
      {pods.map((pod) => (
        <div key={pod} className="mt-1">
          {pods.length > 1 && <p className="label mt-2">{pod}</p>}
          <ul className="divide-y divide-stone-100">
            {team.filter((t) => t.pod === pod).map((t, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className={`block truncate font-medium ${t.is_me ? 'text-olive-700' : ''}`}>
                    {t.name}{t.is_me && ' (you)'}
                  </span>
                  <span className="block truncate text-sm text-stone-500">
                    {[t.role, t.callsign].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {t.checked_in && <span className="shrink-0 text-sm font-medium text-olive-700">✓ In</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </details>
  )
}
