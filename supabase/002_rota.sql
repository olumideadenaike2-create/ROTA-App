-- Phase 2: rota with drafts + publish, volunteer link (name + PIN), replies, availability, check-in.
-- Run after 001_foundation.sql.

-- ---------- Tables ----------
-- person_id is what leaders are editing; published_person_id is what volunteers see.
-- A slot is a draft whenever the two differ. Publish copies one to the other.
create table assignments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  event_id uuid not null references events on delete cascade,
  role_id uuid not null references roles on delete cascade,
  person_id uuid references people on delete set null,
  published_person_id uuid references people on delete set null,
  reply text check (reply in ('pending','accepted','declined')),
  published_at timestamptz,
  unique (event_id, role_id)
);
create index on assignments (church_id);
create index on assignments (published_person_id);

create table availability (
  person_id uuid not null references people on delete cascade,
  event_id uuid not null references events on delete cascade,
  status text not null check (status in ('yes','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (person_id, event_id)
);

create table check_ins (
  event_id uuid not null references events on delete cascade,
  person_id uuid not null references people on delete cascade,
  checked_in_at timestamptz not null default now(),
  primary key (event_id, person_id)
);

-- ---------- Permissions ----------
create or replace function can_manage_role(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from roles r where r.id = rid and can_manage_unit(r.unit_id));
$$;
-- Services/events are church-wide: admins and heads/assistants of departments can create them.
create or replace function can_plan_events(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leaders where church_id = cid and user_id = auth.uid() and role in ('admin','dept_head','dept_assistant'));
$$;
revoke execute on function can_manage_role(uuid), can_plan_events(uuid) from public, anon;
grant execute on function can_manage_role(uuid), can_plan_events(uuid) to authenticated;

drop policy if exists write on events;
create policy write on events for all to authenticated using (can_plan_events(church_id)) with check (can_plan_events(church_id));

alter table assignments enable row level security;
alter table availability enable row level security;
alter table check_ins enable row level security;

create policy read on assignments for select to authenticated using (is_member(church_id));
create policy write on assignments for all to authenticated using (can_manage_role(role_id)) with check (can_manage_role(role_id) and is_member(church_id));
-- Leaders change who is in a slot; only publish_rota() may touch what volunteers see.
revoke insert, update on assignments from anon, authenticated;
grant insert (church_id, event_id, role_id, person_id) on assignments to authenticated;
grant update (person_id) on assignments to authenticated;

create policy read on availability for select to authenticated
  using (exists (select 1 from people p where p.id = person_id and is_member(p.church_id)));
create policy write on availability for all to authenticated
  using (exists (select 1 from people p where p.id = person_id and is_member(p.church_id)))
  with check (exists (select 1 from people p where p.id = person_id and is_member(p.church_id)));

create policy read on check_ins for select to authenticated
  using (exists (select 1 from events e where e.id = event_id and is_member(e.church_id)));
create policy write on check_ins for all to authenticated
  using (exists (select 1 from events e where e.id = event_id and is_member(e.church_id)))
  with check (exists (select 1 from events e join people p on p.id = person_id where e.id = event_id and p.church_id = e.church_id and is_member(e.church_id)));

-- ---------- Publish ----------
-- Publishes the caller's draft changes for one event. Returns who was affected (for notifications in phase 3).
create or replace function publish_rota(eid uuid)
returns table (person_id uuid, change text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with changed as (
    select a.id, a.person_id as new_p, a.published_person_id as old_p
    from assignments a where a.event_id = eid
      and a.person_id is distinct from a.published_person_id and can_manage_role(a.role_id)
    for update
  ), upd as (
    update assignments a set published_person_id = c.new_p, published_at = now(),
      reply = case when c.new_p is null then null else 'pending' end
    from changed c where a.id = c.id returning a.id
  )
  select c.new_p, 'assigned' from changed c where c.new_p is not null
  union all
  select c.old_p, 'removed' from changed c where c.old_p is not null;
end $$;
revoke all on function publish_rota(uuid) from public, anon;
grant execute on function publish_rota(uuid) to authenticated;

-- ---------- Volunteer link (no account; name + 4-digit PIN = identification, not security) ----------
create or replace function church_today(cid uuid) returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone timezone)::date from churches where id = cid;
$$;

create or replace function crew_church(church_slug text)
returns table (id uuid, name text, timezone text)
language sql stable security definer set search_path = public as $$
  select id, name, timezone from churches where slug = lower(church_slug);
$$;

create or replace function crew_people(church_slug text)
returns table (id uuid, name text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.pin_hash is not null from people p join churches c on c.id = p.church_id
  where c.slug = lower(church_slug) order by p.name;
$$;

create or replace function _crew_verify(pid uuid, pin text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v people;
begin
  select * into v from people where id = pid for update;
  if v.id is null then return 'Unknown person'; end if;
  if v.pin_hash is null then return 'PIN not set'; end if;
  if v.locked_until > now() then return 'Too many attempts. Try again in 15 minutes.'; end if;
  if crypt(pin, v.pin_hash) = v.pin_hash then
    update people set failed_pins = 0, locked_until = null where id = pid;
    return null;
  end if;
  update people set
    locked_until = case when failed_pins + 1 >= 5 then now() + interval '15 minutes' end,
    failed_pins = case when failed_pins + 1 >= 5 then 0 else failed_pins + 1 end
    where id = pid;
  return 'Wrong PIN';
end $$;

create or replace function crew_set_pin(pid uuid, pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  if pin !~ '^\d{4}$' then return jsonb_build_object('error', 'PIN must be 4 digits'); end if;
  update people set pin_hash = crypt(pin, gen_salt('bf')) where id = pid and pin_hash is null;
  if not found then return jsonb_build_object('error', 'A PIN is already set. Ask your leader to reset it.'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Everything a volunteer's home screen needs, or {"error": ...}.
create or replace function crew_home(pid uuid, pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text; me people; c churches;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  select * into me from people where id = pid;
  select * into c from churches where id = me.church_id;
  return jsonb_build_object(
    'me', jsonb_build_object('id', me.id, 'name', me.name),
    'church', jsonb_build_object('name', c.name, 'timezone', c.timezone),
    'today', (now() at time zone c.timezone)::date,
    'slots', coalesce((select jsonb_agg(row_to_json(x) order by x.call_at) from (
      select a.id, e.id as event_id, e.name as event_name, e.call_at, e.starts_at, e.ends_at, e.notes,
             (e.call_at at time zone c.timezone)::date as day,
             r.name as role, u.name as unit, d.name as department, a.reply,
             exists (select 1 from check_ins ci where ci.event_id = e.id and ci.person_id = pid) as checked_in
      from assignments a join events e on e.id = a.event_id join roles r on r.id = a.role_id
      join units u on u.id = r.unit_id join departments d on d.id = u.department_id
      where a.published_person_id = pid and (e.call_at at time zone c.timezone)::date >= (now() at time zone c.timezone)::date - 1) x), '[]'::jsonb),
    'team', coalesce((select jsonb_agg(row_to_json(t)) from (
      select a2.event_id, u.name as unit, r2.name as role, p2.name, (p2.id = pid) as is_me, a2.reply,
             exists (select 1 from check_ins ci where ci.event_id = a2.event_id and ci.person_id = p2.id) as checked_in
      from assignments a join roles r on r.id = a.role_id
      join assignments a2 on a2.event_id = a.event_id join roles r2 on r2.id = a2.role_id and r2.unit_id = r.unit_id
      join units u on u.id = r.unit_id join people p2 on p2.id = a2.published_person_id
      join events e on e.id = a.event_id
      where a.published_person_id = pid and (e.call_at at time zone c.timezone)::date >= (now() at time zone c.timezone)::date - 1
      order by r2.sort) t), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(row_to_json(ev) order by ev.call_at) from (
      select e.id, e.name, e.call_at, (e.call_at at time zone c.timezone)::date as day,
             (select status from availability av where av.event_id = e.id and av.person_id = pid) as availability
      from events e where e.church_id = c.id and e.call_at > now() - interval '12 hours' order by e.call_at limit 20) ev), '[]'::jsonb));
end $$;

create or replace function crew_reply(pid uuid, pin text, aid uuid, answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  if answer not in ('accepted','declined') then return jsonb_build_object('error', 'Invalid answer'); end if;
  update assignments set reply = answer where id = aid and published_person_id = pid;
  if not found then return jsonb_build_object('error', 'That slot is no longer yours'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function crew_set_availability(pid uuid, pin text, eid uuid, answer text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  if not exists (select 1 from events e join people p on p.church_id = e.church_id where e.id = eid and p.id = pid) then
    return jsonb_build_object('error', 'Unknown service'); end if;
  if answer is null then delete from availability where person_id = pid and event_id = eid;
  elsif answer in ('yes','maybe','no') then
    insert into availability (person_id, event_id, status) values (pid, eid, answer)
      on conflict (person_id, event_id) do update set status = excluded.status, updated_at = now();
  else return jsonb_build_object('error', 'Invalid answer'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Only on the day of the service, in the church's time zone.
create or replace function crew_check_in(pid uuid, pin text, eid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text; e events; tz text; d date; today date;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  select ev.* into e from events ev where ev.id = eid;
  if not exists (select 1 from assignments where event_id = eid and published_person_id = pid) then
    return jsonb_build_object('error', 'You are not on this service'); end if;
  select timezone into tz from churches where id = e.church_id;
  d := (e.call_at at time zone tz)::date; today := (now() at time zone tz)::date;
  if d <> today then
    return jsonb_build_object('error', case when d > today
      then format('Check-in opens on %s.', to_char(d, 'Dy DD Mon'))
      else 'Check-in for this service has closed.' end);
  end if;
  insert into check_ins (event_id, person_id) values (eid, pid) on conflict do nothing;
  return jsonb_build_object('checked_in_at', (select checked_in_at from check_ins where event_id = eid and person_id = pid));
end $$;

-- Leaders can clear a forgotten PIN for anyone in their church.
create or replace function reset_pin(pid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from people p where p.id = pid and is_member(p.church_id)) then raise exception 'Not allowed'; end if;
  update people set pin_hash = null, failed_pins = 0, locked_until = null where id = pid;
end $$;

revoke all on function _crew_verify(uuid, text), church_today(uuid) from public, anon, authenticated;
grant execute on function church_today(uuid) to authenticated;
revoke all on function reset_pin(uuid) from public, anon;
grant execute on function reset_pin(uuid) to authenticated;
grant execute on function crew_church(text), crew_people(text), crew_set_pin(uuid, text), crew_home(uuid, text),
  crew_reply(uuid, text, uuid, text), crew_set_availability(uuid, text, uuid, text), crew_check_in(uuid, text, uuid) to anon, authenticated;

alter publication supabase_realtime add table check_ins;
