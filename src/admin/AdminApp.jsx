import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { supabase } from '../supabase'
import Board from './Board'
import Assign from './Assign'
import Volunteers from './Volunteers'
import Pods from './Pods'
import Export from './Export'

// Invite and password-reset emails land here with "type=invite" or "type=recovery" in the URL hash.
const arrivedToSetPassword = /type=(invite|recovery)/.test(window.location.hash)

export default function AdminApp() {
  const [session, setSession] = useState(undefined)
  const [mustSetPassword, setMustSetPassword] = useState(arrivedToSetPassword)
  const [isAdmin, setIsAdmin] = useState(null)
  const wide = useLocation().pathname.includes('volunteers') // room for the crew table on laptops

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setIsAdmin(null)
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(!!data))
  }, [session])

  if (session === undefined) return null
  if (!session) return <Login />
  if (mustSetPassword) return <SetPassword email={session.user?.email} onDone={() => setMustSetPassword(false)} />
  if (isAdmin === null) return <p className="p-6 text-stone-500">Loading…</p>
  if (!isAdmin) return (
    <div className="mx-auto max-w-md p-6 text-center">
      <p className="mb-4">This account isn't an admin. See the README for how to add yourself to the <code>admins</code> table.</p>
      <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )

  const tab = ({ isActive }) => `flex-1 rounded-lg py-2 text-center text-sm font-semibold ${isActive ? 'bg-olive-600 text-white' : 'text-stone-600'}`
  return (
    <div className={`mx-auto px-4 pb-16 pt-4 ${wide ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">COPAK Crew · Admin</h1>
        <button className="text-sm text-stone-500" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <nav className="sticky top-0 z-10 mb-4 flex gap-1 rounded-xl border border-stone-200 bg-white p-1">
        <NavLink to="board" className={tab}>Board</NavLink>
        <NavLink to="assign" className={tab}>Assign</NavLink>
        <NavLink to="volunteers" className={tab}>Crew</NavLink>
        <NavLink to="pods" className={tab}>Pods</NavLink>
        <NavLink to="export" className={tab}>Export</NavLink>
      </nav>
      <Routes>
        <Route path="board" element={<Board />} />
        <Route path="assign" element={<Assign />} />
        <Route path="volunteers" element={<Volunteers />} />
        <Route path="pods" element={<Pods />} />
        <Route path="export" element={<Export />} />
        <Route path="*" element={<Navigate to="board" replace />} />
      </Routes>
    </div>
  )
}

function SetPassword({ email, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (password.length < 10) return setErr('Use at least 10 characters.')
    if (password !== confirm) return setErr("The passwords don't match.")
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErr(error.message)
    window.history.replaceState(null, '', window.location.pathname)
    onDone()
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 px-4 pt-16">
      <h1 className="text-2xl font-bold">Choose your password</h1>
      {email && <p className="text-stone-600">For {email}</p>}
      <input className="input" type="password" placeholder="New password (10+ characters)" value={password}
        onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
      <input className="input" type="password" placeholder="Repeat password" value={confirm}
        onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {err && <p className="text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password and continue'}</button>
    </form>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [info, setInfo] = useState(null)
  async function forgot() {
    if (!email) return setErr('Enter your email first, then tap "Forgot password?".')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/admin` })
    setErr(error?.message ?? null)
    if (!error) setInfo(`If ${email} has an admin account, a link to set a new password is on its way.`)
  }
  async function submit(e) {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setErr(error?.message ?? null)
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 px-4 pt-16">
      <h1 className="text-2xl font-bold">Admin sign in</h1>
      <input className="input" type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {err && <p className="text-red-700">{err}</p>}
      {info && <p className="rounded-xl bg-olive-50 p-3 text-sm">{info}</p>}
      <button className="btn-primary w-full">Sign in</button>
      <button type="button" onClick={forgot} className="w-full text-sm text-stone-500 underline">Forgot password?</button>
    </form>
  )
}
