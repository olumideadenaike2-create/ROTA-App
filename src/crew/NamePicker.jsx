import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function NamePicker({ onPick }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  const [err, setErr] = useState(null)

  useEffect(() => {
    supabase.rpc('crew_list').then(({ data, error }) => {
      if (error) setErr(error.message)
      else setList(data)
    })
  }, [])

  if (err) return <p className="text-center text-red-700">Couldn't load the crew list: {err}</p>
  if (!list) return <p className="text-center text-stone-500 py-10">Loading…</p>

  const shown = list.filter((v) => v.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Who are you?</h2>
      <input className="input mb-3" placeholder="Search your name" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.length === 0 && <p className="text-stone-500">No crew have been added yet.</p>}
      <ul className="space-y-2">
        {shown.map((v) => (
          <li key={v.id}>
            <button className="btn-ghost w-full justify-start text-left text-lg" onClick={() => onPick(v)}>
              {v.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
