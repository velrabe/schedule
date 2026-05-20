-- Internal transfers: from account → counter_account (two currencies supported).

alter table finance_transactions
  add column if not exists counter_account text,
  add column if not exists amount_counter numeric(14,2),
  add column if not exists transfer_group_id uuid;

create index if not exists finance_transfer_group_idx on finance_transactions (transfer_group_id);
create index if not exists finance_counter_account_idx on finance_transactions (counter_account);

comment on column finance_transactions.counter_account is 'Destination account slug for txn_type=transfer';
comment on column finance_transactions.amount_counter is 'Amount credited on counter_account (its currency)';
comment on column finance_transactions.transfer_group_id is 'Optional link for paired legs; single-row transfers leave null';

-- Vel: Сбер вклад → VCB, 10 000 RUB → 3 692 220 VND (2026-05-20)
do $$
begin
  if not exists (
    select 1 from finance_transactions where id = 'f0000001-0000-4000-8000-000000000001'
  ) then
    insert into finance_transactions (
      id, date, amount, currency, amount_counter,
      account, counter_account, category, txn_type, notes
    ) values (
      'f0000001-0000-4000-8000-000000000001',
      '2026-05-20',
      10000, 'RUB', 3692220,
      'savings_rub', 'vcb_vnd', 'transfer', 'transfer',
      'перевод: Сбер вклад → Bank VND'
    );
    update accounts set balance = balance - 10000, updated_at = now() where id = 'savings_rub';
    update accounts set balance = balance + 3692220, updated_at = now() where id = 'vcb_vnd';
  end if;
end $$;
