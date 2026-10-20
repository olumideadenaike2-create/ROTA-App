-- Run once in Supabase SQL Editor. Early-access sign-ups from the teamrota.app landing page.
-- Anyone can add themselves; only admins can read the list.
create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  church text check (length(church) <= 120),
  volunteers text check (length(volunteers) <= 20),
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_email_unique on waitlist (lower(email));
alter table waitlist enable row level security;
drop policy if exists waitlist_insert on waitlist;
create policy waitlist_insert on waitlist for insert to anon, authenticated with check (true);
drop policy if exists admin_read on waitlist;
create policy admin_read on waitlist for select to authenticated using (is_admin());
grant insert on waitlist to anon, authenticated;
