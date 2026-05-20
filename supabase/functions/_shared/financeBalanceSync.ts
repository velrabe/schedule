import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type FinanceRow = {
  id: string;
  amount: number;
  currency: string;
  account: string | null;
  counter_account?: string | null;
  amount_counter?: number | null;
  txn_type: string;
};

async function adjustAccount(
  db: SupabaseClient,
  accountId: string | null,
  delta: number,
): Promise<void> {
  if (!accountId || !delta) return;
  const { data: acc, error } = await db.from("accounts").select("balance").eq("id", accountId).single();
  if (error) throw error;
  const next = (Number(acc?.balance) || 0) + delta;
  const { error: upErr } = await db
    .from("accounts")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (upErr) throw upErr;
}

/** Apply balance effect of a finance row (positive delta = money in). */
export function balanceDeltas(row: FinanceRow): Array<{ account: string; delta: number }> {
  const amount = Number(row.amount) || 0;
  const counter = row.amount_counter != null ? Number(row.amount_counter) : 0;
  const type = (row.txn_type || "expense").toLowerCase();
  const from = row.account;
  const to = row.counter_account;

  if (type === "transfer" && from && to && counter > 0) {
    return [
      { account: from, delta: -amount },
      { account: to, delta: counter },
    ];
  }
  if (type === "transfer" && from) {
    return [{ account: from, delta: -amount }];
  }
  if (type === "income" && from) {
    return [{ account: from, delta: amount }];
  }
  if (type === "expense" && from) {
    return [{ account: from, delta: -amount }];
  }
  return [];
}

export async function applyFinanceDeltas(
  db: SupabaseClient,
  deltas: Array<{ account: string; delta: number }>,
): Promise<void> {
  for (const { account, delta } of deltas) {
    await adjustAccount(db, account, delta);
  }
}

export async function afterFinanceWrite(db: SupabaseClient, txnId: string): Promise<void> {
  const { data, error } = await db.from("finance_transactions").select("*").eq("id", txnId).single();
  if (error) throw error;
  await applyFinanceDeltas(db, balanceDeltas(data as FinanceRow));
}

export async function reverseFinanceWrite(db: SupabaseClient, row: FinanceRow): Promise<void> {
  const rev = balanceDeltas(row).map((d) => ({ account: d.account, delta: -d.delta }));
  await applyFinanceDeltas(db, rev);
}

export async function replaceFinanceWrite(
  db: SupabaseClient,
  oldRow: FinanceRow,
  newId: string,
): Promise<void> {
  await reverseFinanceWrite(db, oldRow);
  await afterFinanceWrite(db, newId);
}
