const sessions = [
  ['Rig','Rig & Setup','2026-10-23','09:00:00',null,null,'13:30:00','Systems green by 1:30pm'],
  ['S1','Session 1','2026-10-23','14:00:00','16:30:00','17:00:00','22:00:00'],
  ['S2','Session 2','2026-10-24','06:30:00','08:30:00','09:00:00','14:00:00'],
  ['S3','Session 3','2026-10-24','15:30:00','16:30:00','17:00:00','22:00:00'],
  ['S4','Session 4','2026-10-25','13:00:00','15:30:00','16:00:00','21:00:00'],
].map(([code,name,day,crew_call,doors,start_time,end_time,notes]) => ({ id: code, code, name, day, crew_call, doors, start_time, end_time, notes,
  starts_at: `${day}T${crew_call}Z`, ends_at: `${day}T${end_time}Z` }))
const pods = [{id:'p1',name:'Live Production',lead_id:'v1'},{id:'p2',name:'Photography',lead_id:'v8'},{id:'p3',name:'Roving Content'},{id:'p4',name:'Social & Comms'}]
const R = [['p1','Broadcast',['Director / Vision Mixer','Camera 1','Camera 2','Camera 3','Camera 4','Graphics','Stream Engineer','Broadcast Audio','Floor Manager']],
  ['p1','Record & Media',['ISO Record Operator','Media Manager (offload + verify)','Backup Runner']],
  ['p1','After Show',['Producer','Host 1','Host 2','Camera','Audio']],
  ['p2',null,['Lead Photographer','Photographer 2','Photographer 3']],['p3',null,['BTS Videographer','Testimony / Interview','Reels Shooter']],
  ['p4',null,['Social Poster','Story & Community']]]
const roles = []; R.forEach(([pod_id,section,names]) => names.forEach((name) => roles.push({ id: 'r'+roles.length, pod_id, section, name, sort_order: roles.length })))
const names = ['Tunde Adeyemi','Grace Okafor','Samuel Mensah','Ruth Bello','David Eze','Esther Johnson','Michael Ade','Joy Nwosu','Daniel Oyelaran','Faith Akin','Peter Obi','Mercy Ola','John Uche','Blessing Ike','Caleb Ojo','Ruth Ade','Ade Bankole','Kemi Lawal','Femi Kuti','Ngozi Eke','Paul Ayo']
const volunteers = names.map((name, i) => ({ id: 'v'+(i+1), name, phone: '07700 900' + (100+i), pod_id: i < 12 ? 'p1' : 'p2' }))
const assignments = roles.map((r, i) => ({ id: 'a'+i, session_id: 'S1', role_id: r.id, volunteer_id: i < 21 ? 'v'+(i+1) : null,
  room_position: i === 2 ? 'Riser, stage left' : null, callsign: i === 2 ? 'CAM 2' : null }))
const checkIns = ['v1','v2','v3','v5','v6','v8','v9','v10','v12','v14','v15','v17','v19','v20'].map((v, i) => ({ session_id: 'S1', volunteer_id: v, checked_in_at: `2026-10-23T13:${String(40+i).padStart(2,'0')}:00Z` }))
const tables = { sessions, pods, roles, volunteers, assignments, check_ins: checkIns }

const slot = (code, extra) => ({ session_id: code, ...sessions.find((s) => s.code === code), session_name: code, pod: 'Live Production', section: 'Broadcast',
  role: 'Camera 2', pod_lead: 'Tunde Adeyemi', pod_lead_phone: '07700900100', room_position: 'Riser, stage left', callsign: 'CAM 2', ...extra })
const rpcs = {
  is_admin: true,
  crew_list: volunteers.map((v, i) => ({ id: v.id, name: v.name, has_pin: i !== 2 })),
  crew_schedule: { me: { id: 'v3', name: 'Samuel Mensah' }, schedule: [
    slot('S1'), slot('S2', { role: 'Camera 3', room_position: 'Balcony centre', callsign: 'CAM 3' }),
    slot('S4', { role: 'Floor Manager', room_position: 'Stage door', callsign: 'FLOOR' })],
    pod_team: ['S1','S2','S4'].flatMap((sid) => roles.slice(0, 9).map((r, i) => ({ session_id: sid, pod: 'Live Production',
      role: r.name, name: volunteers[i].name, callsign: r.name.startsWith('Camera') ? r.name.replace('Camera ', 'CAM ') : null,
      is_me: i === 2, checked_in: sid === 'S1' && i % 3 !== 0 }))) },
}
const q = (data) => { const p = Promise.resolve({ data, error: null }); return Object.assign(p, { select: () => q(data), order: () => q(data), eq: () => q(data), single: () => q(data) }) }
export const supabase = {
  from: (t) => q(tables[t]),
  rpc: (n) => q(rpcs[n]),
  auth: { getSession: async () => ({ data: { session: location.pathname.startsWith('/admin') ? {} : null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {},
}
