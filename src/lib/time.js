// All service times are shown in the church's time zone (default Europe/London).
export const fmtDay = (iso, tz) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz })
export const fmtTime = (iso, tz) => new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz }).replace(' ', '').toLowerCase()
export const dayKey = (iso, tz) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz }) // YYYY-MM-DD
export const todayKey = (tz) => new Date().toLocaleDateString('en-CA', { timeZone: tz })
export function eventTimes(e, tz) {
  const parts = [`Call ${fmtTime(e.call_at, tz)}`]
  if (e.starts_at) parts.push(e.ends_at ? `${fmtTime(e.starts_at, tz)}–${fmtTime(e.ends_at, tz)}` : `Starts ${fmtTime(e.starts_at, tz)}`)
  return parts.join(' · ')
}
// "2026-11-02" + "08:15" entered by a leader → ISO, read as local time on the leader's device.
export const toIso = (date, time) => (date && time ? new Date(`${date}T${time}`).toISOString() : null)
