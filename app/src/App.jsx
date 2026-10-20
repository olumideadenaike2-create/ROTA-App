import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './supabase'
import Auth, { SetPassword } from './pages/Auth'
import Onboarding from './pages/Onboarding'
import Shell from './pages/Shell'
import Overview from './pages/Overview'
import Structure from './pages/Structure'
import People from './pages/People'
import Leaders from './pages/Leaders'

// Invite and password-reset emails arrive with "type=invite" or "type=recovery" in the URL hash.
const arrivedToSetPassword = /type=(invite|recovery)/.test(window.location.hash)

const ChurchCtx = createContext(null)
export const useChurch = () => useContext(ChurchCtx)

export default function App() {
  const [session, setSession] = useState(undefined)
  const [mustSetPassword, setMustSetPassword] = useState(arrivedToSetPassword)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setMustSetPassword(true)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <Splash />
  if (!session) return <Auth />
  if (mustSetPassword) return <SetPassword email={session.user.email} onDone={() => setMustSetPassword(false)} />
  return <ChurchLoader user={session.user} />
}

function ChurchLoader({ user }) {
  const [state, setState] = useState({ loading: true })
  const [churchId, setChurchId] = useState(() => { try { return localStorage.getItem('teamrota-church') } catch { return null } })

  const load = useCallback(async () => {
    await supabase.rpc('claim_invites') // turn any pending invites for this email into leader roles
    const { data, error } = await supabase.from('leaders')
      .select('id, role, department_id, unit_id, church:churches(id, name, slug, plan, trial_ends_at)')
      .eq('user_id', user.id)
    if (error) return setState({ loading: false, error: error.message })
    setState({ loading: false, mine: data })
  }, [user.id])

  useEffect(() => { load() }, [load])

  if (state.loading) return <Splash />
  if (state.error) return <p className="p-6 text-red-700">{state.error}</p>
  const churches = [...new Map(state.mine.map((l) => [l.church.id, l.church])).values()]
  if (churches.length === 0) return <Onboarding user={user} onCreated={(id) => { setChurchId(id); load() }} />
  const church = churches.find((c) => c.id === churchId) ?? churches[0]
  const myRoles = state.mine.filter((l) => l.church.id === church.id)

  return (
    <ChurchProvider church={church} churches={churches} myRoles={myRoles} user={user}
      switchChurch={(id) => { try { localStorage.setItem('teamrota-church', id) } catch {} ; setChurchId(id) }}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="structure" element={<Structure />} />
          <Route path="people" element={<People />} />
          <Route path="leaders" element={<Leaders />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ChurchProvider>
  )
}

function ChurchProvider({ church, churches, myRoles, user, switchChurch, children }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    const q = (t, cols = '*') => supabase.from(t).select(cols).eq('church_id', church.id)
    const [d, u, r, p] = await Promise.all([
      q('departments').order('sort'), q('units').order('sort'), q('roles').order('sort'),
      q('people', 'id, name, phone, email, created_at').order('name'),
    ])
    const err = [d, u, r, p].find((x) => x.error)?.error
    if (err) return setError(err.message)
    const unitIds = u.data.map((x) => x.id)
    const m = unitIds.length ? await supabase.from('unit_members').select('*').in('unit_id', unitIds) : { data: [] }
    setData({ departments: d.data, units: u.data, roles: r.data, people: p.data, members: m.data ?? [] })
  }, [church.id])

  useEffect(() => { reload() }, [reload])

  // Permission helpers mirror the database rules so the UI only offers what will succeed.
  const isAdmin = myRoles.some((l) => l.role === 'admin')
  const deptIds = new Set(myRoles.filter((l) => l.role.startsWith('dept_')).map((l) => l.department_id))
  const unitIdsLed = new Set(myRoles.filter((l) => l.role.startsWith('unit_')).map((l) => l.unit_id))
  const canDept = (deptId) => isAdmin || deptIds.has(deptId)
  const canUnit = (unit) => canDept(unit.department_id) || unitIdsLed.has(unit.id)

  return (
    <ChurchCtx.Provider value={{ church, churches, switchChurch, myRoles, user, data, error, reload, isAdmin, canDept, canUnit }}>
      {children}
    </ChurchCtx.Provider>
  )
}

function Splash() {
  return <div className="grid min-h-screen place-items-center text-stone-500">Loading…</div>
}
