-- Link sport session_events ↔ activities (Apple Health / Strava metrics).

alter table activities
  add column if not exists distance_km numeric(10,3),
  add column if not exists pace text;

alter table session_events
  add column if not exists activity_id uuid references activities(id) on delete set null;

create index if not exists session_events_activity_idx on session_events (activity_id)
  where activity_id is not null;

create unique index if not exists session_events_activity_id_uq
  on session_events (activity_id)
  where activity_id is not null;
