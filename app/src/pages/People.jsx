import { useMemo, useState } from 'react'
import { supabase } from '../supabase'
import { useChurch } from '../App'

export default function People() {
  const { church, data, reload, isAdmin, canUnit } = useChurch()
  const [q, setQ] = useState('')
  const [unitFilter, setUnitFilter] = useState('all')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState(null)

  const unitsById = useMemo(() => Object.fromEntries((data?.units ?? []).map((u) => [u.id, u])), [data])
  const deptById = useMemo(() => Object.fromEntries((data?.departments ?? []).map((d) => [d.id, d])), [data])
  if (!data) return <p className="text-stone-500">Loading…</p>

  const myUnits = data.units.filter(canUnit)
  const unitsOf = (pid) => data.members.filter((m) => m.person_id === pid).map((m) => unitsById[m.unit_id]).filter(Boolean)
  const rows = data.people.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) &&
    (unitFilter === 'all' || (unitFilter === 'none' ? unitsOf(p.id).length === 0 : unitsOf(p.id).some((u) => u.id === unitFilter))))
  const unitLabel = (u) => `${deptById[u.department_id]?.name ?? ''} › ${u.name}`

  async function toggleUnit(person, unit, on) {
    const t = supabase.from('unit_members')
    const { error } = on ? await t.insert({ unit_id: unit.id, person_id: person.id }) : await t.delete().eq('unit_id', unit.id).eq('person_id', person.id)
    if (error) setMsg(error.message)
    reload()
  }
  async function removePerson(p) {
    if (!confirm(`Remove ${p.name}? They’ll be taken off every unit and rota.`)) return
    const { error } = await supabase.from('people').delete().eq('id', p.id)
    if (error) setMsg(error.message)
    reload()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">People</h1><p className="text-stone-600">{data.people.length} volunteers</p></div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => { setImporting(!importing); setAdding(false) }}>Import list</button>
          <button className="btn-primary" onClick={() => { setAdding(!adding); setImporting(false) }}>+ Add person</button>
        </div>
      </div>
      {msg && <p className="rounded-xl bg-olive-50 p-3 text-sm">{msg}</p>}
      {adding && <AddPerson church={church} units={myUnits} unitLabel={unitLabel} onDone={(m) => { setAdding(false); if (m) setMsg(m); reload() }} />}
      {importing && <Import church={church} units={myUnits} unitLabel={unitLabel} existing={data.people} onDone={(m) => { setImporting(false); if (m) setMsg(m); reload() }} />}

      <div className="card grid gap-2 p-3 sm:grid-cols-[1fr_auto]">
        <input className="input" placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select className="input sm:w-64" value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} aria-label="Unit">
          <option value="all">All units</option>
          {data.units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
          <option value="none">Not in any unit</option>
        </select>
      </div>

      {data.people.length === 0 && <p className="card text-center text-stone-500">No volunteers yet. Add them one by one, or import a list from a spreadsheet.</p>}
      {data.people.length > 0 && rows.length === 0 && <p className="card text-center text-stone-500">Nobody matches.</p>}
      <ul className="space-y-2">
        {rows.map((p) => {
          const theirs = unitsOf(p.id)
          return (
            <li key={p.id} className="card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-stone-500">{[p.phone, p.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
                </div>
                {isAdmin && <button className="text-sm text-red-700 underline" onClick={() => removePerson(p)}>Remove</button>}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {theirs.map((u) => (
                  <span key={u.id} className="pill flex items-center gap-1 bg-olive-100 text-olive-700">{unitLabel(u)}
                    {canUnit(u) && <button onClick={() => toggleUnit(p, u, false)} aria-label={`Remove from ${u.name}`}>×</button>}
                  </span>
                ))}
                {theirs.length === 0 && <span className="pill bg-stone-100 text-stone-500">Not in a unit</span>}
                {myUnits.some((u) => !theirs.includes(u)) && (
                  <select className="rounded-full border border-dashed border-stone-300 bg-white px-2 py-0.5 text-xs" value=""
                    onChange={(e) => toggleUnit(p, unitsById[e.target.value], true)} aria-label={`Add ${p.name} to a unit`}>
                    <option value="">+ Add to unit</option>
                    {myUnits.filter((u) => !theirs.includes(u)).map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
                  </select>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function AddPerson({ church, units, unitLabel, onDone }) {
  const [f, setF] = useState({ name: '', phone: '', email: '', unit: '' })
  const [err, setErr] = useState(null)
  async function submit(e) {
    e.preventDefault()
    if (!f.name.trim()) return setErr('Enter a name.')
    const { data, error } = await supabase.from('people')
      .insert({ church_id: church.id, name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null }).select('id').single()
    if (error) return setErr(error.message)
    if (f.unit) await supabase.from('unit_members').insert({ unit_id: f.unit, person_id: data.id })
    onDone(`${f.name.trim()} added.`)
  }
  return (
    <form onSubmit={submit} className="card grid gap-2 sm:grid-cols-2">
      <input className="input" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
      <input className="input" placeholder="Mobile (for texts)" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
      <input className="input" placeholder="Email (optional)" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
      <select className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label="Unit">
        <option value="">Unit (optional)</option>
        {units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
      </select>
      {err && <p className="text-sm text-red-700 sm:col-span-2">{err}</p>}
      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Save</button><button type="button" className="btn-ghost" onClick={() => onDone()}>Cancel</button></div>
    </form>
  )
}

// Paste from a spreadsheet: one person per line, "Name, Phone, Email" (tabs work too). Skips names already added.
function Import({ church, units, unitLabel, existing, onDone }) {
  const [text, setText] = useState('')
  const [unit, setUnit] = useState('')
  const [err, setErr] = useState(null)
  const known = new Set(existing.map((p) => p.name.trim().toLowerCase()))
  const parsed = text.split('\n').map((l) => l.split(/\t|,/).map((x) => x.trim())).filter((c) => c[0] && !/^name$/i.test(c[0]))
    .map(([name, phone, email]) => ({ name, phone: phone || null, email: email || null }))
  const fresh = parsed.filter((p) => !known.has(p.name.toLowerCase()))

  async function submit(e) {
    e.preventDefault()
    if (!fresh.length) return setErr('Nothing new to import.')
    const { data, error } = await supabase.from('people').insert(fresh.map((p) => ({ church_id: church.id, ...p }))).select('id')
    if (error) return setErr(error.message)
    if (unit) await supabase.from('unit_members').insert(data.map((p) => ({ unit_id: unit, person_id: p.id })))
    onDone(`Imported ${data.length} people${parsed.length - fresh.length ? ` (${parsed.length - fresh.length} already here, skipped)` : ''}.`)
  }
  return (
    <form onSubmit={submit} className="card space-y-2">
      <p className="text-sm text-stone-600">Paste from a spreadsheet: one person per line, as <b>Name, Phone, Email</b>. Phone and email are optional.</p>
      <textarea className="input min-h-[140px] py-2 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)}
        placeholder={'Ruth Bello, 07700 900001, ruth@example.com\nGrace Okafor, 07700 900002'} aria-label="People to import" />
      <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Add everyone to unit">
        <option value="">Add everyone to a unit (optional)</option>
        {units.map((u) => <option key={u.id} value={u.id}>{unitLabel(u)}</option>)}
      </select>
      <p className="text-sm text-stone-500">{fresh.length} new{parsed.length - fresh.length ? ` · ${parsed.length - fresh.length} already added` : ''}</p>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><button className="btn-primary" disabled={!fresh.length}>Import {fresh.length || ''}</button><button type="button" className="btn-ghost" onClick={() => onDone()}>Cancel</button></div>
    </form>
  )
}
