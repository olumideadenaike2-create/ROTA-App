-- Removes the old single-church (COPAK) app from this Supabase project.
-- PERMANENT: deletes all its volunteers, assignments, check-ins, availability and admin list.
-- Keeps: the landing page's waitlist table, and every login in Authentication → Users.
-- Run this first, then 001_foundation.sql.

begin;

-- Old storage policies for volunteer photos (delete the "photos" bucket itself in Storage → Buckets).
drop policy if exists "admin upload photos" on storage.objects;
drop policy if exists "admin delete photos" on storage.objects;

-- Waitlist kept; its read policy depended on the old admin check, so drop just that policy.
-- (You can still read sign-ups in Table Editor → waitlist.)
drop policy if exists admin_read on public.waitlist;

drop function if exists public.crew_list() cascade;
drop function if exists public.crew_set_pin(uuid, text) cascade;
drop function if exists public.crew_schedule(uuid, text) cascade;
drop function if exists public.crew_check_in(uuid, text, uuid) cascade;
drop function if exists public.crew_availability(uuid, text) cascade;
drop function if exists public.crew_set_availability(uuid, text, uuid, text) cascade;
drop function if exists public._crew_verify(uuid, text) cascade;
drop function if exists public.admin_reset_pin(uuid) cascade;
drop function if exists public.admin_copy_session(uuid, uuid) cascade;
drop function if exists public.venue_today() cascade;

drop table if exists public.check_ins cascade;
drop table if exists public.availability cascade;
drop table if exists public.assignments cascade;
drop table if exists public.roles cascade;
drop table if exists public.volunteers cascade;
drop table if exists public.pods cascade;
drop table if exists public.sessions cascade;
drop table if exists public.admins cascade;

drop function if exists public.is_admin() cascade;

commit;

select 'Old app removed. Now run 001_foundation.sql.' as next_step;
