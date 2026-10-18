import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { fmtDay, sessionTimes } from '../format'

const OPTIONS = [
  { k: 'yes', label: '✓ Yes', on: 'bg-olive-600 text-white border-olive-600' },
  { k: 'maybe', label: 'Maybe', on: 'bg-amber-400 text-ink border-amber-400' },
  { k: 'no', label: '✗ No', on: 'bg-stone-600 text-white border-stone-600' },
]

// "Which sessions can you serve?" Volunteers set their own availability per session.
export default function Availability({ auth }) {
  const [state, setState] = useState(null) // { sessions, answers } | { unsupported: true }
  const [err, setErr] = useState(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    supabase.rpc('crew_availability', { vid: auth.id, pin: auth.pin }).then(({ data, error }) => {
      if (error) return setState({ unsupported: true }) // migration 003 not run yet: hide quietly
      if (data?.error) return setErr(data.error)
      setState(data)
      setOpen(Object.keys(data.answers).length < data.sessions.length)
    })
  }, [auth.id, auth.pin])

  if (!state || state.unsupported || !state.sessions?.length) return err ? <p className="mb-4 text-red-700">{err}</p> : null
  const answered = Object.keys(state.answers).length
  const complete = answered === state.sessions.length

  async function choose(sid, k) {
    const next = state.answers[sid] === k ? null : k // tap again to clear
    const prev = state.answers
    setState({ ...state, answers: next ? { ...prev, [sid]: next } : Object.fromEntries(Object.entries(prev).filter(([id]) => id !== sid)) })
    const { data, error } = await supabase.rpc('crew_set_availability', { vid: auth.id, pin: auth.pin, sid, status: next })
    if (error || data?.error) { setErr(error?.message ?? data.error); setState((s) => ({ ...s, answers: prev })) }
    else setErr(null)
  }

  return (
    <section className={`card mb-6 ${complete ? '' : 'border-amber-300 bg-amber-50'}`}>
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>
          <span className="block text-lg font-semibold">Which sessions can you serve?</span>
          <span className="text-sm text-stone-600">
            {complete ? 'Thanks — tap to change your answers.' : `${answered} of ${state.sessions.length} answered`}
          </span>
        </span>
        <span className="text-2xl text-stone-400">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-3">
          {state.sessions.map((s) => (
            <li key={s.id} className="border-t border-stone-200/70 pt-3">
              <p className="font-semibold">{s.code} · {fmtDay(s.day)}</p>
              <p className="mb-2 text-sm text-stone-600">{sessionTimes(s)}</p>
              <div className="grid grid-cols-3 gap-2">
                {OPTIONS.map((o) => {
                  const on = state.answers[s.id] === o.k
                  return (
                    <button key={o.k} onClick={() => choose(s.id, o.k)} aria-pressed={on}
                      className={`btn border text-base ${on ? o.on : 'border-stone-200 bg-white text-stone-600'}`}>
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
      {err && <p className="mt-2 text-red-700">{err}</p>}
      <p className="mt-3 text-xs text-stone-500">This helps the media lead plan the rota. It doesn't assign you to anything.</p>
    </section>
  )
}
