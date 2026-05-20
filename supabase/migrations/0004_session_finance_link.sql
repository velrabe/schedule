-- One finance row per session (expense linked from session/meal drawer).

create unique index if not exists finance_session_id_uq
  on finance_transactions (session_id)
  where session_id is not null;
