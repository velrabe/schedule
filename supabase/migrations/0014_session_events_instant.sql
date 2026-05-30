-- Instant session_events (wake, substance): point-in-time, duration_min = 0.
-- Link substance rows to mirrored session_events for diary display.

alter table session_events
  add column if not exists is_instant boolean not null default false,
  add column if not exists substance_id uuid references substances(id) on delete set null;

create index if not exists session_events_substance_idx on session_events (substance_id)
  where substance_id is not null;

create unique index if not exists session_events_substance_id_uq
  on session_events (substance_id)
  where substance_id is not null;

-- Fix mistaken short durations on point-in-time kinds
update session_events
set is_instant = true,
    end_time = start_time,
    duration_min = 0
where kind in ('wake', 'substance')
  and (duration_min <= 5 or end_time = start_time);
