import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from '../supabase'
import Board from './Board'
import Assign from './Assign'
import Volunteers from './Volunteers'
import Pods from './Pods'

export default function AdminApp() {
  const [session, setSession] = useState(undefined)
  const [isAdmin, setIsAdmin] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return setIsAdmin(null)
    supabase.rpc('is_admin').then(({ data }) => setIsAdmin(!!data))
  }, [session])

  if (session === undefined) return null
  if (!session) return <Login />
  if (isAdmin === null) return <p className="p-6 text-stone-500">Loading…</p>
  if (!isAdmin) return (
    <div className="mx-auto max-w-md p-6 text-center">
      <p className="mb-4">This account isn't an admin. See the README for how to add yourself to the <code>admins</code> table.</p>
      <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  )

  const tab = ({ isActive }) => `flex-1 rounded-lg py-2 text-center text-sm font-semibold ${isActive ? 'bg-olive-600 text-white' : 'text-stone-600'}`
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold">COPAK Crew · Admin</h1>
        <button className="text-sm text-stone-500" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>
      <nav className="sticky top-0 z-10 mb-4 flex gap-1 rounded-xl border border-stone-200 bg-white p-1">
        <NavLink to="board" className={tab}>Board</NavLink>
        <NavLink to="assign" className={tab}>Assign</NavLink>
        <NavLink to="volunteers" className={tab}>Crew</NavLink>
        <NavLink to="pods" className={tab}>Pods</NavLink>
      </nav>
      <Routes>
        <Route path="board" element={<Board />} />
        <Route path="assign" element={<Assign />} />
        <Route path="volunteers" element={<Volunteers />} />
        <Route path="pods" element={<Pods />} />
        <Route path="*" element={<Navigate to="board" replace />} />
      </Routes>
    </div>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
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
      <button className="btn-primary w-full">Sign in</button>
    </form>
  )
}
