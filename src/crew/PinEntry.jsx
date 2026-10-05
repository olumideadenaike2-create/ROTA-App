import { useState } from 'react'

export default function PinEntry({ who, onSubmit, onBack }) {
  const isNew = !who.has_pin
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!/^\d{4}$/.test(pin)) return setErr('Enter 4 digits')
    if (isNew && pin !== confirm) return setErr("PINs don't match")
    setBusy(true)
    setErr(await onSubmit(pin, isNew))
    setBusy(false)
  }

  const pinProps = { className: 'input text-center text-2xl tracking-[.5em]', inputMode: 'numeric', maxLength: 4, type: 'password', autoComplete: 'off' }
  return (
    <form onSubmit={submit} className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-stone-500">← Not {who.name}?</button>
      <h2 className="text-lg font-semibold">Hi {who.name.split(' ')[0]}</h2>
      <p className="text-stone-600">
        {isNew ? 'Choose a 4-digit PIN. You’ll use it to check yourself in.' : 'Enter your 4-digit PIN.'}
      </p>
      <input {...pinProps} autoFocus value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-label="PIN" />
      {isNew && (
        <input {...pinProps} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))} placeholder="Repeat" aria-label="Repeat PIN" />
      )}
      {err && <p className="text-red-700">{err}</p>}
      <button className="btn-primary w-full text-lg" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
      {!isNew && <p className="text-center text-sm text-stone-500">Forgot your PIN? Ask the media lead to reset it.</p>}
    </form>
  )
}
