import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Loads everything the admin screens need in one go. Data is small (~30 people, 125 slots).
export function useData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const [s, p, r, v, a, c] = await Promise.all([
      supabase.from('sessions').select('*').order('starts_at'),
      supabase.from('pods').select('*').order('sort_order'),
      supabase.from('roles').select('*').order('sort_order'),
      supabase.from('volunteers').select('id,name,phone,pod_id,photo_url').order('name'),
      supabase.from('assignments').select('*'),
      supabase.from('check_ins').select('*'),
    ])
    const err = [s, p, r, v, a, c].find((x) => x.error)?.error
    if (err) return setError(err.message)
    setData({ sessions: s.data, pods: p.data, roles: r.data, volunteers: v.data, assignments: a.data, checkIns: c.data })
  }, [])

  useEffect(() => { reload() }, [reload])
  return { data, error, reload, setData }
}

export function SessionTabs({ sessions, value, onChange }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto">
      {sessions.map((s) => (
        <button key={s.id} onClick={() => onChange(s.id)}
          className={`btn min-w-[64px] ${value === s.id ? 'bg-ink text-white' : 'border border-stone-200 bg-white'}`}>
          {s.code}
        </button>
      ))}
    </div>
  )
}

export function Loading({ error }) {
  return <p className={`py-10 text-center ${error ? 'text-red-700' : 'text-stone-500'}`}>{error ?? 'Loading…'}</p>
}
