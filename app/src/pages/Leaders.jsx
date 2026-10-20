import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useChurch } from '../App'
import { ROLE_LABEL } from './Shell'

export default function Leaders() {
  const { church, data, isAdmin, user } = useChurch()
  const [leaders, setLeaders] = useState(null)
  const [invites, setInvites] = useState([])
  const [f, setF] = useState({ email: '', role: 'dept_head', scope: '' })
  const [msg, setMsg] = useState(null)
  const [err, setErr] = useState(null)

  const load = useCallback(async () => {
    const [l, i] = await Promise.all([
      supabase.rpc('church_leaders', { cid: church.id }),
      supabase.from('invites').select('*').eq('church_id', church.id).is('accepted_at', null).order('created_at'),
    ])
    setLeaders(l.data ?? []); setInvites(i.data ?? [])
  }, [church.id])
  useEffect(() => { load() }, [load])

  if (!isAdmin) return <p className="card text-stone-500">Only church admins can manage leaders.</p>
  if (!data || !leaders) return <p className="text-stone-500">Loading…</p>

  const scopeName = (r) => r.department_id ? data.departments.find((d) => d.id === r.department_id)?.name
    : r.unit_id ? (() => { const u = data.units.find((x) => x.id === r.unit_id); const d = u && data.departments.find((x) => x.id === u.department_id); return u ? `${d?.name} › ${u.name}` : '' })() : 'Whole church'
  const needsDept = f.role.startsWith('dept_'), needsUnit = f.role.startsWith('unit_')
  const link = `${window.location.origin}`

  async function invite(e) {
    e.preventDefault(); setErr(null); setMsg(null)
    if ((needsDept || needsUnit) && !f.scope) return setErr(needsDept ? 'Choose a department.' : 'Choose a unit.')
    const { error } = await supabase.from('invites').insert({
      church_id: church.id, email: f.email.trim().toLowerCase(), role: f.role,
      department_id: needsDept ? f.scope : null, unit_id: needsUnit ? f.scope : null,
    })
    if (error) return setErr(error.message.includes('invites_email_check') ? 'Enter a valid email address.' : error.message)
    setMsg(`Invite saved. Ask ${f.email.trim()} to sign up at ${link} with that email — they’ll go straight to their team.`)
    setF({ ...f, email: '' }); load()
  }
  async function cancelInvite(i) { await supabase.from('invites').delete().eq('id', i.id); load() }
  async function removeLeader(l) {
    if (!confirm(`Remove ${l.email} as ${ROLE_LABEL[l.role]}?`)) return
    const { error } = await supabase.from('leaders').delete().eq('id', l.id)
    if (error) setErr(error.message)
    load()
  }

  return (
    <div className="space-y-5">
      <div><h1 className="h1">Leaders</h1><p className="text-stone-600">Leaders sign in with email and only see the part of the church they lead. Leaders are free on every plan.</p></div>

      <form onSubmit={invite} className="card grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
        <input className="input" type="email" required placeholder="Their email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} aria-label="Email" />
        <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, scope: '' })} aria-label="Role">
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })} disabled={!needsDept && !needsUnit} aria-label="Department or unit">
          <option value="">{needsDept ? 'Which department?' : needsUnit ? 'Which unit?' : 'Whole church'}</option>
          {needsDept && data.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          {needsUnit && data.units.map((u) => <option key={u.id} value={u.id}>{scopeName({ unit_id: u.id })}</option>)}
        </select>
        <button className="btn-primary">Invite</button>
        {err && <p className="text-sm text-red-700 sm:col-span-4">{err}</p>}
        {msg && <p className="rounded-xl bg-olive-50 p-3 text-sm sm:col-span-4">{msg}</p>}
      </form>

      <section className="card">
        <h2 className="font-semibold">Leaders ({leaders.length})</h2>
        <ul className="mt-2 divide-y divide-stone-100">
          {leaders.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span><b>{l.email}</b>{l.user_id === user.id && <span className="text-stone-500"> (you)</span>}<br />
                <span className="text-sm text-stone-500">{ROLE_LABEL[l.role]} · {scopeName(l)}</span></span>
              {l.user_id !== user.id && <button className="text-sm text-red-700 underline" onClick={() => removeLeader(l)}>Remove</button>}
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">Waiting to sign up ({invites.length})</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span><b>{i.email}</b><br /><span className="text-sm text-stone-500">{ROLE_LABEL[i.role]} · {scopeName(i)}</span></span>
                <button className="text-sm text-stone-500 underline" onClick={() => cancelInvite(i)}>Cancel</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
