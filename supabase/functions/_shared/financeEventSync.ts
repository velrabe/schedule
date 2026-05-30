import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** Human-readable label shared between finance_transactions and session_events.title */
export function financeHumanLabel(txn: {
  notes?: string | null;
  merchant?: string | null;
}): string {
  const notes = (txn.notes || "").trim();
  if (notes) return notes;
  return (txn.merchant || "").trim();
}

/** After finance write: mirror label onto linked session_event. */
export async function syncFinanceToSessionEvent(
  db: SupabaseClient,
  txn: { session_event_id?: string | null; notes?: string | null; merchant?: string | null },
): Promise<void> {
  const eventId = txn.session_event_id;
  if (!eventId) return;
  const label = financeHumanLabel(txn);
  if (!label) return;
  const { error } = await db.from("session_events").update({ title: label }).eq("id", eventId);
  if (error) throw error;
}

export async function afterFinanceLinkedWrite(db: SupabaseClient, txnId: string): Promise<void> {
  const { afterFinanceWrite } = await import("./financeBalanceSync.ts");
  await afterFinanceWrite(db, txnId);
  const { data, error } = await db.from("finance_transactions").select("*").eq("id", txnId).single();
  if (error) throw error;
  if (data) await syncFinanceToSessionEvent(db, data);
}
