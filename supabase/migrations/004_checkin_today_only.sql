-- Run once in Supabase SQL Editor.
-- Crew can only check in on the day of the session (venue time, Europe/London).
-- Change the time zone below if the venue is elsewhere.

create or replace function crew_check_in(vid uuid, pin text, sid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text; ts timestamptz; s sessions; today date := (now() at time zone 'Europe/London')::date;
begin
  err := _crew_verify(vid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  select * into s from sessions where id = sid;
  if s.id is null then return jsonb_build_object('error', 'Unknown session'); end if;
  if not exists (select 1 from assignments where session_id = sid and volunteer_id = vid) then
    return jsonb_build_object('error', 'You are not on this session');
  end if;
  if s.day <> today then
    return jsonb_build_object('error',
      case when s.day > today
        then format('Check-in for %s opens on %s. You can only check in on the day.', s.code, to_char(s.day, 'Dy DD Mon'))
        else format('%s was on %s — check-in has closed.', s.code, to_char(s.day, 'Dy DD Mon')) end);
  end if;
  insert into check_ins (session_id, volunteer_id) values (sid, vid)
    on conflict (session_id, volunteer_id) do nothing;
  select checked_in_at into ts from check_ins where session_id = sid and volunteer_id = vid;
  return jsonb_build_object('checked_in_at', ts);
end $$;

-- The app asks the server for "today" so a wrong phone clock can't confuse it.
create or replace function venue_today() returns date
language sql stable as $$ select (now() at time zone 'Europe/London')::date $$;
grant execute on function venue_today() to anon, authenticated;
