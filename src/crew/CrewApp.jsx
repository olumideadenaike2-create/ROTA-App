import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import NamePicker from './NamePicker'
import PinEntry from './PinEntry'
import Schedule from './Schedule'

// Crew identity is name + 4-digit PIN. This is identification, not security:
// it stops people casually checking each other in, nothing more.
const KEY = 'copak-crew'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null }
}
function save(v) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch {}
}

export default function CrewApp() {
  const [who, setWho] = useState(null)          // { id, name, has_pin }
  const [auth, setAuth] = useState(load)        // { id, pin }
  const [data, setData] = useState(null)        // { me, schedule }
  const [error, setError] = useState(null)

  async function fetchSchedule(a) {
    const { data: res, error: err } = await supabase.rpc('crew_schedule', { vid: a.id, pin: a.pin })
    if (err || res?.error) {
      return err?.message ?? res.error
    }
    setData(res)
    return null
  }

  useEffect(() => {
    if (!auth) return
    fetchSchedule(auth).then((err) => {
      if (err) { setError(err); setAuth(null); save(null) }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onPin(pin, isNew) {
    if (isNew) {
      const { error: err } = await supabase.rpc('crew_set_pin', { vid: who.id, pin })
      if (err) return err.message
    }
    const a = { id: who.id, pin }
    const err = await fetchSchedule(a)
    if (err) return err
    setAuth(a); save(a); setError(null)
    return null
  }

  function signOut() {
    save(null); setAuth(null); setData(null); setWho(null)
  }

  if (auth && data) return <Schedule auth={auth} data={data} reload={() => fetchSchedule(auth)} onSignOut={signOut} />
  if (auth && !data) return <Shell><p className="text-center text-stone-500 py-20">Loading your schedule…</p></Shell>
  if (who) return <Shell><PinEntry who={who} onSubmit={onPin} onBack={() => setWho(null)} /></Shell>
  return <Shell>{error && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-800">{error}</p>}<NamePicker onPick={setWho} /></Shell>
}

export function Shell({ children }) {
  return (
    <div className="mx-auto max-w-md px-4 pb-10 pt-6">
      <header className="mb-6 text-center">
        <p className="label">COPAK 2026 · Media Team</p>
        <h1 className="text-2xl font-bold">COPAK Crew</h1>
      </header>
      {children}
    </div>
  )
}
