-- Phase 3a: swap requests, message queue + text credits. Run after 002_rota.sql.

-- ---------- Text credits ----------
alter table churches add column if not exists sms_credits int not null default 50 check (sms_credits >= 0);

-- Called only by the send-messages function (service role): takes one credit if any are left.
create or replace function use_sms_credit(cid uuid) returns boolean
language sql security definer set search_path = public as $$
  update churches set sms_credits = sms_credits - 1 where id = cid and sms_credits > 0 returning true;
$$;
revoke all on function use_sms_credit(uuid) from public, anon, authenticated;

-- ---------- Messages ----------
create table messages (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  person_id uuid references people on delete set null,
  event_id uuid references events on delete set null,
  body text not null,
  status text not null default 'queued' check (status in ('queued','sent','failed','skipped')),
  channel text check (channel in ('sms','email')),
  detail text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index on messages (church_id, status);
alter table messages enable row level security;
create policy read on messages for select to authenticated using (is_member(church_id));
-- Leaders can re-queue failed/skipped messages; everything else is done by the server.
revoke insert, update, delete on messages from anon, authenticated;
grant update (status) on messages to authenticated;
create policy retry on messages for update to authenticated
  using (is_member(church_id) and status in ('failed','skipped')) with check (status = 'queued');

-- ---------- Swaps ----------
create table swap_requests (
  id uuid primary key default gen_random_uuid(),
  church_id uuid not null references churches on delete cascade,
  assignment_id uuid not null references assignments on delete cascade,
  from_person uuid not null references people on delete cascade,
  to_person uuid not null references people on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index swap_one_pending on swap_requests (assignment_id) where status = 'pending';
alter table swap_requests enable row level security;
create policy read on swap_requests for select to authenticated using (is_member(church_id));
revoke insert, update, delete on swap_requests from anon, authenticated;

-- People a volunteer could ask: same unit, said yes (or no answer), not already on that service.
create or replace function crew_swap_options(pid uuid, pin text, aid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare err text; a assignments; uid uuid;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  select * into a from assignments where id = aid and published_person_id = pid;
  if a.id is null then return jsonb_build_object('error', 'That slot is no longer yours'); end if;
  select unit_id into uid from roles where id = a.role_id;
  return jsonb_build_object('options', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'availability', av.status) order by av.status nulls last, p.name)
    from unit_members m join people p on p.id = m.person_id
    left join availability av on av.person_id = p.id and av.event_id = a.event_id
    where m.unit_id = uid and p.id <> pid and coalesce(av.status, 'yes') <> 'no'
      and not exists (select 1 from assignments x where x.event_id = a.event_id and (x.published_person_id = p.id or x.person_id = p.id))), '[]'::jsonb));
end $$;

create or replace function crew_request_swap(pid uuid, pin text, aid uuid, to_pid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text; a assignments;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  select * into a from assignments where id = aid and published_person_id = pid;
  if a.id is null then return jsonb_build_object('error', 'That slot is no longer yours'); end if;
  if not exists (select 1 from people where id = to_pid and church_id = a.church_id) then return jsonb_build_object('error', 'Unknown person'); end if;
  update swap_requests set status = 'cancelled', decided_at = now() where assignment_id = aid and status = 'pending';
  insert into swap_requests (church_id, assignment_id, from_person, to_person) values (a.church_id, aid, pid, to_pid);
  return jsonb_build_object('ok', true);
end $$;

-- Unit head approves: the slot becomes a draft for the new person; it goes out on the next Publish.
create or replace function decide_swap(sid uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s swap_requests; a assignments;
begin
  select * into s from swap_requests where id = sid and status = 'pending';
  if s.id is null then raise exception 'This request has already been handled'; end if;
  select * into a from assignments where id = s.assignment_id;
  if not can_manage_role(a.role_id) then raise exception 'Not allowed'; end if;
  if approve then update assignments set person_id = s.to_person where id = a.id; end if;
  update swap_requests set status = case when approve then 'approved' else 'declined' end, decided_at = now() where id = sid;
end $$;

-- ---------- Publish now queues one message per affected person ----------
drop function if exists publish_rota(uuid);
create function publish_rota(eid uuid)
returns table (person_id uuid, change text)
language plpgsql security definer set search_path = public as $$
declare e events; c churches; r record; link text;
begin
  select * into e from events where id = eid;
  select * into c from churches where id = e.church_id;
  link := 'dashboard.teamrota.app/c/' || c.slug;
  create temp table _changed on commit drop as
    select a.id, a.role_id, a.person_id as new_p, a.published_person_id as old_p
    from assignments a where a.event_id = eid
      and a.person_id is distinct from a.published_person_id and can_manage_role(a.role_id);
  update assignments a set published_person_id = ch.new_p, published_at = now(),
    reply = case when ch.new_p is null then null else 'pending' end
  from _changed ch where a.id = ch.id;

  for r in
    select p.id, split_part(p.name, ' ', 1) as first,
      string_agg(ro.name, ' & ') filter (where ch.new_p = p.id) as got,
      bool_or(ch.old_p = p.id and ch.new_p is distinct from p.id) as lost
    from _changed ch join people p on p.id in (ch.new_p, ch.old_p) join roles ro on ro.id = ch.role_id
    group by p.id, p.name
  loop
    insert into messages (church_id, person_id, event_id, body) values (c.id, r.id, eid,
      case when r.got is not null then
        format('%s: Hi %s, you''re on %s for %s, %s, call %s. Reply: %s',
          c.name, r.first, r.got, e.name, to_char(e.call_at at time zone c.timezone, 'Dy DD Mon'),
          lower(to_char(e.call_at at time zone c.timezone, 'FMHH12:MIam')), link)
      else
        format('%s: Hi %s, rota change: you''re no longer needed for %s, %s. Details: %s',
          c.name, r.first, e.name, to_char(e.call_at at time zone c.timezone, 'Dy DD Mon'), link)
      end);
  end loop;

  return query
    select ch.new_p, 'assigned'::text from _changed ch where ch.new_p is not null
    union all
    select ch.old_p, 'removed'::text from _changed ch where ch.old_p is not null;
end $$;

revoke all on function publish_rota(uuid), decide_swap(uuid, boolean) from public, anon;
grant execute on function publish_rota(uuid), decide_swap(uuid, boolean) to authenticated;
grant execute on function crew_swap_options(uuid, text, uuid), crew_request_swap(uuid, text, uuid, uuid) to anon, authenticated;

-- crew_home: include each slot's pending swap
create or replace function crew_swaps(pid uuid, pin text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare err text;
begin
  err := _crew_verify(pid, pin);
  if err is not null then return jsonb_build_object('error', err); end if;
  return jsonb_build_object('swaps', coalesce((select jsonb_agg(jsonb_build_object('assignment_id', s.assignment_id, 'status', s.status, 'to', p.name))
    from swap_requests s join people p on p.id = s.to_person where s.from_person = pid and s.created_at > now() - interval '60 days'), '[]'::jsonb));
end $$;
grant execute on function crew_swaps(uuid, text) to anon, authenticated;

create or replace function refund_sms_credit(cid uuid) returns void
language sql security definer set search_path = public as $$ update churches set sms_credits = sms_credits + 1 where id = cid; $$;
revoke all on function refund_sms_credit(uuid) from public, anon, authenticated;
