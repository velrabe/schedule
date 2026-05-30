-- Session = diary block (ежедневник). session_events = atomic parts (taxi, gym, snack).
-- Finance links to session_event_id (many txns per parent session).

create table if not exists session_events (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  session_id uuid references sessions(id) on delete cascade on update cascade,
  start_time time not null,
  end_time time not null,
  duration_min integer not null,
  kind text not null,
  category text,
  title text,
  sport_type text,
  distance_km numeric(10,3),
  calories_burned numeric(8,1),
  pace text,
  meal_id uuid references meals(id) on delete set null,
  planned_amount numeric(14,2),
  planned_currency text,
  planned_account text,
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists session_events_date_idx on session_events (date);
create index if not exists session_events_session_idx on session_events (session_id);

alter table finance_transactions
  add column if not exists session_event_id uuid references session_events(id) on delete set null;

create index if not exists finance_session_event_idx on finance_transactions (session_event_id);

drop index if exists finance_session_id_uq;

create unique index if not exists finance_session_event_id_uq
  on finance_transactions (session_event_id)
  where session_event_id is not null;

-- Backfill: one event per existing session (preserves finance links)
insert into session_events (
  id, date, session_id, start_time, end_time, duration_min,
  kind, category, title, notes, source_log_id
)
select
  gen_random_uuid(),
  s.date,
  s.id,
  s.start_time,
  s.end_time,
  s.duration_min,
  coalesce(s.type, 'other'),
  s.category,
  coalesce(nullif(trim(s.project), ''), nullif(trim(s.notes), ''), s.type),
  s.notes,
  s.source_log_id
from sessions s
where not exists (
  select 1 from session_events e where e.session_id = s.id
);

update finance_transactions f
set session_event_id = e.id
from session_events e
where f.session_id is not null
  and f.session_id = e.session_id
  and f.session_event_id is null
  and e.id = (
    select e2.id from session_events e2
    where e2.session_id = f.session_id
    order by e2.created_at
    limit 1
  );
