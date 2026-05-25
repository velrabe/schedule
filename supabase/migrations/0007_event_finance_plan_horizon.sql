-- Event ↔ planned finance sync; 6-month food horizon (визаран — в 0009, 26–27.05).

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
