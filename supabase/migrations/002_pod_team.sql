-- Run once in Supabase SQL Editor if you already ran schema.sql before this change.
-- Lets crew see who else is assigned in their pod for each session.
-- Returns {"error": "..."} or {"me": {...}, "schedule": [...]}
create or replace function crew_schedule(vid uuid, pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text;
begin
  err := _crew_verify(vid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  return jsonb_build_object(
    'me', (select jsonb_build_object('id', id, 'name', name, 'photo_url', photo_url) from volunteers where id = vid),
    'schedule', coalesce((
      select jsonb_agg(row_to_json(x) order by x.starts_at, x.pod_order, x.role_order) from (
        select s.id as session_id, s.code, s.name as session_name, s.day, s.crew_call, s.doors,
               s.start_time, s.end_time, s.starts_at, s.ends_at, s.notes,
               r.name as role, r.section, p.name as pod, p.sort_order as pod_order, r.sort_order as role_order,
               l.name as pod_lead, l.phone as pod_lead_phone, a.room_position, a.callsign, c.checked_in_at
        from assignments a
        join sessions s on s.id = a.session_id
        join roles r on r.id = a.role_id
        join pods p on p.id = r.pod_id
        left join volunteers l on l.id = p.lead_id
        left join check_ins c on c.session_id = s.id and c.volunteer_id = vid
        where a.volunteer_id = vid) x), '[]'::jsonb),
    -- Everyone assigned in the same pod(s) for the sessions this volunteer is on. Names/roles only, no phones.
    'pod_team', coalesce((
      select jsonb_agg(row_to_json(t) order by t.session_id, t.pod_order, t.role_order) from (
        select a.session_id, p.name as pod, p.sort_order as pod_order, r.sort_order as role_order,
               r.name as role, r.section, v.name, a.callsign, a.room_position,
               (v.id = vid) as is_me, (c.id is not null) as checked_in
        from assignments a
        join roles r on r.id = a.role_id
        join pods p on p.id = r.pod_id
        join volunteers v on v.id = a.volunteer_id
        left join check_ins c on c.session_id = a.session_id and c.volunteer_id = v.id
        where (a.session_id, r.pod_id) in (
          select a2.session_id, r2.pod_id from assignments a2 join roles r2 on r2.id = a2.role_id
          where a2.volunteer_id = vid)) t), '[]'::jsonb));
end $$;

