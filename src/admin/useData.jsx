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
    // Availability is optional: before migration 003 the table doesn't exist, so treat as "no answers".
    const av = await supabase.from('availability').select('volunteer_id,session_id,status')
    const availability = Object.fromEntries((av.error ? [] : av.data).map((x) => [`${x.volunteer_id}|${x.session_id}`, x.status]))
    setData({ sessions: s.data, pods: p.data, roles: r.data, volunteers: v.data, assignments: a.data, checkIns: c.data, availability })
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

// availability lookup: 'yes' | 'no' | 'maybe' | undefined (no answer)
export const availOf = (data, vid, sid) => data.availability?.[`${vid}|${sid}`]
export const AVAIL_LABEL = { yes: 'Available', maybe: 'Maybe', no: 'Not available' }

// Ask before putting someone on a session they said they can't (or might not) do.
export function confirmAvailability(data, v, session) {
  const a = availOf(data, v.id, session.id)
  if (a === 'no') return confirm(`${v.name} said they're NOT available for ${session.code}. Assign anyway?`)
  if (a === 'maybe') return confirm(`${v.name} said "maybe" for ${session.code}. Assign anyway?`)
  return true
}
