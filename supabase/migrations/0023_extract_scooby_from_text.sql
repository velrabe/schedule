-- Scooby logged as plain text in session.project / session_events.title (e.g. «тупняк, скуби»).

insert into substances (date, time, name, amount, unit, source_log_id)
select distinct on (s.date, s.start_time)
  s.date,
  s.start_time,
  'scooby',
  1,
  'session',
  s.source_log_id
from sessions s
where lower(coalesce(s.project, '') || ' ' || coalesce(s.notes, '')) ~ '(scooby|скуби|scubi)'
  and not exists (
    select 1 from substances x
    where x.date = s.date and x.time = s.start_time and x.name = 'scooby'
  );

insert into substances (date, time, name, amount, unit, source_log_id)
select distinct on (e.date, e.start_time)
  e.date,
  e.start_time,
  'scooby',
  1,
  'session',
  e.source_log_id
from session_events e
where e.substance_id is null
  and lower(coalesce(e.title, '') || ' ' || coalesce(e.notes, '')) ~ '(scooby|скуби|scubi)'
  and not exists (
    select 1 from substances x
    where x.date = e.date and x.time = e.start_time and x.name = 'scooby'
  );

insert into session_events (
  date,
  start_time,
  end_time,
  duration_min,
  is_instant,
  kind,
  category,
  title,
  substance_id,
  session_id,
  source_log_id
)
select
  s.date,
  s.time,
  s.time,
  0,
  true,
  'substance',
  'scooby',
  'scooby',
  s.id,
  null,
  s.source_log_id
from substances s
where s.name = 'scooby'
  and not exists (
    select 1 from session_events e where e.substance_id = s.id
  );

update sessions
set project = nullif(
  trim(both ' ,' from regexp_replace(
    regexp_replace(coalesce(project, ''), '(?i),?\s*(scooby|скуби|scubi)\s*,?', ',', 'g'),
    '(,)\1+',
    '\1',
    'g'
  )),
  ''
)
where lower(coalesce(project, '') || ' ' || coalesce(notes, '')) ~ '(scooby|скуби|scubi)';

update session_events
set title = nullif(
  trim(both ' ,' from regexp_replace(
    regexp_replace(coalesce(title, ''), '(?i),?\s*(scooby|скуби|scubi)\s*,?', ',', 'g'),
    '(,)\1+',
    '\1',
    'g'
  )),
  ''
)
where substance_id is null
  and lower(coalesce(title, '') || ' ' || coalesce(notes, '')) ~ '(scooby|скуби|scubi)';
