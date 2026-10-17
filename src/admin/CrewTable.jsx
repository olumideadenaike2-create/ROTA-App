import { useState } from 'react'
import { supabase } from '../supabase'

// Spreadsheet-style view: one row per volunteer, one role dropdown per session.
// Picking a role assigns them to that slot (replacing whoever held it); "—" removes them from the session.
export default function CrewTable({ rows, data, reload }) {
  const [saving, setSaving] = useState(null)
  const [msg, setMsg] = useState(null)
  const vol = Object.fromEntries(data.volunteers.map((v) => [v.id, v]))
  const slot = Object.fromEntries(data.assignments.map((a) => [`${a.session_id}|${a.role_id}`, a]))
  const podsWithRoles = data.pods.map((p) => ({ ...p, roles: data.roles.filter((r) => r.pod_id === p.id) }))

  async function run(key, fn) {
    setSaving(key); setMsg(null)
    const err = await fn()
    if (err) setMsg(err.message ?? String(err))
    await reload()
    setSaving(null)
  }

  function setRole(v, session, current, roleId) {
    const target = roleId ? slot[`${session.id}|${roleId}`] : null
    const holder = target?.volunteer_id && target.volunteer_id !== v.id ? vol[target.volunteer_id] : null
    if (holder && !confirm(`${holder.name} already has this role in ${session.code}. Replace them with ${v.name}?`)) return
    return run(`${v.id}|${session.id}`, async () => {
      if (current) {
        const { error } = await supabase.from('assignments').update({ volunteer_id: null }).eq('id', current.id)
        if (error) return error
      }
      if (!roleId) return null
      const { error } = await supabase.from('assignments').upsert(
        { session_id: session.id, role_id: roleId, volunteer_id: v.id, room_position: target?.room_position ?? null, callsign: target?.callsign ?? null },
        { onConflict: 'session_id,role_id' })
      return error
    })
  }

  const setPod = (v, podId) => run(`${v.id}|pod`, async () =>
    (await supabase.from('volunteers').update({ pod_id: podId || null }).eq('id', v.id)).error)

  if (rows.length === 0) return null
  return (
    <div>
      {msg && <p className="mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
      <div className="overflow-x-auto rounded-2xl border border-stone-200 bg-white">
        <table className="min-w-full border-collapse text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="sticky left-0 z-10 bg-stone-50 px-3 py-2 font-medium">Name</th>
              <th className="px-2 py-2 font-medium">Team</th>
              {data.sessions.map((s) => <th key={s.id} className="px-2 py-2 font-medium">{s.code}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map(({ v }) => (
              <tr key={v.id}>
                <td className="sticky left-0 z-10 max-w-[9rem] truncate bg-white px-3 py-1.5 font-medium">{v.name}</td>
                <td className="px-2 py-1.5">
                  <select className="input min-h-[40px] w-36 px-2 text-sm" value={v.pod_id ?? ''} disabled={saving === `${v.id}|pod`}
                    onChange={(e) => setPod(v, e.target.value)}>
                    <option value="">No team</option>
                    {data.pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                {data.sessions.map((s) => {
                  const mine = data.assignments.filter((a) => a.session_id === s.id && a.volunteer_id === v.id)
                  const current = mine[0]
                  return (
                    <td key={s.id} className="px-2 py-1.5">
                      <select className={`input min-h-[40px] w-40 px-2 text-sm ${current ? 'border-olive-500 bg-olive-50' : 'text-stone-400'}`}
                        value={current?.role_id ?? ''} disabled={saving === `${v.id}|${s.id}`}
                        onChange={(e) => setRole(v, s, current, e.target.value)}>
                        <option value="">—</option>
                        {podsWithRoles.map((p) => (
                          <optgroup key={p.id} label={p.name}>
                            {p.roles.map((r) => {
                              const h = slot[`${s.id}|${r.id}`]?.volunteer_id
                              return <option key={r.id} value={r.id}>{r.name}{h && h !== v.id ? ` (${vol[h]?.name ?? 'taken'})` : ''}</option>
                            })}
                          </optgroup>
                        ))}
                      </select>
                      {mine.length > 1 && <p className="mt-0.5 text-xs text-stone-500">+{mine.length - 1} more — see Assign</p>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-stone-500">Changes save as soon as you pick. A name in brackets means that role is taken — picking it moves the role to this person.</p>
    </div>
  )
}
