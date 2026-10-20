import { Link } from 'react-router-dom'
import { useChurch } from '../App'

export default function Overview() {
  const { church, data, isAdmin } = useChurch()
  if (!data) return <p className="text-stone-500">Loading…</p>

  const counted = (d) => {
    const units = data.units.filter((u) => u.department_id === d.id)
    const uids = new Set(units.map((u) => u.id))
    return {
      units: units.length,
      roles: data.roles.filter((r) => uids.has(r.unit_id)).length,
      people: new Set(data.members.filter((m) => uids.has(m.unit_id)).map((m) => m.person_id)).size,
    }
  }
  const steps = [
    ['Departments, units and roles', data.departments.length > 0, '/structure'],
    ['Add your volunteers', data.people.length > 0, '/people'],
    ['Put volunteers in units', data.members.length > 0, '/people'],
    ...(isAdmin ? [['Invite your heads of department', false, '/leaders']] : []),
  ]

  return (
    <div className="space-y-6">
      <div>
        <p className="label">{church.name}</p>
        <h1 className="h1">Overview</h1>
        <p className="mt-1 text-stone-600">Volunteer link: <b>teamrota.app/{church.slug}</b> <span className="text-stone-400">(goes live with the rota in the next release)</span></p>
      </div>

      <section className="card">
        <h2 className="font-semibold">Getting started</h2>
        <ol className="mt-2 divide-y divide-stone-100">
          {steps.map(([label, done, to]) => (
            <li key={label} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex items-center gap-3">
                <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${done ? 'bg-olive-600 text-white' : 'border-2 border-stone-300'}`}>{done ? '✓' : ''}</span>
                {label}
              </span>
              <Link to={to} className="text-sm font-semibold text-olive-700">{done ? 'Edit' : 'Start'} →</Link>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Departments</h2>
        {data.departments.length === 0 ? (
          <p className="card text-stone-500">No departments yet. <Link className="font-semibold text-olive-700" to="/structure">Add one →</Link></p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.departments.map((d) => {
              const c = counted(d)
              return (
                <Link key={d.id} to="/structure" className="card block transition hover:border-olive-500">
                  <h3 className="font-display text-lg font-bold">{d.name}</h3>
                  <p className="mt-1 text-sm text-stone-500">{c.units} units · {c.roles} roles · {c.people} volunteers</p>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
