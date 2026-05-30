import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import type { SessionEventRow } from "./sessionEvents.ts";

export type SessionExpenseInput = {
  amount?: number | null;
  currency?: string | null;
  account?: string | null;
  category?: string | null;
  merchant?: string | null;
  notes?: string | null;
};

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

/** Upsert or remove expense on the primary session_event (legacy UI passes expense per session). */
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
  const { ensureSessionEventMirror, syncEventExpense } = await import("./sessionEvents.ts");
  const eventId = await ensureSessionEventMirror(db, sessionId);
  if (!eventId) return;

  const { data: ev } = await db.from("session_events").select("*").eq("id", eventId).single();
  if (!ev) return;

  const row = ev as SessionEventRow;
  const patched: SessionEventRow = {
    ...row,
    category: ctx.category ?? row.category,
    title: ctx.project ?? row.title,
    notes: ctx.notes ?? row.notes,
    kind: ctx.type ?? row.kind,
  };
  await syncEventExpense(db, eventId, patched, expense);
}
