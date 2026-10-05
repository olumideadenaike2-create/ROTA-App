-- COPAK Crew schema. Run once in Supabase SQL editor.
create extension if not exists pgcrypto;

create table admins (user_id uuid primary key references auth.users on delete cascade);

create table pods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort_order int not null default 0,
  lead_id uuid,
  deputy_id uuid
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  pod_id uuid not null references pods on delete cascade,
  section text,                       -- optional sub-group, e.g. "Broadcast"
  name text not null,
  sort_order int not null default 0
);

create table volunteers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  pod_id uuid references pods on delete set null,
  photo_url text,
  pin_hash text,
  failed_pins int not null default 0,
  locked_until timestamptz
);

alter table pods add constraint pods_lead_fk foreign key (lead_id) references volunteers on delete set null;
alter table pods add constraint pods_deputy_fk foreign key (deputy_id) references volunteers on delete set null;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- "Rig", "S1"...
  name text not null,
  day date not null,
  crew_call time not null,
  doors time,
  start_time time,
  end_time time,
  starts_at timestamptz not null,     -- absolute crew call, used for "current/next"
  ends_at timestamptz not null,
  notes text
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  role_id uuid not null references roles on delete cascade,
  volunteer_id uuid references volunteers on delete cascade,
  room_position text,
  callsign text,
  unique (session_id, role_id)
);

create table check_ins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions on delete cascade,
  volunteer_id uuid not null references volunteers on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique (session_id, volunteer_id)
);

-- ---------- RLS ----------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

do $$ declare t text; begin
  foreach t in array array['pods','roles','volunteers','sessions','assignments','check_ins','admins'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy admin_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
-- No anon policies: crew never touch tables directly, only the RPCs below.

-- Admins must never read PIN hashes through the API either.
revoke select on volunteers from anon, authenticated;
grant select (id, name, phone, pod_id, photo_url, failed_pins, locked_until) on volunteers to authenticated;

-- ---------- Crew RPCs (identification, not security) ----------
create or replace function crew_list()
returns table (id uuid, name text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select id, name, pin_hash is not null from volunteers order by name;
$$;

-- Returns null if OK, otherwise an error message. Does NOT raise on a wrong PIN,
-- so the failed-attempt counter is committed (a raise would roll it back).
create or replace function _crew_verify(vid uuid, pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v volunteers;
begin
  select * into v from volunteers where id = vid for update;
  if v.id is null then return 'Unknown volunteer'; end if;
  if v.pin_hash is null then return 'PIN not set'; end if;
  if v.locked_until > now() then return 'Too many attempts — try again in 15 minutes'; end if;
  if crypt(pin, v.pin_hash) = v.pin_hash then
    update volunteers set failed_pins = 0, locked_until = null where id = vid;
    return null;
  end if;
  update volunteers set
    locked_until = case when failed_pins + 1 >= 5 then now() + interval '15 minutes' end,
    failed_pins = case when failed_pins + 1 >= 5 then 0 else failed_pins + 1 end
    where id = vid;
  return 'Wrong PIN';
end $$;

create or replace function crew_set_pin(vid uuid, pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if pin !~ '^\d{4}$' then raise exception 'PIN must be 4 digits'; end if;
  update volunteers set pin_hash = crypt(pin, gen_salt('bf')) where id = vid and pin_hash is null;
  if not found then raise exception 'PIN already set — ask the media lead to reset it'; end if;
end $$;

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
        where a.volunteer_id = vid) x), '[]'::jsonb));
end $$;

-- Returns {"error": "..."} or {"checked_in_at": "..."}
create or replace function crew_check_in(vid uuid, pin text, sid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text; ts timestamptz;
begin
  err := _crew_verify(vid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  if not exists (select 1 from assignments where session_id = sid and volunteer_id = vid) then
    return jsonb_build_object('error', 'You are not on this session');
  end if;
  insert into check_ins (session_id, volunteer_id) values (sid, vid)
    on conflict (session_id, volunteer_id) do nothing;
  select checked_in_at into ts from check_ins where session_id = sid and volunteer_id = vid;
  return jsonb_build_object('checked_in_at', ts);
end $$;

-- Admin helpers
create or replace function admin_reset_pin(vid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  update volunteers set pin_hash = null, failed_pins = 0, locked_until = null where id = vid;
end $$;

create or replace function admin_copy_session(from_sid uuid, to_sid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  insert into assignments (session_id, role_id, volunteer_id, room_position, callsign)
    select to_sid, role_id, volunteer_id, room_position, callsign from assignments where session_id = from_sid
  on conflict (session_id, role_id) do update
    set volunteer_id = excluded.volunteer_id, room_position = excluded.room_position, callsign = excluded.callsign;
end $$;

revoke all on function _crew_verify(uuid, text) from public, anon, authenticated;
revoke all on function admin_reset_pin(uuid), admin_copy_session(uuid, uuid) from public, anon;
grant execute on function crew_list(), crew_set_pin(uuid, text), crew_schedule(uuid, text), crew_check_in(uuid, text, uuid) to anon, authenticated;

-- Live board updates
alter publication supabase_realtime add table check_ins;

-- ---------- Photo storage ----------
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict do nothing;
create policy "admin upload photos" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and is_admin());
create policy "admin delete photos" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and is_admin());
