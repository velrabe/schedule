-- Planned cashflow + daily total balance snapshots (Insights plan/fact chart).

-- ---------------------------------------------------------------
-- finance_planned_items: recurring / one-off budget lines
-- ---------------------------------------------------------------
create table if not exists finance_planned_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  amount numeric(14,2) not null,
  currency text not null default 'RUB',
  txn_type text not null default 'expense', -- expense | income
  recurrence text not null default 'once', -- once | daily | monthly
  day_of_month integer, -- for monthly (1-31)
  start_date date not null,
  end_date date,
  category text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists finance_planned_active_idx on finance_planned_items (active, start_date);

-- ---------------------------------------------------------------
-- balance_snapshots: user-logged total wealth in RUB (all accounts)
-- ---------------------------------------------------------------
create table if not exists balance_snapshots (
  date date primary key references days(date) on delete cascade on update cascade,
  total_rub numeric(14,2) not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists balance_snapshot_ensure_day on balance_snapshots;
create trigger balance_snapshot_ensure_day before insert on balance_snapshots
  for each row execute procedure ensure_day_trigger();

-- FX reference (RUB per 1 unit of foreign currency)
create table if not exists fx_rates (
  currency text primary key,
  rub_per_unit numeric(14,8) not null,
  updated_at timestamptz not null default now()
);

insert into fx_rates (currency, rub_per_unit) values
  ('RUB', 1),
  ('VND', 10000.0 / 3692220.0),
  ('USD', 92)
on conflict (currency) do update set rub_per_unit = excluded.rub_per_unit;

-- Seed planned items (Vel, 2026-05)
insert into finance_planned_items (id, title, amount, currency, txn_type, recurrence, day_of_month, start_date, category, notes) values
  ('f1000001-0000-4000-8000-000000000001', 'аренда', 7500000, 'VND', 'expense', 'monthly', 3, '2026-05-01', 'rent', 'оплата аренды'),
  ('f1000002-0000-4000-8000-000000000002', 'ChatGPT', 23, 'USD', 'expense', 'monthly', 7, '2026-05-01', 'subscription', 'подписка'),
  ('f1000003-0000-4000-8000-000000000003', 'визаран', 15000, 'RUB', 'expense', 'once', null, '2026-05-28', 'visa', 'плановый расход'),
  ('f1000004-0000-4000-8000-000000000004', 'еда', 1500, 'RUB', 'expense', 'daily', null, '2026-04-20', 'food', 'плановый расход на день')
on conflict (id) do nothing;
