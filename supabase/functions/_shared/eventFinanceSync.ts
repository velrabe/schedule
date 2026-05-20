import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type EventFinanceRow = {
  id: string;
  date: string;
  end_date?: string | null;
  kind?: string | null;
  detail?: string | null;
  budget_amount?: number | null;
  budget_currency?: string | null;
  budget_account?: string | null;
  finance_planned_item_id?: string | null;
};

function budgetAmount(event: EventFinanceRow): number | null {
  const n = Number(event.budget_amount);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Keep finance_planned_items in sync with event budget (like session → expense). */
export async function syncEventFinance(
  db: SupabaseClient,
  event: EventFinanceRow,
): Promise<void> {
  const amount = budgetAmount(event);
  const plannedId = event.finance_planned_item_id;

  if (amount == null) {
    if (plannedId) {
      await db.from("finance_planned_items").update({ active: false }).eq("id", plannedId);
      await db.from("events").update({ finance_planned_item_id: null }).eq("id", event.id);
    }
    return;
  }

  const title = (event.detail || event.kind || "событие").trim();
  const payload = {
    title,
    amount,
    currency: (event.budget_currency || "RUB").toUpperCase(),
    txn_type: "expense",
    recurrence: "once",
    day_of_month: null,
    start_date: event.date,
    end_date: event.end_date || event.date,
    category: event.kind || "event",
    notes: `событие · ${event.date}${event.end_date && event.end_date !== event.date ? `–${event.end_date}` : ""}`,
    active: true,
    event_id: event.id,
  };

  if (plannedId) {
    const { error } = await db.from("finance_planned_items").update(payload).eq("id", plannedId);
    if (error) throw error;
    return;
  }

  const { data, error } = await db.from("finance_planned_items").insert(payload).select("id").single();
  if (error) throw error;
  if (data?.id) {
    const { error: linkErr } = await db
      .from("events")
      .update({ finance_planned_item_id: String(data.id) })
      .eq("id", event.id);
    if (linkErr) throw linkErr;
  }
}

export async function afterEventWrite(db: SupabaseClient, eventId: string): Promise<void> {
  const { data, error } = await db.from("events").select("*").eq("id", eventId).single();
  if (error) throw error;
  if (data) await syncEventFinance(db, data as EventFinanceRow);
}

export async function beforeEventDelete(db: SupabaseClient, eventId: string): Promise<void> {
  const { data } = await db.from("events").select("finance_planned_item_id").eq("id", eventId).maybeSingle();
  const pid = data?.finance_planned_item_id;
  if (pid) {
    await db.from("finance_planned_items").update({ active: false }).eq("id", String(pid));
  }
}
