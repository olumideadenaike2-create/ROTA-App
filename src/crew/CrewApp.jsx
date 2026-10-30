import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabase'
import { Logo } from '../pages/Auth'
import { eventTimes, fmtDay, fmtTime } from '../lib/time'

// Volunteers: pick your name, enter a 4-digit PIN (identification, not security), see your rota.
const keyFor = (slug) => `teamrota-crew-${slug}`
const load = (slug) => { try { return JSON.parse(localStorage.getItem(keyFor(slug))) } catch { return null } }
const save = (slug, v) => { try { v ? localStorage.setItem(keyFor(slug), JSON.stringify(v)) : localStorage.removeItem(keyFor(slug)) } catch {} }

export default function CrewApp() {
  const { slug } = useParams()
  const [church, setChurch] = useState(undefined)
  const [auth, setAuth] = useState(() => load(slug))
  const [who, setWho] = useState(null)
  const [home, setHome] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => { supabase.rpc('crew_church', { church_slug: slug }).then(({ data }) => setChurch(data?.[0] ?? null)) }, [slug])

  const fetchHome = useCallback(async (a) => {
    const { data, error } = await supabase.rpc('crew_home', { pid: a.id, pin: a.pin })
    if (error || data?.error) return error?.message ?? data.error
    setHome(data); return null
  }, [])

  useEffect(() => { if (auth) fetchHome(auth).then((e) => { if (e) { setErr(e); setAuth(null); save(slug, null) } }) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onPin(pin, isNew) {
    if (isNew) {
      const { data, error } = await supabase.rpc('crew_set_pin', { pid: who.id, pin })
      if (error || data?.error) return error?.message ?? data.error
    }
    const a = { id: who.id, pin }
    const e = await fetchHome(a)
    if (e) return e
    setAuth(a); save(slug, a); setErr(null); return null
  }
  const signOut = () => { save(slug, null); setAuth(null); setHome(null); setWho(null) }

  if (church === undefined) return <Frame><p className="py-16 text-center text-stone-500">Loading…</p></Frame>
  if (church === null) return <Frame><p className="py-16 text-center">We couldn’t find that church. Check the link you were sent.</p></Frame>
  if (auth && home) return <Frame church={church}><Home auth={auth} home={home} reload={() => fetchHome(auth)} onSignOut={signOut} /></Frame>
  if (auth) return <Frame church={church}><p className="py-16 text-center text-stone-500">Loading your rota…</p></Frame>
  return (
    <Frame church={church}>
      {err && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-900">{err}</p>}
      {who ? <Pin who={who} onSubmit={onPin} onBack={() => setWho(null)} /> : <Names slug={slug} onPick={setWho} />}
    </Frame>
  )
}

function Frame({ church, children }) {
  return (
    <div className="mx-auto max-w-md px-4 pb-12 pt-5">
      <header className="mb-5 flex items-center justify-between"><Logo />{church && <span className="text-sm font-semibold text-stone-600">{church.name}</span>}</header>
      {children}
    </div>
  )
}

function Names({ slug, onPick }) {
  const [list, setList] = useState(null)
  const [q, setQ] = useState('')
  useEffect(() => { supabase.rpc('crew_people', { church_slug: slug }).then(({ data }) => setList(data ?? [])) }, [slug])
  if (!list) return <p className="py-10 text-center text-stone-500">Loading…</p>
  const shown = list.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div>
      <h1 className="h1 mb-3">Who are you?</h1>
      <input className="input mb-3" placeholder="Search your name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your name" />
      {list.length === 0 && <p className="text-stone-500">No volunteers have been added yet.</p>}
      <ul className="space-y-2">{shown.map((p) => <li key={p.id}><button className="btn-ghost w-full justify-start text-lg" onClick={() => onPick(p)}>{p.name}</button></li>)}</ul>
    </div>
  )
}

function Pin({ who, onSubmit, onBack }) {
  const isNew = !who.has_pin
  const [pin, setPin] = useState(''), [again, setAgain] = useState(''), [err, setErr] = useState(null), [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (!/^\d{4}$/.test(pin)) return setErr('Enter 4 digits.')
    if (isNew && pin !== again) return setErr('The PINs don’t match.')
    setBusy(true); setErr(await onSubmit(pin, isNew)); setBusy(false)
  }
  const props = { className: 'input text-center text-2xl tracking-[.5em]', inputMode: 'numeric', maxLength: 4, type: 'password', autoComplete: 'off' }
  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-stone-500">← Not {who.name}?</button>
      <h1 className="h1">Hi {who.name.split(' ')[0]}</h1>
      <p className="text-stone-600">{isNew ? 'Choose a 4-digit PIN. You’ll use it each time you open your rota on a new phone.' : 'Enter your 4-digit PIN.'}</p>
      <input {...props} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN" />
      {isNew && <input {...props} value={again} onChange={(e) => setAgain(e.target.value.replace(/\D/g, ''))} placeholder="Repeat" aria-label="Repeat PIN" />}
      {err && <p className="text-red-700">{err}</p>}
      <button className="btn-primary w-full text-lg" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
      {!isNew && <p className="text-center text-sm text-stone-500">Forgot your PIN? Ask your unit head to reset it.</p>}
    </form>
  )
}

function Home({ auth, home, reload, onSignOut }) {
  const tz = home.church.timezone
  const [busy, setBusy] = useState(null), [err, setErr] = useState(null)
  const call = async (fn, args, key) => {
    setBusy(key); setErr(null)
    const { data, error } = await supabase.rpc(fn, { pid: auth.id, pin: auth.pin, ...args })
    if (error || data?.error) setErr(error?.message ?? data.error)
    await reload(); setBusy(null)
  }
  const todays = home.slots.filter((s) => s.day === home.today)
  const upcoming = home.slots.filter((s) => s.day > home.today)
  const teamFor = (eid) => home.team.filter((t) => t.event_id === eid)
  const needsReply = upcoming.filter((s) => s.reply === 'pending')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="h1">Hi {home.me.name.split(' ')[0]}</h1><button className="text-sm text-stone-500 underline" onClick={onSignOut}>Not you?</button></div>
      {err && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</p>}

      {todays.map((s) => (
        <section key={s.id} className="card border-transparent bg-olive-50">
          <p className="label text-olive-700">Today</p>
          <h2 className="font-display text-xl font-bold">{s.event_name}</h2>
          <p className="text-sm text-stone-600">{eventTimes(s, tz)}</p>
          <Details s={s} />
          {s.checked_in
            ? <div className="mt-3 rounded-xl bg-olive-600 p-4 text-center text-lg font-bold text-white">✓ You’re checked in</div>
            : <button className="btn-primary mt-3 min-h-[68px] w-full text-2xl" disabled={busy === s.id} onClick={() => call('crew_check_in', { eid: s.event_id }, s.id)}>{busy === s.id ? 'Checking in…' : 'I’m here'}</button>}
          <Team rows={teamFor(s.event_id)} today />
        </section>
      ))}

      {needsReply.map((s) => (
        <section key={s.id} className="card border-amber-300">
          <p className="label text-amber-800">Please reply</p>
          <h2 className="font-display text-lg font-bold">{s.event_name} · {fmtDay(s.call_at, tz)}</h2>
          <p className="text-sm text-stone-600">{eventTimes(s, tz)}</p>
          <Details s={s} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn-primary" disabled={!!busy} onClick={() => call('crew_reply', { aid: s.id, answer: 'accepted' }, s.id)}>Accept</button>
            <button className="btn-ghost" disabled={!!busy} onClick={() => call('crew_reply', { aid: s.id, answer: 'declined' }, s.id)}>Can’t make it</button>
          </div>
        </section>
      ))}

      <section className="card">
        <h2 className="font-semibold">Coming up</h2>
        {upcoming.length === 0 ? <p className="mt-1 text-sm text-stone-500">You’re not on any upcoming services yet.</p> : (
          <ul className="mt-1 divide-y divide-stone-100">
            {upcoming.map((s) => (
              <li key={s.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <span><b>{fmtDay(s.call_at, tz)}</b> · {s.event_name}<br /><span className="text-sm text-stone-500">{s.unit} · {s.role} · call {fmtTime(s.call_at, tz)}</span></span>
                  <span className={`pill ${s.reply === 'accepted' ? 'bg-olive-100 text-olive-700' : s.reply === 'declined' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>{s.reply === 'accepted' ? 'Accepted' : s.reply === 'declined' ? 'Declined' : 'Reply'}</span>
                </div>
                {s.reply !== 'pending' && <button className="mt-1 text-xs text-stone-500 underline" onClick={() => call('crew_reply', { aid: s.id, answer: s.reply === 'accepted' ? 'declined' : 'accepted' }, s.id)}>Change to {s.reply === 'accepted' ? '“can’t make it”' : '“accept”'}</button>}
                <Team rows={teamFor(s.event_id)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="font-semibold">When can you serve?</h2>
        <p className="mb-2 text-sm text-stone-500">Your leaders see this when planning. It doesn’t sign you up.</p>
        {home.events.length === 0 ? <p className="text-sm text-stone-500">No services planned yet.</p> : home.events.map((e) => (
          <div key={e.id} className="border-t border-stone-100 py-2.5 first:border-t-0">
            <p className="text-sm font-semibold">{fmtDay(e.call_at, tz)} · {e.name}</p>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {[['yes', 'Yes', 'bg-olive-600 text-white border-olive-600'], ['maybe', 'Maybe', 'bg-amber-400 border-amber-400'], ['no', 'No', 'bg-ink text-white border-ink']].map(([v, l, on]) => (
                <button key={v} aria-pressed={e.availability === v} disabled={!!busy}
                  className={`btn min-h-[40px] border text-sm ${e.availability === v ? on : 'border-stone-200 bg-white text-stone-600'}`}
                  onClick={() => call('crew_set_availability', { eid: e.id, answer: e.availability === v ? null : v }, `av-${e.id}`)}>{l}</button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}

function Details({ s }) {
  return (
    <dl className="mt-2 grid grid-cols-[5.5rem_1fr] gap-y-1 text-[15px]">
      <dt className="text-stone-500">Role</dt><dd className="font-semibold">{s.role}</dd>
      <dt className="text-stone-500">Team</dt><dd className="font-semibold">{s.department} › {s.unit}</dd>
      {s.notes && <><dt className="text-stone-500">Notes</dt><dd>{s.notes}</dd></>}
    </dl>
  )
}

function Team({ rows, today }) {
  if (rows.length < 2) return null
  return (
    <details className="mt-2" open={today}>
      <summary className="cursor-pointer text-sm font-semibold text-olive-700">Your unit ({rows.length})</summary>
      <ul className="mt-1">
        {rows.map((t, i) => (
          <li key={i} className="flex justify-between gap-2 py-1 text-sm">
            <span>{t.name}{t.is_me && ' (you)'} <span className="text-stone-500">· {t.role}</span></span>
            {today ? (t.checked_in ? <span className="font-semibold text-olive-700">✓ Here</span> : <span className="text-stone-400">Not yet</span>)
              : <span className="text-stone-500">{t.reply === 'accepted' ? '✓' : t.reply === 'declined' ? '✗' : '…'}</span>}
          </li>
        ))}
      </ul>
    </details>
  )
}
