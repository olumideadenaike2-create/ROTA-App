-- Run once in Supabase SQL Editor. Adds per-session availability.
-- Volunteers set their own (PIN-checked); admin reads/edits everything.

create table if not exists availability (
  volunteer_id uuid not null references volunteers on delete cascade,
  session_id uuid not null references sessions on delete cascade,
  status text not null check (status in ('yes', 'no', 'maybe')),
  updated_at timestamptz not null default now(),
  primary key (volunteer_id, session_id)
);
alter table availability enable row level security;
drop policy if exists admin_all on availability;
create policy admin_all on availability for all to authenticated using (is_admin()) with check (is_admin());

-- Returns {"error": "..."} or {"sessions": [...], "answers": {"<session_id>": "yes|no|maybe"}}
create or replace function crew_availability(vid uuid, pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text;
begin
  err := _crew_verify(vid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  return jsonb_build_object(
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'code', code, 'name', name, 'day', day,
        'crew_call', crew_call, 'doors', doors, 'start_time', start_time, 'end_time', end_time) order by starts_at)
      from sessions), '[]'::jsonb),
    'answers', coalesce((select jsonb_object_agg(session_id, status) from availability where volunteer_id = vid), '{}'::jsonb));
end $$;

-- status null clears the answer. Returns {"error": "..."} or {"ok": true}
create or replace function crew_set_availability(vid uuid, pin text, sid uuid, status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text;
begin
  err := _crew_verify(vid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  if status is null then
    delete from availability where volunteer_id = vid and session_id = sid;
  elsif status in ('yes', 'no', 'maybe') then
    insert into availability (volunteer_id, session_id, status) values (vid, sid, status)
      on conflict (volunteer_id, session_id) do update set status = excluded.status, updated_at = now();
  else
    return jsonb_build_object('error', 'Invalid answer');
  end if;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function crew_availability(uuid, text), crew_set_availability(uuid, text, uuid, text) to anon, authenticated;
