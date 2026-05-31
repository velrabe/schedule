-- Backfill: scooby/moda/etc. logged as session_events inside sessions → substances + detached event.

insert into substances (date, time, name, amount, unit, notes, source_log_id)
select
  e.date,
  e.start_time,
  case
    when lower(coalesce(e.category, '')) in ('scooby', 'скуби') then 'scooby'
    when lower(coalesce(e.category, '')) in ('moda', 'modafinil') then 'moda'
    when lower(coalesce(e.title, '')) like '%скуби%' or lower(coalesce(e.title, '')) like '%scooby%' then 'scooby'
    when lower(coalesce(e.category, '')) in ('alcohol', 'weed') then lower(e.category)
    else null
  end as name,
  case
    when lower(coalesce(e.category, '')) in ('scooby', 'скуби')
      or lower(coalesce(e.title, '')) like '%скуби%'
      or lower(coalesce(e.title, '')) like '%scooby%' then 1
    when lower(coalesce(e.category, '')) in ('alcohol', 'weed') then 1
    else null
  end as amount,
  case
    when lower(coalesce(e.category, '')) in ('scooby', 'скуби')
      or lower(coalesce(e.title, '')) like '%скуби%'
      or lower(coalesce(e.title, '')) like '%scooby%' then 'session'
    when lower(coalesce(e.category, '')) in ('moda', 'modafinil') then 'mg'
    when lower(coalesce(e.category, '')) in ('alcohol', 'weed') then 'session'
    else null
  end as unit,
  e.notes,
  e.source_log_id
from session_events e
where e.kind = 'substance'
  and e.substance_id is null
  and (
    lower(coalesce(e.category, '')) in ('scooby', 'скуби', 'moda', 'modafinil', 'alcohol', 'weed')
    or lower(coalesce(e.title, '')) like '%скуби%'
    or lower(coalesce(e.title, '')) like '%scooby%'
    or lower(coalesce(e.title, '')) like '%мода%'
  );

update session_events e
set
  substance_id = s.id,
  session_id = null,
  category = s.name,
  is_instant = true,
  duration_min = 0,
  end_time = e.start_time
from substances s
where e.kind = 'substance'
  and e.substance_id is null
  and s.date = e.date
  and s.time = e.start_time
  and (
    lower(coalesce(e.category, '')) in ('scooby', 'скуби', 'moda', 'modafinil', 'alcohol', 'weed')
    or lower(coalesce(e.title, '')) like '%скуби%'
    or lower(coalesce(e.title, '')) like '%scooby%'
  )
  and s.name = case
    when lower(coalesce(e.category, '')) in ('scooby', 'скуби') then 'scooby'
    when lower(coalesce(e.category, '')) in ('moda', 'modafinil') then 'moda'
    when lower(coalesce(e.title, '')) like '%скуби%' or lower(coalesce(e.title, '')) like '%scooby%' then 'scooby'
    else lower(coalesce(e.category, ''))
  end;
