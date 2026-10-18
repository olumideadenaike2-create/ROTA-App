import { useMemo, useState } from 'react'
import { fmtDay, fmtStamp, sessionTimes } from '../format'
import { AVAIL_LABEL, Loading, availOf, useData } from './useData'

const STATUS = {
  all: 'All slots',
  assigned: 'Assigned only',
  unassigned: 'Unassigned slots only',
  here: 'Checked in',
  missing: 'Assigned, not checked in',
}

export default function Export() {
  const { data, error } = useData()
  const [sessionIds, setSessionIds] = useState(null) // null = all
  const [podIds, setPodIds] = useState(null)
  const [status, setStatus] = useState('all')
  const [withPhone, setWithPhone] = useState(false)

  const rows = useMemo(() => (data ? buildRows(data) : []), [data])
  if (!data) return <Loading error={error} />

  const sel = { sessions: sessionIds ?? data.sessions.map((s) => s.id), pods: podIds ?? data.pods.map((p) => p.id) }
  const picked = rows.filter((r) =>
    sel.sessions.includes(r.session.id) && sel.pods.includes(r.pod.id) && matchStatus(r, status))
  const toggle = (list, setList, all, id) => {
    const cur = list ?? all
    setList(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])
  }
  const summary = [
    sel.sessions.length === data.sessions.length ? 'All sessions' : data.sessions.filter((s) => sel.sessions.includes(s.id)).map((s) => s.code).join(', '),
    sel.pods.length === data.pods.length ? 'All pods' : data.pods.filter((p) => sel.pods.includes(p.id)).map((p) => p.name).join(', '),
    STATUS[status],
  ].join(' · ')
  const fileBase = `copak-crew-${new Date().toISOString().slice(0, 10)}`

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="text-lg font-semibold">What to export</h2>
        <Chips label="Sessions" items={data.sessions.map((s) => ({ id: s.id, name: s.code }))}
          selected={sel.sessions} onToggle={(id) => toggle(sessionIds, setSessionIds, sel.sessions, id)}
          onAll={() => setSessionIds(null)} onNone={() => setSessionIds([])} />
        <Chips label="Pods" items={data.pods}
          selected={sel.pods} onToggle={(id) => toggle(podIds, setPodIds, sel.pods, id)}
          onAll={() => setPodIds(null)} onNone={() => setPodIds([])} />
        <label className="block">
          <span className="label">Include</span>
          <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="flex min-h-[44px] items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-olive-600" checked={withPhone} onChange={(e) => setWithPhone(e.target.checked)} />
          <span>Include phone numbers <span className="text-sm text-stone-500">(only if the file stays private)</span></span>
        </label>
      </section>

      <section className="card">
        <p className="mb-3 text-stone-600"><span className="font-semibold text-ink">{picked.length}</span> rows · {summary}</p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary" disabled={!picked.length}
            onClick={() => download(`${fileBase}.csv`, new Blob(['﻿' + toCsv(picked, withPhone)], { type: 'text/csv;charset=utf-8' }))}>
            Download CSV
          </button>
          <button className="btn-ghost" disabled={!picked.length}
            onClick={() => toPng(picked, withPhone, summary).then((blob) => download(`${fileBase}.png`, blob))}>
            Download PNG
          </button>
        </div>
      </section>

      {picked.length > 0 && (
        <section className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-stone-50 text-stone-500">
              <tr>{['Session', 'Role', 'Name', 'Callsign', 'Status'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {picked.slice(0, 50).map((r, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{r.session.code}</td>
                  <td className="px-3 py-2">{r.role.name}</td>
                  <td className={`px-3 py-2 ${r.volunteer ? '' : 'text-stone-400'}`}>{r.volunteer?.name ?? 'Unassigned'}</td>
                  <td className="px-3 py-2">{r.callsign ?? ''}</td>
                  <td className="px-3 py-2">{statusText(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {picked.length > 50 && <p className="px-3 py-2 text-sm text-stone-500">Preview shows 50 of {picked.length}. The files include all rows.</p>}
        </section>
      )}
    </div>
  )
}

function Chips({ label, items, selected, onToggle, onAll, onNone }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label">{label}</span>
        <span className="flex gap-3 text-sm text-stone-500">
          <button onClick={onAll}>All</button><button onClick={onNone}>None</button>
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => {
          const on = selected.includes(it.id)
          return (
            <button key={it.id} onClick={() => onToggle(it.id)} aria-pressed={on}
              className={`btn min-h-[40px] px-3 text-sm ${on ? 'bg-olive-600 text-white' : 'border border-stone-200 bg-white text-stone-600'}`}>
              {it.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// One row per slot (session × role), in session → pod → role order.
function buildRows(d) {
  const pod = Object.fromEntries(d.pods.map((p) => [p.id, p]))
  const vol = Object.fromEntries(d.volunteers.map((v) => [v.id, v]))
  const slot = Object.fromEntries(d.assignments.map((a) => [`${a.session_id}|${a.role_id}`, a]))
  const ins = Object.fromEntries(d.checkIns.map((c) => [`${c.session_id}|${c.volunteer_id}`, c]))
  const roles = [...d.roles].sort((a, b) => (pod[a.pod_id]?.sort_order ?? 0) - (pod[b.pod_id]?.sort_order ?? 0) || a.sort_order - b.sort_order)
  return d.sessions.flatMap((s) => roles.map((r) => {
    const a = slot[`${s.id}|${r.id}`] ?? {}
    const v = vol[a.volunteer_id] ?? null
    return { session: s, pod: pod[r.pod_id], role: r, volunteer: v,
      room_position: a.room_position ?? null, callsign: a.callsign ?? null,
      checkIn: v ? ins[`${s.id}|${v.id}`] ?? null : null,
      availability: v ? AVAIL_LABEL[availOf(d, v.id, s.id)] ?? 'No answer' : '' }
  }))
}

function matchStatus(r, status) {
  switch (status) {
    case 'assigned': return !!r.volunteer
    case 'unassigned': return !r.volunteer
    case 'here': return !!r.checkIn
    case 'missing': return !!r.volunteer && !r.checkIn
    default: return true
  }
}

const statusText = (r) => (!r.volunteer ? 'Unassigned' : r.checkIn ? `Here ${fmtStamp(r.checkIn.checked_in_at)}` : 'Not checked in')

function toCsv(rows, withPhone) {
  const head = ['Session', 'Day', 'Crew call', 'Pod', 'Section', 'Role', 'Name', ...(withPhone ? ['Phone'] : []),
    'Room position', 'Callsign', 'Availability', 'Status', 'Checked in at']
  const body = rows.map((r) => [r.session.code, r.session.day, r.session.crew_call?.slice(0, 5), r.pod?.name, r.role.section,
    r.role.name, r.volunteer?.name ?? 'Unassigned', ...(withPhone ? [r.volunteer?.phone] : []), r.room_position, r.callsign, r.availability,
    !r.volunteer ? 'Unassigned' : r.checkIn ? 'Here' : 'Not checked in', r.checkIn ? new Date(r.checkIn.checked_in_at).toISOString() : ''])
  const cell = (x) => {
    const s = x == null ? '' : String(x)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [head, ...body].map((row) => row.map(cell).join(',')).join('\r\n')
}

function download(name, blob) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Draws the selected rows as a clean rota image, grouped by session.
async function toPng(rows, withPhone, summary) {
  await document.fonts?.ready
  const cols = [
    { h: 'Pod', w: 170, v: (r) => r.pod?.name ?? '' },
    { h: 'Role', w: 230, v: (r) => r.role.name },
    { h: 'Name', w: 210, v: (r) => r.volunteer?.name ?? 'Unassigned' },
    ...(withPhone ? [{ h: 'Phone', w: 150, v: (r) => r.volunteer?.phone ?? '' }] : []),
    { h: 'Position', w: 170, v: (r) => r.room_position ?? '' },
    { h: 'Callsign', w: 110, v: (r) => r.callsign ?? '' },
    { h: 'Status', w: 150, v: statusText },
  ]
  const pad = 32, rowH = 34, headH = 30, groupH = 64
  const width = pad * 2 + cols.reduce((n, c) => n + c.w, 0)
  const groups = []
  for (const r of rows) {
    if (groups.at(-1)?.session.id !== r.session.id) groups.push({ session: r.session, rows: [] })
    groups.at(-1).rows.push(r)
  }
  const height = pad + 90 + groups.reduce((n, g) => n + groupH + headH + g.rows.length * rowH + 16, 0) + pad
  const scale = 2
  const canvas = Object.assign(document.createElement('canvas'), { width: width * scale, height: height * scale })
  const ctx = canvas.getContext('2d')
  ctx.scale(scale, scale)
  const font = (w, s) => `${w} ${s}px Inter, system-ui, sans-serif`
  const fit = (text, maxW) => {
    let t = String(text)
    if (ctx.measureText(t).width <= maxW) return t
    while (t && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
    return t + '…'
  }

  ctx.fillStyle = '#f7f4ef'; ctx.fillRect(0, 0, width, height)
  let y = pad
  ctx.fillStyle = '#1f2a37'; ctx.font = font(700, 26); ctx.textBaseline = 'top'
  ctx.fillText('COPAK 2026 · Media Crew', pad, y)
  ctx.fillStyle = '#78716c'; ctx.font = font(400, 15)
  ctx.fillText(fit(`${summary} · exported ${new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}`, width - pad * 2), pad, y + 38)
  y += 90

  for (const g of groups) {
    ctx.fillStyle = '#1f2a37'; ctx.font = font(700, 19)
    ctx.fillText(`${g.session.code} · ${g.session.name} · ${fmtDay(g.session.day)}`, pad, y + 14)
    ctx.fillStyle = '#57534e'; ctx.font = font(400, 14)
    ctx.fillText(sessionTimes(g.session), pad, y + 40)
    y += groupH
    ctx.fillStyle = '#e7e5e4'; ctx.fillRect(pad, y, width - pad * 2, headH)
    ctx.fillStyle = '#57534e'; ctx.font = font(600, 13)
    let x = pad
    for (const c of cols) { ctx.fillText(c.h.toUpperCase(), x + 10, y + 9); x += c.w }
    y += headH
    g.rows.forEach((r, i) => {
      ctx.fillStyle = i % 2 ? '#fafaf9' : '#ffffff'; ctx.fillRect(pad, y, width - pad * 2, rowH)
      let cx = pad
      for (const c of cols) {
        const isStatus = c.h === 'Status'
        ctx.font = font(c.h === 'Name' && r.volunteer ? 600 : 400, 14)
        ctx.fillStyle = !r.volunteer && (c.h === 'Name' || isStatus) ? '#a8a29e'
          : isStatus && r.checkIn ? '#3b5530' : '#1f2a37'
        if (isStatus && r.checkIn) { ctx.fillStyle = '#e1ebd9'; ctx.fillRect(cx + 4, y + 5, c.w - 8, rowH - 10); ctx.fillStyle = '#3b5530' }
        ctx.fillText(fit(c.v(r), c.w - 20), cx + 10, y + 10)
        cx += c.w
      }
      y += rowH
    })
    y += 16
  }
  return new Promise((res) => canvas.toBlob(res, 'image/png'))
}
