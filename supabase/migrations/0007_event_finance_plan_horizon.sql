-- Event ↔ planned finance sync; 6-month food horizon; vizaran on 30th.

-- Events: budget + span (like sessions with cost)
alter table events
  add column if not exists end_date date,
  add column if not exists budget_amount numeric(14,2),
  add column if not exists budget_currency text default 'RUB',
  add column if not exists budget_account text,
  add column if not exists finance_planned_item_id uuid references finance_planned_items(id) on delete set null;

create index if not exists events_planned_item_idx on events (finance_planned_item_id);

alter table finance_planned_items
  add column if not exists event_id uuid references events(id) on delete cascade;

create index if not exists finance_planned_event_idx on finance_planned_items (event_id);

-- Food: plan only ~6 months ahead (from 2026-04-20 → 2026-10-20)
update finance_planned_items
set end_date = '2026-10-20'
where id = 'f1000004-0000-4000-8000-000000000004';

-- Vizaran expense: monthly on the 30th
update finance_planned_items
set
  recurrence = 'monthly',
  day_of_month = 30,
  start_date = '2026-05-01',
  end_date = null
where id = 'f1000003-0000-4000-8000-000000000003';

-- Vizaran as an event (trip window) linked to the same planned line
insert into events (
  id,
  date,
  end_date,
  kind,
  detail,
  severity,
  budget_amount,
  budget_currency,
  budget_account,
  finance_planned_item_id
) values (
  'e1000001-0000-4000-8000-000000000001',
  '2026-05-30',
  '2026-06-02',
  'visa',
  'визаран',
  'warning',
  15000,
  'RUB',
  'savings_rub',
  'f1000003-0000-4000-8000-000000000003'
)
on conflict (id) do update set
  date = excluded.date,
  end_date = excluded.end_date,
  kind = excluded.kind,
  detail = excluded.detail,
  severity = excluded.severity,
  budget_amount = excluded.budget_amount,
  budget_currency = excluded.budget_currency,
  budget_account = excluded.budget_account,
  finance_planned_item_id = excluded.finance_planned_item_id;

update finance_planned_items
set event_id = 'e1000001-0000-4000-8000-000000000001'
where id = 'f1000003-0000-4000-8000-000000000003';
