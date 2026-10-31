import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useChurch } from '../App'

export async function sendQueued(churchId) {
  const { data, error } = await supabase.functions.invoke('send-messages', { body: { church_id: churchId } })
  return error ? { error: error.message } : data
}
export const describeSend = (r) => r?.error ? `Messages are queued but couldn’t be sent yet (${r.error}).`
  : `Sent ${r.sms} text${r.sms === 1 ? '' : 's'} and ${r.email} email${r.email === 1 ? '' : 's'}.${r.skipped ? ` ${r.skipped} not sent — see Messages.` : ''}${r.failed ? ` ${r.failed} failed.` : ''}`

const STATUS = { sent: 'bg-olive-100 text-olive-700', queued: 'bg-stone-100 text-stone-600', skipped: 'bg-amber-50 text-amber-800', failed: 'bg-red-50 text-red-700' }

export default function Messages() {
  const { church, data } = useChurch()
  const [rows, setRows] = useState(null)
  const [credits, setCredits] = useState(null)
  const [note, setNote] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [m, c] = await Promise.all([
      supabase.from('messages').select('*').eq('church_id', church.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('churches').select('sms_credits').eq('id', church.id).single(),
    ])
    setRows(m.data ?? []); setCredits(c.data?.sms_credits ?? 0)
  }, [church.id])
  useEffect(() => { load() }, [load])

  if (!rows || !data) return <p className="text-stone-500">Loading…</p>
  const person = (id) => data.people.find((p) => p.id === id)?.name ?? '—'
  const retryable = rows.filter((m) => m.status === 'failed' || m.status === 'skipped')

  async function retry() {
    setBusy(true)
    await Promise.all(retryable.map((m) => supabase.from('messages').update({ status: 'queued' }).eq('id', m.id)))
    setNote(describeSend(await sendQueued(church.id))); setBusy(false); load()
  }

  return (
    <div className="space-y-4">
      <div><h1 className="h1">Messages</h1><p className="text-stone-600">Every text and email sent when a rota is published.</p></div>
      <section className="card">
        <p className="label">Text credits</p>
        <p className="font-display text-3xl font-extrabold tabular-nums">{credits}</p>
        <p className="text-sm text-stone-500">One credit per text. When credits run out, texting pauses and volunteers with an email address get an email instead. Buying more texts arrives with billing.</p>
      </section>
      {note && <p className="rounded-xl bg-olive-50 p-3 text-sm">{note}</p>}
      {retryable.length > 0 && <button className="btn-ghost" disabled={busy} onClick={retry}>{busy ? 'Sending…' : `Try again for ${retryable.length} unsent`}</button>}
      {rows.length === 0 ? <p className="card text-center text-stone-500">Nothing sent yet. Messages appear here after you publish a rota.</p> : (
        <ul className="space-y-2">
          {rows.map((m) => (
            <li key={m.id} className="card p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>{person(m.person_id)}</b>
                <span className="flex items-center gap-2 text-xs text-stone-500">
                  {new Date(m.created_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                  <span className={`pill ${STATUS[m.status]}`}>{m.status === 'sent' ? (m.channel === 'sms' ? 'Text sent' : 'Email sent') : m.status === 'skipped' ? 'Not sent' : m.status === 'failed' ? 'Failed' : 'Queued'}</span>
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-600">{m.body}</p>
              {m.detail && <p className="mt-1 text-xs text-stone-500">{m.detail}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
