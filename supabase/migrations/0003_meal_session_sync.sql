-- Link meals ↔ food sessions (one meal row per food session).

alter table meals
  add column if not exists session_id uuid references sessions(id) on delete cascade;

create unique index if not exists meals_session_id_uq
  on meals (session_id)
  where session_id is not null;

create index if not exists meals_session_id_idx on meals (session_id);

-- Backfill: every food session gets a meal row for nutrition UI.
insert into meals (date, time, slot, name, session_id, source_log_id, notes)
select
  s.date,
  s.start_time,
  case
    when coalesce(s.project, s.notes, '') ~* '(breakfast|завтрак)' then 'breakfast'
    when coalesce(s.project, s.notes, '') ~* '(lunch|обед)' then 'lunch'
    when coalesce(s.project, s.notes, '') ~* '(dinner|ужин)' then 'dinner'
    when coalesce(s.project, s.notes, '') ~* '(snack|снек|перекус)' then 'snack'
    when extract(hour from s.start_time) >= 5 and extract(hour from s.start_time) < 11 then 'breakfast'
    when extract(hour from s.start_time) >= 11 and extract(hour from s.start_time) < 16 then 'lunch'
    when extract(hour from s.start_time) >= 17 and extract(hour from s.start_time) < 22 then 'dinner'
    else 'snack'
  end as slot,
  coalesce(nullif(trim(s.project), ''), nullif(trim(s.notes), ''), 'еда') as name,
  s.id,
  s.source_log_id,
  s.notes
from sessions s
where (s.type = 'food' or s.category = 'food')
  and not exists (
    select 1 from meals m where m.session_id = s.id
  );
