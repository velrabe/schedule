-- schedule · initial schema
-- One-user app. All tables protected at the edge function layer (service role).
-- No row-level security needed; service role bypasses RLS by design.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------
-- raw_logs — inbox for every incoming message before it's parsed
-- ---------------------------------------------------------------
create table if not exists raw_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  source text not null default 'chat', -- chat | voice | image | manual
  raw_text text,
  raw_image_url text,
  parsed_json jsonb,
  reply_text text,
  status text not null default 'pending', -- pending | confirmed | rejected | saved | error
  status_reason text
);
create index if not exists raw_logs_occurred_at_idx on raw_logs (occurred_at desc);
create index if not exists raw_logs_status_idx on raw_logs (status);

-- ---------------------------------------------------------------
-- days — one row per calendar day
-- ---------------------------------------------------------------
create table if not exists days (
  date date primary key,
  wake_time time,
  sleep_time time,
  sleep_hours numeric(4,2),
  modafinil_mg integer not null default 0,
  mood integer check (mood between 1 and 10),
  energy integer check (energy between 1 and 10),
  focus integer check (focus between 1 and 10),
  weight_kg numeric(5,2),
  day_type text, -- work | mixed | sport | social | travel | recovery | burnout
  tags text[] not null default '{}',
  notes text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- sessions — any time block (work, sport, walk, chill, ...)
-- ---------------------------------------------------------------
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  start_time time not null,
  end_time time not null,
  duration_min integer not null,
  type text not null,         -- work | sport | walk | chill | sleep | chores | food | transport | social
  category text,              -- subtype, e.g. work_paid, portfolio, planning, sport_surf, ...
  project text,
  intensity integer check (intensity between 1 and 10),
  quality integer check (quality between 1 and 10),
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_date_idx on sessions (date);
create index if not exists sessions_type_idx on sessions (type);

-- ---------------------------------------------------------------
-- meals — food logs with optional macros and photo
-- ---------------------------------------------------------------
create table if not exists meals (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  time time,
  slot text, -- breakfast | lunch | dinner | snack
  name text not null,
  portion_grams numeric(7,1),
  kcal numeric(7,1),
  protein_g numeric(6,1),
  fat_g numeric(6,1),
  carbs_g numeric(6,1),
  confidence text, -- low | medium | high
  photo_url text,
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists meals_date_idx on meals (date);

-- ---------------------------------------------------------------
-- activities — denormalised aggregate per workout / sport (optional)
-- ---------------------------------------------------------------
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  time time,
  type text not null, -- surf, pickleball, muay_thai, gym, hike, run, bouldering...
  duration_min integer,
  calories_burned numeric(6,1),
  intensity integer check (intensity between 1 and 10),
  source text, -- manual | apple_health | strava | other
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists activities_date_idx on activities (date);

-- ---------------------------------------------------------------
-- substances — modafinil, caffeine, alcohol, weed, ...
-- ---------------------------------------------------------------
create table if not exists substances (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  time time,
  name text not null, -- modafinil | caffeine | alcohol | weed | nicotine | ...
  amount numeric(8,2),
  unit text, -- mg | cup | drink | shot | ...
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists substances_date_idx on substances (date);

-- ---------------------------------------------------------------
-- body_metrics — weight, sleep_hours snapshots, etc.
-- ---------------------------------------------------------------
create table if not exists body_metrics (
  id uuid primary key default gen_random_uuid(),
  date date not null references days(date) on delete cascade on update cascade,
  time time,
  metric text not null, -- weight_kg | resting_hr | hrv | bf_pct | ...
  value numeric(10,3) not null,
  unit text,
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists body_metrics_date_idx on body_metrics (date);

-- ---------------------------------------------------------------
-- finance_transactions
-- ---------------------------------------------------------------
create table if not exists finance_transactions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  time time,
  amount numeric(14,2) not null,
  currency text not null default 'VND',
  amount_usd numeric(14,4), -- optional snapshot at the time of entry
  account text, -- tinkoff | capital | cash | wise | ...
  category text, -- food | transport | rent | health | entertainment | ...
  merchant text,
  txn_type text not null default 'expense', -- expense | income | transfer
  notes text,
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists finance_date_idx on finance_transactions (date);
create index if not exists finance_category_idx on finance_transactions (category);

-- ---------------------------------------------------------------
-- events — rare/special events (hike, illness, conflict, ...)
-- ---------------------------------------------------------------
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null,
  detail text,
  severity text default 'info', -- info | warning | danger
  source_log_id uuid references raw_logs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_date_idx on events (date);

-- ---------------------------------------------------------------
-- open_sessions view — currently active work/sport sessions (no end_time set today)
-- ---------------------------------------------------------------
create or replace view open_sessions as
select s.*
from sessions s
where s.duration_min = 0 and s.end_time = s.start_time;

-- ---------------------------------------------------------------
-- helper: ensure days row exists when inserting children
-- ---------------------------------------------------------------
create or replace function ensure_day(_d date) returns void as $$
begin
  insert into days(date) values (_d) on conflict (date) do nothing;
end;
$$ language plpgsql;

-- triggers to auto-ensure days exist
create or replace function ensure_day_trigger() returns trigger as $$
begin
  perform ensure_day(NEW.date);
  return NEW;
end;
$$ language plpgsql;

drop trigger if exists sessions_ensure_day on sessions;
create trigger sessions_ensure_day before insert on sessions
  for each row execute procedure ensure_day_trigger();

drop trigger if exists meals_ensure_day on meals;
create trigger meals_ensure_day before insert on meals
  for each row execute procedure ensure_day_trigger();

drop trigger if exists activities_ensure_day on activities;
create trigger activities_ensure_day before insert on activities
  for each row execute procedure ensure_day_trigger();

drop trigger if exists substances_ensure_day on substances;
create trigger substances_ensure_day before insert on substances
  for each row execute procedure ensure_day_trigger();

drop trigger if exists body_metrics_ensure_day on body_metrics;
create trigger body_metrics_ensure_day before insert on body_metrics
  for each row execute procedure ensure_day_trigger();
