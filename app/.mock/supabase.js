// In-memory stand-in for Supabase so the app can be clicked through without a project. Example data only.
const uid = 'u-admin'
const T = { churches: [], leaders: [], departments: [], units: [], roles: [], people: [], unit_members: [], invites: [] }
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
    if (op === 'insert') { const list = [].concat(payload).map((x) => ({ id: id(), sort: 0, created_at: new Date().toISOString(), ...x })); T[table].push(...list); return { data: list, error: null } }
  }
  const b = {
    select() { return b }, order() { return b }, single() { return Promise.resolve({ ...run(), data: run().data?.[0] }) },
    eq(c, v) { filters.push((x) => x[c] === v); return b }, in(c, vs) { filters.push((x) => vs.includes(x[c])); return b }, is(c, v) { filters.push((x) => (x[c] ?? null) === v); return b },
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
    if (name === 'church_leaders') return { data: T.leaders.map((l) => ({ ...l, email: 'pastor@grace.org' })) }
    if (name === 'create_church') {
      const cid = id(); T.churches.push({ id: cid, name: a.church_name, slug: a.church_slug, plan: 'trial', trial_ends_at: new Date(Date.now() + 14 * 864e5).toISOString() })
      T.leaders.push({ id: id(), church_id: cid, user_id: uid, role: 'admin' })
      a.templates.forEach((t, i) => { const did = id(); T.departments.push({ id: did, church_id: cid, name: t, sort: i })
        Object.entries(TPL[t] || {}).forEach(([u, rs], j) => { const unit = id(); T.units.push({ id: unit, church_id: cid, department_id: did, name: u, sort: j })
          rs.forEach((r, k) => T.roles.push({ id: id(), church_id: cid, unit_id: unit, name: r, sort: k })) }) })
      return { data: cid }
    }
  },
  auth: {
    getSession: async () => ({ data: { session: { user: { id: uid, email: 'pastor@grace.org' } } } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => {},
  },
}
