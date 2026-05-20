-- 0002: nutrition targets + finance accounts + mood + planner enhancements

-- ---------------------------------------------------------------
-- days: add daily nutrition targets (override per-day if needed)
-- ---------------------------------------------------------------
alter table days
  add column if not exists kcal_target integer,
  add column if not exists carbs_target_g integer,
  add column if not exists protein_target_g integer,
  add column if not exists fat_target_g integer;

-- ---------------------------------------------------------------
-- nutrition_goals: long-term default targets (date-ranged).
-- ---------------------------------------------------------------
create table if not exists nutrition_goals (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null,
  kcal integer not null default 1800,
  carbs_g integer not null default 180,
  protein_g integer not null default 116,
  fat_g integer not null default 64,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists nutrition_goals_from_idx on nutrition_goals (effective_from desc);

-- Seed initial goal: 1800 / 180 / 116 / 64 starting from earliest tracked date.
insert into nutrition_goals (effective_from, kcal, carbs_g, protein_g, fat_g, notes)
values ('2026-04-20', 1800, 180, 116, 64, 'default per Vel 2026-05-20 conversation')
on conflict do nothing;

-- ---------------------------------------------------------------
-- accounts: 4 known financial accounts (RUB savings, IP, VCB VND, cash VND)
-- ---------------------------------------------------------------
create table if not exists accounts (
  id text primary key,            -- short slug, e.g. 'savings_rub'
  name text not null,             -- "Savings RUB (RUB)"
  currency text not null,
  balance numeric(14,2) not null default 0,
  notes text,
  archived boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into accounts (id, name, currency, balance, notes) values
  ('savings_rub', 'Savings RUB', 'RUB', 155000, 'основной рублёвый сберегательный'),
  ('ip_rub', 'Счёт ИП', 'RUB', 60000, 'предпринимательский счёт'),
  ('vcb_vnd', 'Bank VND', 'VND', 450000, 'основная карта в Вьетнаме'),
  ('cash_vnd', 'Наличные VND', 'VND', 200000, 'наличные на руках')
on conflict (id) do nothing;

-- ---------------------------------------------------------------
-- finance_transactions: link to a session (optional)
-- ---------------------------------------------------------------
alter table finance_transactions
  add column if not exists session_id uuid references sessions(id) on delete set null;

create index if not exists finance_session_idx on finance_transactions (session_id);

-- ---------------------------------------------------------------
-- planner_events: scheduled future / recurring items
-- ---------------------------------------------------------------
create table if not exists planner_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  end_date date,                  -- multi-day events
  time time,                      -- optional time-of-day
  title text not null,
  kind text,                      -- birthday | meeting | visa | errand | trip | other
  detail text,
  recurrence text,                -- yearly | weekly | monthly (simple, optional)
  reminder_minutes integer,       -- minutes before to notify (informational only for now)
  created_at timestamptz not null default now()
);
create index if not exists planner_events_date_idx on planner_events (date);

-- ---------------------------------------------------------------
-- mood_logs: iPhone-Health-style emotion + drivers
-- ---------------------------------------------------------------
create table if not exists mood_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  time time,
  emotion text not null,                  -- one canonical emotion slug
  emotion_label text,                     -- display label as-typed (RU/EN)
  valence integer check (valence between -3 and 3), -- -3 awful, +3 great
  tags text[] not null default '{}',      -- drivers: ["work", "sleep", "weather", "people"]
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mood_logs_date_idx on mood_logs (date);

drop trigger if exists mood_ensure_day on mood_logs;
create trigger mood_ensure_day before insert on mood_logs
  for each row execute procedure ensure_day_trigger();

-- ---------------------------------------------------------------
-- Existing data migrations:
--   1. portfolio → personal, planning → byt (sessions.category)
--   2. bank-proofs work_paid → byt
--   3. landing → ai_concierge (project rename)
-- ---------------------------------------------------------------
update sessions set category = 'personal' where category = 'portfolio';
update sessions set category = 'byt' where category = 'planning';
update sessions set category = 'byt' where project = 'bank-proofs' and category = 'work_paid';
update sessions set project = 'ai_concierge' where project = 'landing';

-- ---------------------------------------------------------------
-- Helper view: open_work_sessions limited to work-type
-- (already exists as open_sessions, no change)
-- ---------------------------------------------------------------

-- ---------------------------------------------------------------
-- Per-day nutrition summary (handy for calendar/dashboard).
-- ---------------------------------------------------------------
create or replace view daily_nutrition as
select
  d.date,
  coalesce(d.kcal_target, g.kcal) as kcal_target,
  coalesce(d.carbs_target_g, g.carbs_g) as carbs_target_g,
  coalesce(d.protein_target_g, g.protein_g) as protein_target_g,
  coalesce(d.fat_target_g, g.fat_g) as fat_target_g,
  coalesce(m.kcal_in, 0) as kcal_in,
  coalesce(m.protein_g_in, 0) as protein_g_in,
  coalesce(m.fat_g_in, 0) as fat_g_in,
  coalesce(m.carbs_g_in, 0) as carbs_g_in,
  coalesce(a.kcal_out, 0) as kcal_out,
  coalesce(a.minutes, 0) as activity_minutes
from days d
left join lateral (
  select kcal, carbs_g, protein_g, fat_g
  from nutrition_goals
  where effective_from <= d.date
  order by effective_from desc
  limit 1
) g on true
left join (
  select date,
    sum(kcal) as kcal_in,
    sum(protein_g) as protein_g_in,
    sum(fat_g) as fat_g_in,
    sum(carbs_g) as carbs_g_in
  from meals
  group by date
) m on m.date = d.date
left join (
  select date,
    sum(calories_burned) as kcal_out,
    sum(duration_min) as minutes
  from activities
  group by date
) a on a.date = d.date;
