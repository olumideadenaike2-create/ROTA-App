import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { pickCurrent } from '../format'
import { Loading, SessionTabs, useData } from './useData'

export default function Assign() {
  const { data, error, reload, setData } = useData()
  const [sid, setSid] = useState(null)
  const [copyTo, setCopyTo] = useState('')
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    if (data && !sid) setSid(pickCurrent(data.sessions)?.id ?? null)
  }, [data, sid])

  if (!data) return <Loading error={error} />
  if (!sid) return <p className="text-stone-500">No sessions yet.</p>

  const slotByRole = Object.fromEntries(data.assignments.filter((a) => a.session_id === sid).map((a) => [a.role_id, a]))
  const busy = new Map() // volunteer -> roles already held in this session
  for (const a of Object.values(slotByRole)) if (a.volunteer_id) busy.set(a.volunteer_id, (busy.get(a.volunteer_id) ?? 0) + 1)

  async function save(roleId, patch) {
    const row = { session_id: sid, role_id: roleId, ...slotByRole[roleId], ...patch }
    delete row.id
    const { data: saved, error: err } = await supabase.from('assignments')
      .upsert(row, { onConflict: 'session_id,role_id' }).select().single()
    if (err) return setMsg(err.message)
    setData((d) => ({ ...d, assignments: [...d.assignments.filter((a) => a.id !== saved.id), saved] }))
  }

  async function copy() {
    const target = data.sessions.find((s) => s.id === copyTo)
    if (!target || !confirm(`Overwrite ${target.code} with this session's assignments?`)) return
    const { error: err } = await supabase.rpc('admin_copy_session', { from_sid: sid, to_sid: copyTo })
    setMsg(err ? err.message : `Copied to ${target.code}.`)
    setCopyTo('')
    reload()
  }

  return (
    <div>
      <SessionTabs sessions={data.sessions} value={sid} onChange={setSid} />
      <div className="card mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-stone-600">Copy these assignments to</span>
        <select className="input w-auto flex-1" value={copyTo} onChange={(e) => setCopyTo(e.target.value)}>
          <option value="">choose session…</option>
          {data.sessions.filter((s) => s.id !== sid).map((s) => <option key={s.id} value={s.id}>{s.code}</option>)}
        </select>
        <button className="btn-ghost" disabled={!copyTo} onClick={copy}>Copy</button>
        {msg && <p className="w-full text-sm text-stone-600">{msg}</p>}
      </div>

      {data.pods.map((pod) => {
        const roles = data.roles.filter((r) => r.pod_id === pod.id)
        let lastSection = null
        return (
          <section key={pod.id} className="mb-6">
            <h3 className="mb-2 text-lg font-semibold">{pod.name}</h3>
            {roles.length === 0 && <p className="text-sm text-stone-500">No roles in this pod yet.</p>}
            <div className="space-y-2">
              {roles.map((r) => {
                const a = slotByRole[r.id] ?? {}
                const header = r.section && r.section !== lastSection ? (lastSection = r.section) : null
                return (
                  <div key={`${sid}-${r.id}`}>
                    {header && <p className="label mt-3 mb-1">{header}</p>}
                    <div className="card space-y-2 p-3">
                      <div className="flex items-center gap-2">
                        <span className="w-28 shrink-0 text-sm font-medium">{r.name}</span>
                        <select className={`input ${a.volunteer_id ? '' : 'text-stone-400'}`} value={a.volunteer_id ?? ''}
                          onChange={(e) => save(r.id, { volunteer_id: e.target.value || null })}>
                          <option value="">Unassigned</option>
                          {data.volunteers.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name}{busy.has(v.id) && v.id !== a.volunteer_id ? ' (already on a slot)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <input className="input min-h-[40px] text-sm" placeholder="Room position" defaultValue={a.room_position ?? ''}
                          onBlur={(e) => e.target.value !== (a.room_position ?? '') && save(r.id, { room_position: e.target.value || null })} />
                        <input className="input min-h-[40px] w-32 text-sm" placeholder="Callsign" defaultValue={a.callsign ?? ''}
                          onBlur={(e) => e.target.value !== (a.callsign ?? '') && save(r.id, { callsign: e.target.value || null })} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
