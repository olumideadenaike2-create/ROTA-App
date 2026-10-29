import { NavLink, Outlet } from 'react-router-dom'
import { supabase } from '../supabase'
import { useChurch } from '../App'
import { Logo } from './Auth'

export const ROLE_LABEL = {
  admin: 'Church admin', dept_head: 'Head of department', dept_assistant: 'Assistant head of department',
  unit_head: 'Unit head', unit_assistant: 'Assistant unit head',
}

export default function Shell() {
  const { church, churches, switchChurch, myRoles, isAdmin, user, error } = useChurch()
  const nav = [['/', 'Overview'], ['/structure', 'Departments'], ['/people', 'People'], ...(isAdmin ? [['/leaders', 'Leaders']] : [])]
  const link = ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold whitespace-nowrap ${isActive ? 'bg-olive-600 text-white' : 'text-stone-600 hover:bg-stone-100'}`
  const trialDays = Math.max(0, Math.ceil((new Date(church.trial_ends_at) - Date.now()) / 86400000))

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-4">
          <Logo />
          {churches.length > 1 ? (
            <select className="rounded-lg border border-stone-200 bg-white px-2 py-1 text-sm" value={church.id} onChange={(e) => switchChurch(e.target.value)} aria-label="Church">
              {churches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : <span className="font-semibold text-stone-600">{church.name}</span>}
        </div>
        <div className="flex items-center gap-3 text-sm text-stone-500">
          <span className="hidden sm:inline">{user.email}</span>
          <button className="underline" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </div>
      </header>
      {church.plan === 'trial' && (
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Free trial · {trialDays} day{trialDays === 1 ? '' : 's'} left</p>
      )}
      <nav className="sticky top-0 z-10 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-stone-200 bg-paper/95 px-4 py-2 backdrop-blur" aria-label="Sections">
        {nav.map(([to, label]) => <NavLink key={to} to={to} end={to === '/'} className={link}>{label}</NavLink>)}
      </nav>
      <p className="mb-4 text-xs text-stone-500">You’re signed in as {myRoles.map((r) => ROLE_LABEL[r.role]).join(', ')}.</p>
      {error ? <p className="text-red-700">{error}</p> : <Outlet />}
    </div>
  )
}
