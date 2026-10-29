import { useState } from 'react'
import { supabase } from '../supabase'
import { Logo } from './Auth'

const TEMPLATES = [
  ['Media', 'Broadcast, Photography, Social'],
  ['Worship', 'Vocals, Band'],
  ['Ushering', 'Doors, Seating, Offering'],
  ['Children', 'Nursery, Kids Church'],
  ['Hospitality', 'Welcome, Refreshments'],
]

const toSlug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)

export default function Onboarding({ user, onCreated }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [picked, setPicked] = useState(['Media'])
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(null)
    if (name.trim().length < 2) return setErr('Enter your church’s name.')
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return setErr('The web address needs 3–40 letters, numbers or dashes.')
    setBusy(true)
    const { data, error } = await supabase.rpc('create_church', { church_name: name, church_slug: slug, templates: picked })
    setBusy(false)
    if (error) return setErr(error.message)
    onCreated(data)
  }

  const toggle = (t) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Logo />
      <p className="label mt-8">Welcome, {user.email}</p>
      <h1 className="h1 mt-1">Let’s set up your church</h1>
      <p className="mt-1 text-stone-600">You’ll be the church admin. You can invite department and unit heads next.</p>
      <form onSubmit={submit} className="mt-6 space-y-5">
        <label className="block">
          <span className="label">Church name</span>
          <input className="input mt-1" value={name} placeholder="Grace Chapel" autoFocus
            onChange={(e) => { setName(e.target.value); if (!slugEdited) setSlug(toSlug(e.target.value)) }} />
        </label>
        <label className="block">
          <span className="label">Volunteer link</span>
          <div className="mt-1 flex items-center overflow-hidden rounded-xl border border-stone-300 bg-white focus-within:ring-2 focus-within:ring-olive-500">
            <span className="whitespace-nowrap pl-3 text-stone-500">teamrota.app/</span>
            <input className="min-h-[44px] w-full bg-transparent pr-3 focus:outline-none" value={slug}
              onChange={(e) => { setSlug(toSlug(e.target.value)); setSlugEdited(true) }} aria-label="Volunteer link" />
          </div>
          <span className="mt-1 block text-xs text-stone-500">Volunteers open this link to see their rota.</span>
        </label>
        <fieldset>
          <legend className="label">Start with these departments</legend>
          <div className="mt-2 grid gap-2">
            {TEMPLATES.map(([t, units]) => (
              <label key={t} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${picked.includes(t) ? 'border-olive-500 bg-olive-50' : 'border-stone-200 bg-white'}`}>
                <input type="checkbox" className="h-5 w-5 accent-olive-600" checked={picked.includes(t)} onChange={() => toggle(t)} />
                <span><b>{t}</b><span className="block text-sm text-stone-500">{units}</span></span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-stone-500">Each comes with units and roles you can rename or delete. You can add more later.</p>
        </fieldset>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create church'}</button>
      </form>
    </div>
  )
}
