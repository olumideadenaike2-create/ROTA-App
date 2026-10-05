-- COPAK 2026 seed data. Times are Europe/London — change the zone below if the venue is elsewhere.
-- Note: UK clocks go back at 02:00 on Sun 25 Oct 2026; 'Europe/London' handles that.
insert into sessions (code, name, day, crew_call, doors, start_time, end_time, starts_at, ends_at, notes) values
('Rig','Rig & Setup','2026-10-23','09:00',null,null,'13:30',
  timestamp '2026-10-23 09:00' at time zone 'Europe/London', timestamp '2026-10-23 13:30' at time zone 'Europe/London','Systems green by 1:30pm'),
('S1','Session 1','2026-10-23','14:00','16:30','17:00','22:00',
  timestamp '2026-10-23 14:00' at time zone 'Europe/London', timestamp '2026-10-23 22:00' at time zone 'Europe/London',null),
('S2','Session 2','2026-10-24','06:30','08:30','09:00','14:00',
  timestamp '2026-10-24 06:30' at time zone 'Europe/London', timestamp '2026-10-24 14:00' at time zone 'Europe/London',null),
('S3','Session 3','2026-10-24','15:30','16:30','17:00','22:00',
  timestamp '2026-10-24 15:30' at time zone 'Europe/London', timestamp '2026-10-24 22:00' at time zone 'Europe/London',null),
('S4','Session 4','2026-10-25','13:00','15:30','16:00','21:00',
  timestamp '2026-10-25 13:00' at time zone 'Europe/London', timestamp '2026-10-25 21:00' at time zone 'Europe/London',null);

with p as (
  insert into pods (name, sort_order) values
    ('Live Production',1),('Photography',2),('Roving Content',3),('Social & Comms',4)
  returning id, name
)
insert into roles (pod_id, section, name, sort_order)
select p.id, r.section, r.name, r.ord from p join (values
  ('Live Production','Broadcast','Director / Vision Mixer',1),
  ('Live Production','Broadcast','Camera 1',2),
  ('Live Production','Broadcast','Camera 2',3),
  ('Live Production','Broadcast','Camera 3',4),
  ('Live Production','Broadcast','Camera 4',5),
  ('Live Production','Broadcast','Graphics',6),
  ('Live Production','Broadcast','Stream Engineer',7),
  ('Live Production','Broadcast','Broadcast Audio',8),
  ('Live Production','Broadcast','Floor Manager',9),
  ('Live Production','Record & Media','ISO Record Operator',10),
  ('Live Production','Record & Media','Media Manager (offload + verify)',11),
  ('Live Production','Record & Media','Backup Runner',12),
  ('Live Production','After Show','Producer',13),
  ('Live Production','After Show','Host 1',14),
  ('Live Production','After Show','Host 2',15),
  ('Live Production','After Show','Camera',16),
  ('Live Production','After Show','Audio',17),
  ('Photography',null,'Lead Photographer',1),
  ('Photography',null,'Photographer 2',2),
  ('Photography',null,'Photographer 3',3),
  ('Roving Content',null,'BTS Videographer',1),
  ('Roving Content',null,'Testimony / Interview',2),
  ('Roving Content',null,'Reels Shooter',3),
  ('Social & Comms',null,'Social Poster',1),
  ('Social & Comms',null,'Story & Community',2)
) as r(pod, section, name, ord) on r.pod = p.name;

-- Pre-create an empty slot for every role in every session so the Assign screen shows "Unassigned".
insert into assignments (session_id, role_id)
select s.id, r.id from sessions s cross join roles r on conflict do nothing;
