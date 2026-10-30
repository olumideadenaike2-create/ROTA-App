// In-memory stand-in for Supabase so the app can be clicked through without a project. Example data only.
const uid = 'u-admin'
const T = { churches: [], leaders: [], departments: [], units: [], roles: [], people: [], unit_members: [], invites: [], events: [], assignments: [], availability: [], check_ins: [] }
const PINS = {}
let n = 0; const id = () => 'id' + ++n
const TPL = { Media: { Broadcast: ['Director', 'Camera 1', 'Camera 2'], Photography: ['Lead Photographer'] }, Worship: { Vocals: ['Lead'], Band: ['Keys', 'Drums'] } }
function query(table) {
  let rows = () => T[table]; const filters = []; let op = 'select', payload
  const run = () => {
    let r = T[table].filter((x) => filters.every((f) => f(x)))
    if (op === 'select') {
      if (table === 'leaders') r = r.map((l) => ({ ...l, church: T.churches.find((c) => c.id === l.church_id) }))
      return { data: r, error: null }
    }
    if (op === 'delete') { T[table] = T[table].filter((x) => !filters.every((f) => f(x))); return { data: null, error: null } }
    if (op === 'update') { r.forEach((x) => Object.assign(x, payload)); return { data: null, error: null } }
    if (op === 'insert') { const list = [].concat(payload).map((x) => ({ id: id(), sort: 0, created_at: new Date().toISOString(), ...(table === 'check_ins' ? { checked_in_at: new Date().toISOString() } : {}), ...x })); T[table].push(...list); return { data: list, error: null } }
  }
  const b = {
    select() { return b }, order() { return b }, single() { return Promise.resolve({ ...run(), data: run().data?.[0] }) },
    eq(c, v) { filters.push((x) => x[c] === v); return b }, gte(c, v) { filters.push((x) => x[c] >= v); return b }, in(c, vs) { filters.push((x) => vs.includes(x[c])); return b }, is(c, v) { filters.push((x) => (x[c] ?? null) === v); return b },
    insert(p) { op = 'insert'; payload = p; const res = run(); return Object.assign(Promise.resolve(res), { select: () => ({ single: () => Promise.resolve({ data: res.data[0], error: null }), then: (f) => Promise.resolve(res).then(f) }) }) },
    update(p) { op = 'update'; payload = p; return b }, delete() { op = 'delete'; return b },
    then(f, g) { return Promise.resolve(run()).then(f, g) },
  }
  return b
}
export const supabase = {
  from: query,
  rpc: async (name, a) => {
    if (name === 'claim_invites') return { data: 0 }
    if (name === 'publish_rota') {
      const out = []
      T.assignments.filter((x) => x.event_id === a.eid && x.person_id !== x.published_person_id).forEach((x) => {
        if (x.person_id) out.push({ person_id: x.person_id, change: 'assigned' }); if (x.published_person_id) out.push({ person_id: x.published_person_id, change: 'removed' })
        x.published_person_id = x.person_id; x.reply = x.person_id ? 'pending' : null })
      return { data: out }
    }
    if (name === 'reset_pin') { delete PINS[a.pid]; return { data: null } }
    if (name === 'crew_church') return { data: T.churches.filter((c) => c.slug === a.church_slug).map((c) => ({ id: c.id, name: c.name, timezone: 'Europe/London' })) }
    if (name === 'crew_people') { const c = T.churches.find((x) => x.slug === a.church_slug); return { data: T.people.filter((p) => p.church_id === c?.id).map((p) => ({ id: p.id, name: p.name, has_pin: !!PINS[p.id] })) } }
    if (name === 'crew_set_pin') { PINS[a.pid] = a.pin; return { data: { ok: true } } }
    const ok = PINS[a?.pid] && PINS[a.pid] === a.pin
    const day = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
    if (name.startsWith('crew_') && !ok) return { data: { error: 'Wrong PIN' } }
    if (name === 'crew_reply') { T.assignments.find((x) => x.id === a.aid).reply = a.answer; return { data: { ok: true } } }
    if (name === 'crew_set_availability') { T.availability = T.availability.filter((x) => !(x.person_id === a.pid && x.event_id === a.eid)); if (a.answer) T.availability.push({ person_id: a.pid, event_id: a.eid, status: a.answer }); return { data: { ok: true } } }
    if (name === 'crew_check_in') { const e = T.events.find((x) => x.id === a.eid); if (day(e.call_at) !== day(new Date())) return { data: { error: 'Check-in opens on ' + day(e.call_at) } }; T.check_ins.push({ event_id: a.eid, person_id: a.pid, checked_in_at: new Date().toISOString() }); return { data: { ok: true } } }
    if (name === 'crew_home') {
      const me = T.people.find((p) => p.id === a.pid); const today = day(new Date())
      const role = (rid) => T.roles.find((r) => r.id === rid), unit = (uid) => T.units.find((u) => u.id === uid), dept = (did) => T.departments.find((d) => d.id === did)
      const mine = T.assignments.filter((x) => x.published_person_id === a.pid)
      const slots = mine.map((x) => { const e = T.events.find((ev) => ev.id === x.event_id), r = role(x.role_id), u = unit(r.unit_id)
        return { id: x.id, event_id: e.id, event_name: e.name, call_at: e.call_at, starts_at: e.starts_at, ends_at: e.ends_at, notes: e.notes, day: day(e.call_at), role: r.name, unit: u.name, department: dept(u.department_id).name, reply: x.reply, checked_in: T.check_ins.some((c) => c.event_id === e.id && c.person_id === a.pid) } })
      const team = mine.flatMap((x) => { const uid = role(x.role_id).unit_id; return T.assignments.filter((y) => y.event_id === x.event_id && y.published_person_id && role(y.role_id).unit_id === uid)
        .map((y) => ({ event_id: y.event_id, unit: unit(uid).name, role: role(y.role_id).name, name: T.people.find((p) => p.id === y.published_person_id).name, is_me: y.published_person_id === a.pid, reply: y.reply, checked_in: T.check_ins.some((c) => c.event_id === y.event_id && c.person_id === y.published_person_id) })) })
      const events = T.events.filter((e) => e.church_id === me.church_id).map((e) => ({ id: e.id, name: e.name, call_at: e.call_at, day: day(e.call_at), availability: T.availability.find((v) => v.event_id === e.id && v.person_id === a.pid)?.status ?? null }))
      return { data: { me: { id: me.id, name: me.name }, church: { name: 'Grace Chapel', timezone: 'Europe/London' }, today, slots, team, events } }
    }
    if (name === 'church_leaders') return { data: T.leaders.map((l) => ({ ...l, email: 'pastor@grace.org' })) }
    if (name === 'create_church') {
      const cid = id(); T.churches.push({ id: cid, name: a.church_name, slug: a.church_slug, plan: 'trial', timezone: 'Europe/London', trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString() })
      T.leaders.push({ id: id(), church_id: cid, user_id: uid, role: 'admin' })
      a.templates.forEach((t, i) => { const did = id(); T.departments.push({ id: did, church_id: cid, name: t, sort: i })
        Object.entries(TPL[t] || {}).forEach(([u, rs], j) => { const unit = id(); T.units.push({ id: unit, church_id: cid, department_id: did, name: u, sort: j })
          rs.forEach((r, k) => T.roles.push({ id: id(), church_id: cid, unit_id: unit, name: r, sort: k })) }) })
      return { data: cid }
    }
  },
  channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
  auth: {
    getSession: async () => ({ data: { session: { user: { id: uid, email: 'pastor@grace.org' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {},
  },
}
