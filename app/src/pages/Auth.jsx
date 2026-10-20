import { useState } from 'react'
import { supabase } from '../supabase'

export function Logo() {
  return (
    <span className="flex items-center gap-2 font-display text-xl font-extrabold">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-olive-600">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      TeamRota
    </span>
  )
}

export default function Auth() {
  const [mode, setMode] = useState('signin') // signin | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr(null); setInfo(null); setBusy(true)
    if (mode === 'signup') {
      if (password.length < 10) { setBusy(false); return setErr('Use a password of at least 10 characters.') }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      if (error) setErr(error.message)
      else if (!data.session) setInfo(`Check ${email} for a link to confirm your account, then sign in.`)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setErr(error.message === 'Invalid login credentials' ? 'That email and password don’t match.' : error.message)
    }
    setBusy(false)
  }

  async function forgot() {
    if (!email) return setErr('Enter your email first, then tap “Forgot password?”.')
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setErr(error?.message ?? null)
    if (!error) setInfo(`If ${email} has an account, a link to set a new password is on its way.`)
  }

  const signup = mode === 'signup'
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="mb-8"><Logo /></div>
      <h1 className="h1 mb-1">{signup ? 'Set up your church' : 'Sign in'}</h1>
      <p className="mb-6 text-stone-600">{signup ? 'Create your account first. Next you’ll name your church and pick departments.' : 'For church admins, department heads and unit heads.'}</p>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className="input" type="password" required placeholder={signup ? 'Password (10+ characters)' : 'Password'} value={password}
          onChange={(e) => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} />
        {err && <p className="text-sm text-red-700">{err}</p>}
        {info && <p className="rounded-xl bg-olive-50 p-3 text-sm">{info}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        <button className="text-stone-600 underline" onClick={() => { setMode(signup ? 'signin' : 'signup'); setErr(null); setInfo(null) }}>
          {signup ? 'I already have an account' : 'New church? Create an account'}
        </button>
        {!signup && <button className="text-stone-500 underline" onClick={forgot}>Forgot password?</button>}
      </div>
      <p className="mt-8 text-xs text-stone-500">Invited by your church? Sign up with the email address they invited, and you’ll go straight to your team.</p>
    </div>
  )
}

export function SetPassword({ email, onDone }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault()
    if (password.length < 10) return setErr('Use at least 10 characters.')
    if (password !== confirm) return setErr('The passwords don’t match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErr(error.message)
    window.history.replaceState(null, '', window.location.pathname)
    onDone()
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 px-4 pt-16">
      <Logo />
      <h1 className="h1 pt-6">Choose your password</h1>
      {email && <p className="text-stone-600">For {email}</p>}
      <input className="input" type="password" placeholder="New password (10+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
      <input className="input" type="password" placeholder="Repeat password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {err && <p className="text-sm text-red-700">{err}</p>}
      <button className="btn-primary w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password and continue'}</button>
    </form>
  )
}
