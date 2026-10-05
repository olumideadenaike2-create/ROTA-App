// "14:00:00" -> "2:00pm"
export function fmtTime(t) {
  if (!t) return null
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')}${suffix}`
}

// "2026-10-23" -> "Fri 23 Oct"
export function fmtDay(d) {
  const date = new Date(`${d}T12:00:00`)
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

export function fmtStamp(ts) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit' })
}

export function sessionTimes(s) {
  const parts = [`Call ${fmtTime(s.crew_call)}`]
  if (s.doors) parts.push(`Doors ${fmtTime(s.doors)}`)
  if (s.start_time && s.end_time) parts.push(`${fmtTime(s.start_time)}–${fmtTime(s.end_time)}`)
  else if (s.end_time) parts.push(`until ${fmtTime(s.end_time)}`)
  return parts.join(' · ')
}

// The session happening now, else the next one, else the last one.
export function pickCurrent(list, now = new Date()) {
  if (!list.length) return null
  const live = list.find((s) => new Date(s.starts_at) <= now && now <= new Date(s.ends_at))
  if (live) return live
  return list.find((s) => new Date(s.starts_at) > now) ?? list[list.length - 1]
}
