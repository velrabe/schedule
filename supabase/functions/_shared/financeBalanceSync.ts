import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { convertAmount, multiCurrencyBalanceUsd } from "./financeFx.ts";

export type FinanceRow = {
  id: string;
  amount: number;
  currency: string;
  account: string | null;
  counter_account?: string | null;
  amount_counter?: number | null;
  txn_type: string;
};

export type AccountCurrencyMap = Record<string, string>;

async function loadAccountCurrencies(db: SupabaseClient): Promise<AccountCurrencyMap> {
  const { data, error } = await db.from("accounts").select("id, currency");
  if (error) throw error;
  const map: AccountCurrencyMap = {};
  for (const row of data || []) {
    map[String(row.id)] = String(row.currency || "").toUpperCase();
  }
  return map;
}

function currencyMatches(accountId: string | null, txnCurrency: string, accounts: AccountCurrencyMap): boolean {
  if (!accountId) return false;
  const ac = accounts[accountId];
  const tc = (txnCurrency || "").toUpperCase();
  if (!ac || !tc) return true;
  if (multiCurrencyBalanceUsd(accountId, tc, 1, ac) != null) return true;
  return ac === tc;
}

function balanceAmount(
  accountId: string,
  txnCurrency: string,
  amount: number,
  accounts: AccountCurrencyMap,
): number {
  const ac = accounts[accountId] || "";
  const mc = multiCurrencyBalanceUsd(accountId, txnCurrency, amount, ac);
  if (mc != null) return mc;
  return Math.abs(amount);
}

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

/**
 * Apply balance effect of a finance row (positive delta = money in).
 * brex: txn in VND → USD balance delta at ~26333 VND/USD.
 */
export function balanceDeltas(
  row: FinanceRow,
  accounts: AccountCurrencyMap = {},
): Array<{ account: string; delta: number }> {
  const amount = Math.abs(Number(row.amount) || 0);
  const counter = row.amount_counter != null ? Math.abs(Number(row.amount_counter)) : 0;
  const type = (row.txn_type || "expense").toLowerCase();
  const from = row.account;
  const to = row.counter_account;
  const cur = (row.currency || "").toUpperCase();

  if (type === "transfer" && from && to && counter > 0) {
    const out: Array<{ account: string; delta: number }> = [];
    if (currencyMatches(from, cur, accounts)) {
      out.push({ account: from, delta: -balanceAmount(from, cur, amount, accounts) });
    }
    const destCur = accounts[to] || cur;
    if (currencyMatches(to, destCur, accounts)) {
      out.push({ account: to, delta: balanceAmount(to, destCur, counter, accounts) });
    }
    return out;
  }
  // Transfer without an explicit amount_counter: a transfer never destroys money,
  // so always credit the destination too. Same currency → same amount; otherwise
  // convert via FX so the total balance stays value-preserving (the outflow used
  // to be counted while the inflow silently vanished).
  if (type === "transfer" && from && to) {
    const out: Array<{ account: string; delta: number }> = [];
    if (currencyMatches(from, cur, accounts)) {
      out.push({ account: from, delta: -balanceAmount(from, cur, amount, accounts) });
    }
    const destCur = (accounts[to] || cur).toUpperCase();
    const credit = destCur === cur ? amount : convertAmount(amount, cur, destCur);
    if (credit != null && credit > 0 && currencyMatches(to, destCur, accounts)) {
      out.push({ account: to, delta: balanceAmount(to, destCur, credit, accounts) });
    }
    if (out.length) return out;
  }
  if (type === "transfer" && from && currencyMatches(from, cur, accounts)) {
    return [{ account: from, delta: -balanceAmount(from, cur, amount, accounts) }];
  }
  if (type === "income" && from && currencyMatches(from, cur, accounts)) {
    return [{ account: from, delta: balanceAmount(from, cur, amount, accounts) }];
  }
  if (type === "expense" && from && currencyMatches(from, cur, accounts)) {
    return [{ account: from, delta: -balanceAmount(from, cur, amount, accounts) }];
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
  const accounts = await loadAccountCurrencies(db);
  await applyFinanceDeltas(db, balanceDeltas(data as FinanceRow, accounts));
}

export async function reverseFinanceWrite(db: SupabaseClient, row: FinanceRow): Promise<void> {
  const accounts = await loadAccountCurrencies(db);
  const rev = balanceDeltas(row, accounts).map((d) => ({ account: d.account, delta: -d.delta }));
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

/** Replay all finance rows onto account balances from known opening balances. */
export async function recomputeAllAccountBalances(
  db: SupabaseClient,
  opening: AccountCurrencyMap & Record<string, number>,
): Promise<Record<string, number>> {
  const { data: accounts, error: accErr } = await db.from("accounts").select("id, currency");
  if (accErr) throw accErr;
  const currencies: AccountCurrencyMap = {};
  const balances: Record<string, number> = {};
  for (const a of accounts || []) {
    const id = String(a.id);
    currencies[id] = String(a.currency || "").toUpperCase();
    balances[id] = Number(opening[id]) || 0;
  }

  const { data: txns, error: txErr } = await db
    .from("finance_transactions")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (txErr) throw txErr;

  for (const t of txns || []) {
    for (const { account, delta } of balanceDeltas(t as FinanceRow, currencies)) {
      balances[account] = (balances[account] || 0) + delta;
    }
  }
  return balances;
}
