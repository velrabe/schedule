import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** Display label for finance rows (lists/calendar) — NOT session_events.title. */
export function financeHumanLabel(txn: {
  notes?: string | null;
  merchant?: string | null;
}): string {
  const notes = (txn.notes || "").trim();
  if (notes) return notes;
  return (txn.merchant || "").trim();
}

/** Finance notes for DB — receipt/OCR detail only, never the diary event title. */
export function financeTxnNotes(expense: {
  notes?: string | null;
} | null | undefined): string | null {
  const notes = (expense?.notes || "").trim();
  return notes || null;
}

export async function afterFinanceLinkedWrite(db: SupabaseClient, txnId: string): Promise<void> {
  const { afterFinanceWrite } = await import("./financeBalanceSync.ts");
  await afterFinanceWrite(db, txnId);
}

/** @deprecated No-op — event title is owned by user text, not finance rows. */
export async function syncFinanceToSessionEvent(
  _db: SupabaseClient,
  _txn: { session_event_id?: string | null; notes?: string | null; merchant?: string | null },
): Promise<void> {}
