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

export async function deleteSessionExpenses(db: SupabaseClient, sessionId: string): Promise<void> {
  const { data: rows, error } = await db
    .from("finance_transactions")
    .select("*")
    .eq("session_id", sessionId);
  if (error) throw error;
  const { reverseFinanceWrite } = await import("./financeBalanceSync.ts");
  for (const row of rows || []) {
    await reverseFinanceWrite(db, row as never);
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
