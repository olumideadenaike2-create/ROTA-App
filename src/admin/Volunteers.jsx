import { useState } from 'react'
import { supabase } from '../supabase'
import { Loading, useData } from './useData'

const blank = { name: '', phone: '', pod_id: '', photo_url: '' }

export default function Volunteers() {
  const { data, error, reload } = useData()
  const [editing, setEditing] = useState(null) // volunteer object or blank
  const [msg, setMsg] = useState(null)

  if (!data) return <Loading error={error} />
  const podName = Object.fromEntries(data.pods.map((p) => [p.id, p.name]))

  async function resetPin(v) {
    if (!confirm(`Reset ${v.name}'s PIN? They'll choose a new one next time they open the app.`)) return
    const { error: err } = await supabase.rpc('admin_reset_pin', { vid: v.id })
    setMsg(err ? err.message : `${v.name}'s PIN has been reset.`)
  }

  async function remove(v) {
    if (!confirm(`Remove ${v.name}? Their assignments and check-ins will be deleted.`)) return
    const { error: err } = await supabase.from('volunteers').delete().eq('id', v.id)
    if (err) setMsg(err.message)
    reload()
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-stone-600">{data.volunteers.length} crew</p>
        <button className="btn-primary" onClick={() => setEditing(blank)}>+ Add volunteer</button>
      </div>
      {msg && <p className="mb-3 rounded-xl bg-olive-50 p-3 text-sm">{msg}</p>}
      {editing && <Editor v={editing} pods={data.pods} onDone={() => { setEditing(null); reload() }} />}
      {data.volunteers.length === 0 && <p className="card text-center text-stone-500">No volunteers yet. Add your first one above.</p>}
      <ul className="space-y-2">
        {data.volunteers.map((v) => (
          <li key={v.id} className="card flex items-center gap-3 p-3">
            {v.photo_url
              ? <img src={v.photo_url} alt="" className="h-11 w-11 rounded-full object-cover" />
              : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-olive-100 font-semibold text-olive-700">{v.name[0]}</div>}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{v.name}</p>
              <p className="truncate text-sm text-stone-500">{[podName[v.pod_id], v.phone].filter(Boolean).join(' · ') || 'No pod'}</p>
            </div>
            <details className="relative">
              <summary className="btn-ghost list-none px-3">⋯</summary>
              <div className="absolute right-0 z-10 mt-1 w-40 rounded-xl border border-stone-200 bg-white p-1 shadow">
                <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-50" onClick={() => setEditing(v)}>Edit</button>
                <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-50" onClick={() => resetPin(v)}>Reset PIN</button>
                <button className="block w-full rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50" onClick={() => remove(v)}>Remove</button>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Editor({ v, pods, onDone }) {
  const [form, setForm] = useState({ ...blank, ...v, phone: v.phone ?? '', pod_id: v.pod_id ?? '', photo_url: v.photo_url ?? '' })
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function upload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.]/g, '')}`
    const { error: upErr } = await supabase.storage.from('photos').upload(path, file)
    if (upErr) setErr(upErr.message)
    else setForm((f) => ({ ...f, photo_url: supabase.storage.from('photos').getPublicUrl(path).data.publicUrl }))
    setBusy(false)
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.name.trim()) return setErr('Name is required')
    const row = { name: form.name.trim(), phone: form.phone || null, pod_id: form.pod_id || null, photo_url: form.photo_url || null }
    const q = v.id ? supabase.from('volunteers').update(row).eq('id', v.id) : supabase.from('volunteers').insert(row)
    const { error: saveErr } = await q
    if (saveErr) return setErr(saveErr.message)
    onDone()
  }

  return (
    <form onSubmit={submit} className="card mb-4 space-y-3">
      <h3 className="font-semibold">{v.id ? 'Edit volunteer' : 'New volunteer'}</h3>
      <input className="input" placeholder="Full name" value={form.name} onChange={set('name')} autoFocus />
      <input className="input" placeholder="Phone" type="tel" value={form.phone} onChange={set('phone')} />
      <select className="input" value={form.pod_id} onChange={set('pod_id')}>
        <option value="">No pod</option>
        {pods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <label className="block text-sm text-stone-600">
        Photo (optional)
        <input type="file" accept="image/*" onChange={upload} className="mt-1 block w-full text-sm" />
      </label>
      {form.photo_url && <img src={form.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />}
      {err && <p className="text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={busy}>Save</button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
