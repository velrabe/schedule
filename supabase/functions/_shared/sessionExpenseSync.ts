import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { padTime } from "./actions.ts";
import { isFoodSession } from "./foodMealSync.ts";

export type SessionExpenseInput = {
  amount?: number | null;
  currency?: string | null;
  account?: string | null;
  category?: string | null;
  merchant?: string | null;
  notes?: string | null;
};

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function inferExpenseCategory(session: {
  category?: string | null;
  type?: string | null;
}): string {
  const c = (session.category || "").toLowerCase();
  if (c === "food" || isFoodSession(session)) return "food";
  if (c === "transport") return "transport";
  if (/taxi|такси|доставк|delivery|grab|gojek/.test(c)) return "transport";
  return "other";
}

/** Reverse an expense: add amount back to account balance. */
async function applyBalanceDelta(
  db: SupabaseClient,
  accountId: string | null,
  amount: number,
  direction: "charge" | "refund",
): Promise<void> {
  if (!accountId || !amount) return;
  const { data: acc, error } = await db.from("accounts").select("balance").eq("id", accountId).single();
  if (error) throw error;
  const bal = Number(acc?.balance) || 0;
  const next = direction === "charge" ? bal - amount : bal + amount;
  const { error: upErr } = await db
    .from("accounts")
    .update({ balance: next, updated_at: new Date().toISOString() })
    .eq("id", accountId);
  if (upErr) throw upErr;
}

export async function deleteSessionExpenses(db: SupabaseClient, sessionId: string): Promise<void> {
  const { data: rows, error } = await db
    .from("finance_transactions")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  for (const row of rows || []) {
    if ((row.txn_type || "expense") === "expense" && row.account) {
      await applyBalanceDelta(db, String(row.account), Number(row.amount) || 0, "refund");
    }
  }
  const { error: delErr } = await db.from("finance_transactions").delete().eq("session_id", sessionId);
  if (delErr) throw delErr;
}

/** Upsert or remove the expense linked to a session (one txn per session_id). */
export async function syncSessionExpense(
  db: SupabaseClient,
  sessionId: string,
  ctx: {
    date: string;
    start_time?: string | null;
    category?: string | null;
    type?: string | null;
    project?: string | null;
    notes?: string | null;
  },
  expense: SessionExpenseInput | null | undefined,
): Promise<void> {
  const { data: existing, error: findErr } = await db
    .from("finance_transactions")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (findErr) throw findErr;

  const amount = num(expense?.amount);
  const shouldClear = expense === null || amount == null;

  if (shouldClear) {
    if (existing) {
      if ((existing.txn_type || "expense") === "expense" && existing.account) {
        await applyBalanceDelta(db, String(existing.account), Number(existing.amount) || 0, "refund");
      }
      const { error: delErr } = await db.from("finance_transactions").delete().eq("id", existing.id);
      if (delErr) throw delErr;
    }
    return;
  }

  const currency = (expense?.currency || "VND").toUpperCase();
  const account = expense?.account || (currency === "RUB" ? "savings_rub" : "cash_vnd");
  const category = expense?.category || inferExpenseCategory(ctx);
  const merchant = expense?.merchant || ctx.project || null;
  const time = padTime(ctx.start_time) ?? null;

  const payload = {
    date: ctx.date,
    time,
    amount,
    currency,
    account,
    category,
    merchant,
    txn_type: "expense",
    session_id: sessionId,
    notes: expense?.notes ?? ctx.notes ?? null,
  };

  if (existing) {
    if ((existing.txn_type || "expense") === "expense" && existing.account) {
      await applyBalanceDelta(db, String(existing.account), Number(existing.amount) || 0, "refund");
    }
    const { error: upErr } = await db.from("finance_transactions").update(payload).eq("id", existing.id);
    if (upErr) throw upErr;
    await applyBalanceDelta(db, account, amount, "charge");
    return;
  }

  const { error: insErr } = await db.from("finance_transactions").insert(payload);
  if (insErr) throw insErr;
  await applyBalanceDelta(db, account, amount, "charge");
}
