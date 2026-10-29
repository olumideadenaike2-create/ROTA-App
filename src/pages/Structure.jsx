import { useState } from 'react'
import { supabase } from '../supabase'
import { useChurch } from '../App'

// Departments → units → roles. Each level is editable by whoever leads it (the database enforces the same rules).
export default function Structure() {
  const { church, data, reload, isAdmin, canDept, canUnit } = useChurch()
  const [err, setErr] = useState(null)
  if (!data) return <p className="text-stone-500">Loading…</p>

  async function run(q) {
    setErr(null)
    const { error } = await q
    if (error) setErr(error.message)
    await reload()
  }
  const rename = (table, row, label) => {
    const name = prompt(`Rename ${label}`, row.name)
    if (name?.trim() && name.trim() !== row.name) run(supabase.from(table).update({ name: name.trim() }).eq('id', row.id))
  }
  const remove = (table, row, warning) => {
    if (confirm(`Delete “${row.name}”? ${warning}`)) run(supabase.from(table).delete().eq('id', row.id))
  }
  const nextSort = (rows) => Math.max(0, ...rows.map((r) => r.sort)) + 1

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="h1">Departments</h1><p className="text-stone-600">Each department has units, and each unit has the roles you fill on a rota.</p></div>
      </div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {data.departments.map((d) => {
        const units = data.units.filter((u) => u.department_id === d.id)
        return (
          <section key={d.id} className="card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold">{d.name}</h2>
              {isAdmin && (
                <span className="flex gap-3 text-sm">
                  <button className="text-stone-500 underline" onClick={() => rename('departments', d, 'department')}>Rename</button>
                  <button className="text-red-700 underline" onClick={() => remove('departments', d, 'Its units, roles and rota slots will be deleted too.')}>Delete</button>
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {units.map((u) => {
                const roles = data.roles.filter((r) => r.unit_id === u.id)
                const members = data.members.filter((m) => m.unit_id === u.id).length
                const editable = canUnit(u)
                return (
                  <div key={u.id} className="rounded-xl border border-stone-200 bg-paper p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{u.name} <span className="text-sm font-normal text-stone-500">· {members} volunteers</span></h3>
                      {canDept(d.id) && (
                        <span className="flex gap-3 text-xs">
                          <button className="text-stone-500 underline" onClick={() => rename('units', u, 'unit')}>Rename</button>
                          <button className="text-red-700 underline" onClick={() => remove('units', u, 'Its roles and rota slots will be deleted too.')}>Delete</button>
                        </span>
                      )}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {roles.map((r) => (
                        <li key={r.id} className="group flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm">
                          {editable ? <button className="hover:underline" onClick={() => rename('roles', r, 'role')} title="Rename">{r.name}</button> : r.name}
                          {editable && <button className="text-stone-400 hover:text-red-700" onClick={() => remove('roles', r, '')} aria-label={`Delete ${r.name}`}>×</button>}
                        </li>
                      ))}
                      {roles.length === 0 && <li className="text-sm text-stone-500">No roles yet.</li>}
                    </ul>
                    {editable && (
                      <AddInline placeholder="Add a role, e.g. Camera 3" onAdd={(name) =>
                        run(supabase.from('roles').insert({ church_id: church.id, unit_id: u.id, name, sort: nextSort(roles) }))} />
                    )}
                  </div>
                )
              })}
            </div>

            {canDept(d.id) && (
              <AddInline placeholder="Add a unit, e.g. Livestream" button="Add unit" onAdd={(name) =>
                run(supabase.from('units').insert({ church_id: church.id, department_id: d.id, name, sort: nextSort(units) }))} />
            )}
          </section>
        )
      })}

      {data.departments.length === 0 && <p className="card text-stone-500">No departments yet.</p>}
      {isAdmin && (
        <section className="card">
          <h2 className="font-semibold">New department</h2>
          <AddInline placeholder="e.g. Car Park, Security, Prayer" button="Add department" onAdd={(name) =>
            run(supabase.from('departments').insert({ church_id: church.id, name, sort: nextSort(data.departments) }))} />
        </section>
      )}
    </div>
  )
}

function AddInline({ placeholder, button = 'Add', onAdd }) {
  const [v, setV] = useState('')
  return (
    <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV('') } }}>
      <input className="input min-h-[38px] text-sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <button className="btn-ghost btn-sm whitespace-nowrap" disabled={!v.trim()}>{button}</button>
    </form>
  )
}
