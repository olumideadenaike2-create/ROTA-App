// Sends a church's queued messages. Text (Twilio) when the person has a phone and the church has
// credits; otherwise email (Resend) if they have an email; otherwise marked "skipped" with the reason.
// Called by the app after Publish, with the leader's sign-in token.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM   (TWILIO_FROM: a Twilio number or a sender name like "TeamRota")
//   RESEND_API_KEY, EMAIL_FROM                            (EMAIL_FROM e.g. "TeamRota <rota@mail.teamrota.app>")
import { createClient } from 'jsr:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// UK-first normalising: 07700 900001 → +447700900001
function toE164(raw: string | null): string | null {
  if (!raw) return null
  let n = raw.replace(/[^\d+]/g, '')
  if (n.startsWith('00')) n = '+' + n.slice(2)
  else if (n.startsWith('0')) n = '+44' + n.slice(1)
  else if (/^7\d{9}$/.test(n)) n = '+44' + n
  else if (!n.startsWith('+')) n = '+' + n
  return /^\+\d{8,15}$/.test(n) ? n : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
  const { data: { user } } = await asUser.auth.getUser()
  if (!user) return json({ error: 'Sign in first' }, 401)
  const { church_id } = await req.json().catch(() => ({}))
  const { data: member } = await asUser.rpc('is_member', { cid: church_id })
  if (!member) return json({ error: 'Not allowed' }, 403)

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: queue } = await db.from('messages').select('id, body, person:people(name, phone, email)')
    .eq('church_id', church_id).eq('status', 'queued').order('created_at').limit(200)

  const tw = { sid: Deno.env.get('TWILIO_ACCOUNT_SID'), token: Deno.env.get('TWILIO_AUTH_TOKEN'), from: Deno.env.get('TWILIO_FROM') }
  const rs = { key: Deno.env.get('RESEND_API_KEY'), from: Deno.env.get('EMAIL_FROM') }
  const result = { sms: 0, email: 0, skipped: 0, failed: 0 }

  for (const m of queue ?? []) {
    const p = (m as any).person ?? {}
    const phone = toE164(p.phone)
    let channel: 'sms' | 'email' | null = null, status = 'skipped', detail = ''
    try {
      if (phone && tw.sid && tw.token && tw.from) {
        const { data: credit } = await db.rpc('use_sms_credit', { cid: church_id })
        if (credit) {
          channel = 'sms'
          const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${tw.sid}/Messages.json`, {
            method: 'POST',
            headers: { Authorization: 'Basic ' + btoa(`${tw.sid}:${tw.token}`), 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ To: phone, From: tw.from, Body: m.body }),
          })
          if (r.ok) status = 'sent'
          else { status = 'failed'; detail = `Text failed: ${(await r.json().catch(() => ({}))).message ?? r.status}`; await db.rpc('refund_sms_credit', { cid: church_id }) }
        } else detail = 'No text credits left'
      } else detail = !phone ? 'No valid mobile number' : 'Texting not set up yet'
      if (status === 'skipped' && p.email && rs.key && rs.from) {
        channel = 'email'
        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST', headers: { Authorization: `Bearer ${rs.key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: rs.from, to: p.email, subject: 'Your rota', text: m.body }),
        })
        if (r.ok) { status = 'sent'; detail = detail ? `${detail}; sent by email` : '' } else { status = 'failed'; detail = `Email failed (${r.status})` }
      } else if (status === 'skipped' && !p.email) detail += '; no email address'
    } catch (e) { status = 'failed'; detail = String(e) }
    await db.from('messages').update({ status, channel, detail: detail || null, sent_at: status === 'sent' ? new Date().toISOString() : null }).eq('id', m.id)
    result[status === 'sent' ? channel! : (status as 'skipped' | 'failed')]++
  }
  return json(result)
})
