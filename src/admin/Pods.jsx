import { useState } from 'react'
import { supabase } from '../supabase'
import { Loading, useData } from './useData'

export default function Pods() {
  const { data, error, reload } = useData()
  const [newPod, setNewPod] = useState('')
  const [msg, setMsg] = useState(null)

  if (!data) return <Loading error={error} />

  async function run(q) {
    const { error: err } = await q
    setMsg(err?.message ?? null)
    reload()
  }

  async function addPod(e) {
    e.preventDefault()
    if (!newPod.trim()) return
    await run(supabase.from('pods').insert({ name: newPod.trim(), sort_order: data.pods.length + 1 }))
    setNewPod('')
  }

  return (
    <div>
      {msg && <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{msg}</p>}
      {data.pods.map((pod) => (
        <PodCard key={pod.id} pod={pod} volunteers={data.volunteers}
          roles={data.roles.filter((r) => r.pod_id === pod.id)} run={run} />
      ))}
      <form onSubmit={addPod} className="card flex gap-2">
        <input className="input" placeholder="New pod name" value={newPod} onChange={(e) => setNewPod(e.target.value)} />
        <button className="btn-primary">Add pod</button>
      </form>
    </div>
  )
}

function PodCard({ pod, roles, volunteers, run }) {
  const [role, setRole] = useState('')
  const [section, setSection] = useState('')

  function rename() {
    const name = prompt('Pod name', pod.name)
    if (name?.trim()) run(supabase.from('pods').update({ name: name.trim() }).eq('id', pod.id))
  }
  function removePod() {
    if (confirm(`Delete ${pod.name}? All its roles and their assignments will be deleted.`))
      run(supabase.from('pods').delete().eq('id', pod.id))
  }
  function renameRole(r) {
    const name = prompt('Role name', r.name)
    if (name?.trim()) run(supabase.from('roles').update({ name: name.trim() }).eq('id', r.id))
  }
  function removeRole(r) {
    if (confirm(`Delete role "${r.name}"? Its assignments in every session will be deleted.`))
      run(supabase.from('roles').delete().eq('id', r.id))
  }
  function addRole(e) {
    e.preventDefault()
    if (!role.trim()) return
    const max = Math.max(0, ...roles.map((r) => r.sort_order))
    run(supabase.from('roles').insert({ pod_id: pod.id, name: role.trim(), section: section.trim() || null, sort_order: max + 1 }))
    setRole('')
  }

  const pick = (field) => (
    <select className="input" value={pod[field] ?? ''}
      onChange={(e) => run(supabase.from('pods').update({ [field]: e.target.value || null }).eq('id', pod.id))}>
      <option value="">— none —</option>
      {volunteers.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  )

  return (
    <section className="card mb-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{pod.name}</h3>
        <div className="flex gap-3 text-sm">
          <button className="text-stone-500" onClick={rename}>Rename</button>
          <button className="text-red-700" onClick={removePod}>Delete</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="label">Lead {pick('lead_id')}</label>
        <label className="label">Deputy {pick('deputy_id')}</label>
      </div>
      <ul className="divide-y divide-stone-100">
        {roles.map((r) => (
          <li key={r.id} className="flex items-center justify-between py-2">
            <span>{r.name}{r.section && <span className="ml-2 text-xs text-stone-500">{r.section}</span>}</span>
            <span className="flex gap-3 text-sm">
              <button className="text-stone-500" onClick={() => renameRole(r)}>Rename</button>
              <button className="text-red-700" onClick={() => removeRole(r)}>Delete</button>
            </span>
          </li>
        ))}
        {roles.length === 0 && <li className="py-2 text-sm text-stone-500">No roles yet.</li>}
      </ul>
      <form onSubmit={addRole} className="flex flex-wrap gap-2">
        <input className="input flex-[2]" placeholder="New role" value={role} onChange={(e) => setRole(e.target.value)} />
        <input className="input flex-1" placeholder="Section (optional)" value={section} onChange={(e) => setSection(e.target.value)} />
        <button className="btn-ghost">Add</button>
      </form>
    </section>
  )
}
