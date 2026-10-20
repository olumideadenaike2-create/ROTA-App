-- TeamRota (public, multi-church) — foundation schema.
-- Run once in the NEW Supabase project's SQL Editor. Not for the COPAK project.
create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table churches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$'),
  plan text not null default 'trial' check (plan in ('trial','team','church','growing','large')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now()
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sort int not null default 0
);

create table units (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  department_id uuid not null references departments on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sort int not null default 0
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  unit_id uuid not null references units on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sort int not null default 0
);

-- Volunteers. Crew sign in with name + PIN (identification, not security), later by text link.
create table people (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  name text not null check (length(name) between 1 and 120),
  phone text check (length(phone) <= 30),
  email text check (length(email) <= 254),
  pin_hash text,
  failed_pins int not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index on people (church_id);

create table unit_members (
  unit_id uuid not null references units on delete cascade,
  person_id uuid not null references people on delete cascade,
  primary key (unit_id, person_id)
);

-- Leaders are signed-in users. Scope: admin = whole church; dept_* = one department; unit_* = one unit.
create table leaders (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('admin','dept_head','dept_assistant','unit_head','unit_assistant')),
  department_id uuid references departments on delete cascade,
  unit_id uuid references units on delete cascade,
  check ((role = 'admin' and department_id is null and unit_id is null)
      or (role in ('dept_head','dept_assistant') and department_id is not null and unit_id is null)
      or (role in ('unit_head','unit_assistant') and unit_id is not null and department_id is null))
);
create unique index leaders_unique on leaders (church_id, user_id, role, coalesce(department_id, unit_id, church_id));

create table invites (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role text not null check (role in ('admin','dept_head','dept_assistant','unit_head','unit_assistant')),
  department_id uuid references departments on delete cascade,
  unit_id uuid references units on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

-- Church-wide services and events (rota, availability and check-in build on these in phase 2).
create table events (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  name text not null check (length(name) between 1 and 120),
  call_at timestamptz not null,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text
);

-- ---------- Permission helpers ----------
create or replace function is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leaders where church_id = cid and user_id = auth.uid());
$$;

create or replace function is_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from leaders where church_id = cid and user_id = auth.uid() and role = 'admin');
$$;

create or replace function can_manage_department(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from departments d join leaders l on l.church_id = d.church_id and l.user_id = auth.uid()
    where d.id = did and (l.role = 'admin' or (l.role in ('dept_head','dept_assistant') and l.department_id = did)));
$$;

create or replace function can_manage_unit(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from units u join leaders l on l.church_id = u.church_id and l.user_id = auth.uid()
    where u.id = uid and (l.role = 'admin'
      or (l.role in ('dept_head','dept_assistant') and l.department_id = u.department_id)
      or (l.role in ('unit_head','unit_assistant') and l.unit_id = uid)));
$$;

-- ---------- Row level security ----------
alter table churches enable row level security;
alter table departments enable row level security;
alter table units enable row level security;
alter table roles enable row level security;
alter table people enable row level security;
alter table unit_members enable row level security;
alter table leaders enable row level security;
alter table invites enable row level security;
alter table events enable row level security;

create policy read on churches for select to authenticated using (is_member(id));
create policy edit on churches for update to authenticated using (is_admin(id)) with check (is_admin(id));

create policy read on departments for select to authenticated using (is_member(church_id));
create policy write on departments for all to authenticated using (is_admin(church_id)) with check (is_admin(church_id));

create policy read on units for select to authenticated using (is_member(church_id));
create policy write on units for all to authenticated
  using (can_manage_department(department_id)) with check (can_manage_department(department_id));

create policy read on roles for select to authenticated using (is_member(church_id));
create policy write on roles for all to authenticated using (can_manage_unit(unit_id)) with check (can_manage_unit(unit_id));

create policy read on people for select to authenticated using (is_member(church_id));
create policy add on people for insert to authenticated with check (is_member(church_id));
create policy edit on people for update to authenticated using (is_member(church_id)) with check (is_member(church_id));
create policy remove on people for delete to authenticated using (is_admin(church_id));
revoke select, update on people from anon, authenticated;
grant select (id, church_id, name, phone, email, created_at) on people to authenticated;
grant update (name, phone, email) on people to authenticated;

create policy read on unit_members for select to authenticated
  using (exists (select 1 from units u where u.id = unit_id and is_member(u.church_id)));
create policy write on unit_members for all to authenticated using (can_manage_unit(unit_id)) with check (can_manage_unit(unit_id));

create policy read on leaders for select to authenticated using (is_member(church_id));
create policy write on leaders for all to authenticated using (is_admin(church_id)) with check (is_admin(church_id));

create policy admin_all on invites for all to authenticated using (is_admin(church_id)) with check (is_admin(church_id));

create policy read on events for select to authenticated using (is_member(church_id));
create policy write on events for all to authenticated using (is_admin(church_id)) with check (is_admin(church_id));

-- ---------- Sign-up and invites ----------
-- Creates a church, makes the caller its admin, and adds the chosen department templates.
create or replace function create_church(church_name text, church_slug text, templates text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; t text; did uuid; uid uuid; u record; r text; d_sort int := 0; u_sort int; r_sort int;
  tpl jsonb := '{
    "Media": {"Broadcast": ["Director","Camera 1","Camera 2","Graphics","Sound"], "Photography": ["Lead Photographer","Photographer"], "Social": ["Social Poster","Stories"]},
    "Worship": {"Vocals": ["Worship Leader","Vocalist 1","Vocalist 2"], "Band": ["Keys","Drums","Bass","Guitar"]},
    "Ushering": {"Doors": ["Door Steward 1","Door Steward 2"], "Seating": ["Usher 1","Usher 2"], "Offering": ["Offering Lead"]},
    "Children": {"Nursery": ["Nursery Lead","Nursery Helper"], "Kids Church": ["Kids Lead","Kids Helper 1","Kids Helper 2"]},
    "Hospitality": {"Welcome": ["Greeter 1","Greeter 2"], "Refreshments": ["Tea and Coffee 1","Tea and Coffee 2"]}
  }';
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into churches (name, slug) values (trim(church_name), lower(trim(church_slug))) returning id into cid;
  insert into leaders (church_id, user_id, role) values (cid, auth.uid(), 'admin');
  foreach t in array coalesce(templates, '{}') loop
    continue when not tpl ? t;
    d_sort := d_sort + 1;
    insert into departments (church_id, name, sort) values (cid, t, d_sort) returning id into did;
    u_sort := 0;
    for u in select key, value from jsonb_each(tpl -> t) loop
      u_sort := u_sort + 1;
      insert into units (church_id, department_id, name, sort) values (cid, did, u.key, u_sort) returning id into uid;
      r_sort := 0;
      for r in select jsonb_array_elements_text(u.value) loop
        r_sort := r_sort + 1;
        insert into roles (church_id, unit_id, name, sort) values (cid, uid, r, r_sort);
      end loop;
    end loop;
  end loop;
  return cid;
exception when unique_violation then
  raise exception 'That web address is taken. Try another.';
end $$;

-- Called after sign-in: turns any pending invites for the user's email into leader roles.
create or replace function claim_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; i invites; my_email text;
begin
  select lower(email) into my_email from auth.users where id = auth.uid();
  if my_email is null then return 0; end if;
  for i in select * from invites where lower(email) = my_email and accepted_at is null loop
    insert into leaders (church_id, user_id, role, department_id, unit_id)
      values (i.church_id, auth.uid(), i.role, i.department_id, i.unit_id) on conflict do nothing;
    update invites set accepted_at = now() where id = i.id;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Leaders list with names/emails (auth.users isn't readable directly).
create or replace function church_leaders(cid uuid)
returns table (id uuid, user_id uuid, email text, role text, department_id uuid, unit_id uuid)
language sql stable security definer set search_path = public as $$
  select l.id, l.user_id, u.email::text, l.role, l.department_id, l.unit_id
  from leaders l join auth.users u on u.id = l.user_id
  where l.church_id = cid and is_member(cid) order by l.role, u.email;
$$;

revoke all on function create_church(text, text, text[]), claim_invites(), church_leaders(uuid) from public, anon;
grant execute on function create_church(text, text, text[]), claim_invites(), church_leaders(uuid) to authenticated;
