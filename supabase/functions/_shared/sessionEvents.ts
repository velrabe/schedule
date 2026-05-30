import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { padTime, diffMinutes, inferSessionType } from "./actions.ts";
import { syncMealFromFoodSession, isFoodSession, type SessionRow } from "./foodMealSync.ts";
import {
  deleteSessionExpenses,
  syncSessionExpense,
  type SessionExpenseInput,
} from "./sessionExpenseSync.ts";

export type SessionEventRow = {
  id: string;
  date: string;
  session_id: string | null;
  start_time: string;
  end_time: string;
  duration_min: number;
  kind: string;
  category: string | null;
  title: string | null;
  sport_type: string | null;
  distance_km: number | null;
  calories_burned: number | null;
  pace: string | null;
  meal_id: string | null;
  planned_amount: number | null;
  planned_currency: string | null;
  planned_account: string | null;
  notes: string | null;
};

function toMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minMaxTime(events: { start_time: string; end_time: string }[]): {
  start_time: string;
  end_time: string;
  duration_min: number;
} {
  let minS = 24 * 60;
  let maxE = 0;
  for (const e of events) {
    const s = toMin(padTime(e.start_time) ?? "00:00:00");
    let en = toMin(padTime(e.end_time) ?? "00:00:00");
    if (en <= s) en += 24 * 60;
    minS = Math.min(minS, s);
    maxE = Math.max(maxE, en);
  }
  const start_time = `${String(Math.floor(minS / 60) % 24).padStart(2, "0")}:${String(minS % 60).padStart(2, "0")}:00`;
  const endMin = maxE % (24 * 60);
  const end_time = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00`;
  return { start_time, end_time, duration_min: diffMinutes(start_time, end_time) };
}

export function normalizeSessionEventPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const date = String(raw.date);
  const start_time = padTime(raw.start_time ?? raw.start) ?? "00:00:00";
  const end_time = padTime(raw.end_time ?? raw.end) ?? start_time;
  let duration_min = Number(raw.duration_min ?? raw.min);
  if (!Number.isFinite(duration_min) || duration_min <= 0) {
    duration_min = diffMinutes(start_time, end_time);
  }
  const kind = raw.kind != null
    ? String(raw.kind)
    : raw.type != null
    ? String(raw.type)
    : "other";
  const category = raw.category != null ? String(raw.category) : null;
  return {
    date,
    session_id: raw.session_id != null ? String(raw.session_id) : null,
    start_time,
    end_time,
    duration_min: Math.round(duration_min),
    kind,
    category,
    title: raw.title != null ? String(raw.title) : raw.project != null ? String(raw.project) : null,
    sport_type: raw.sport_type != null ? String(raw.sport_type) : null,
    distance_km: raw.distance_km != null ? Number(raw.distance_km) : null,
    calories_burned: raw.calories_burned != null ? Number(raw.calories_burned) : null,
    pace: raw.pace != null ? String(raw.pace) : null,
    meal_id: raw.meal_id != null ? String(raw.meal_id) : null,
    planned_amount: raw.planned_amount != null ? Number(raw.planned_amount) : null,
    planned_currency: raw.planned_currency != null ? String(raw.planned_currency) : null,
    planned_account: raw.planned_account != null ? String(raw.planned_account) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
  };
}

/** Recompute parent session envelope from child events. */
export async function rollupSessionEnvelope(
  db: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { data: events, error } = await db
    .from("session_events")
    .select("start_time, end_time")
    .eq("session_id", sessionId);
  if (error) throw error;
  if (!events?.length) return;

  const { start_time, end_time, duration_min } = minMaxTime(events);
  const { error: upErr } = await db
    .from("sessions")
    .update({ start_time, end_time, duration_min })
    .eq("id", sessionId);
  if (upErr) throw upErr;
}

/** One finance row per session_event_id. */
export async function syncEventExpense(
  db: SupabaseClient,
  eventId: string,
  ctx: SessionEventRow,
  expense: SessionExpenseInput | null | undefined,
): Promise<void> {
  const { data: existing, error: findErr } = await db
    .from("finance_transactions")
    .select("*")
    .eq("session_event_id", eventId)
    .maybeSingle();
  if (findErr) throw findErr;

  const amountRaw = expense?.amount;
  const clear = expense === null || expense === undefined ||
    amountRaw == null || amountRaw === "" ||
    !Number.isFinite(Number(amountRaw)) || Number(amountRaw) <= 0;

  if (clear) {
    if (existing) {
      const { reverseFinanceWrite } = await import("./financeBalanceSync.ts");
      await reverseFinanceWrite(db, existing as never);
      await db.from("finance_transactions").delete().eq("id", existing.id);
    }
    return;
  }

  const amount = Number(expense?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const { afterFinanceWrite, replaceFinanceWrite } = await import("./financeBalanceSync.ts");
  const currency = (expense?.currency || "VND").toUpperCase();
  const account = expense?.account || (currency === "RUB" ? "savings_rub" : "cash_vnd");
  const payload = {
    date: ctx.date,
    time: padTime(ctx.start_time),
    amount,
    currency,
    account,
    category: expense?.category || ctx.category || ctx.kind,
    merchant: expense?.merchant || ctx.title,
    txn_type: "expense",
    session_id: ctx.session_id,
    session_event_id: eventId,
    notes: expense?.notes ?? ctx.notes,
  };

  if (existing) {
    const { data: updated, error: upErr } = await db
      .from("finance_transactions")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (upErr) throw upErr;
    await replaceFinanceWrite(db, existing as never, String(updated.id));
    return;
  }

  const { data: inserted, error: insErr } = await db
    .from("finance_transactions")
    .insert(payload)
    .select()
    .single();
  if (insErr) throw insErr;
  await afterFinanceWrite(db, String(inserted.id));
}

export async function ensureSessionEventMirror(
  db: SupabaseClient,
  sessionId: string,
  sourceLogId?: string | null,
): Promise<string | null> {
  const { data: existing } = await db
    .from("session_events")
    .select("id")
    .eq("session_id", sessionId)
    .limit(1);
  if (existing?.length) return String(existing[0].id);

  const { data: s, error } = await db.from("sessions").select("*").eq("id", sessionId).single();
  if (error || !s) return null;

  const { data: ev, error: insErr } = await db
    .from("session_events")
    .insert({
      date: s.date,
      session_id: sessionId,
      start_time: s.start_time,
      end_time: s.end_time,
      duration_min: s.duration_min,
      kind: s.type || "other",
      category: s.category,
      title: s.project || s.notes,
      notes: s.notes,
      source_log_id: sourceLogId ?? s.source_log_id,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;
  return ev ? String(ev.id) : null;
}

export async function afterSessionEventWrite(
  db: SupabaseClient,
  eventId: string,
  opts: { expense?: SessionExpenseInput; sourceLogId?: string | null } = {},
): Promise<void> {
  const { data, error } = await db.from("session_events").select("*").eq("id", eventId).single();
  if (error || !data) throw error ?? new Error("session_event_not_found");

  const row = data as SessionEventRow;
  if (row.session_id) await rollupSessionEnvelope(db, row.session_id);

  if (row.kind === "food" && row.session_id) {
    const { data: sess } = await db.from("sessions").select("*").eq("id", row.session_id).single();
    if (sess && isFoodSession(sess as SessionRow)) {
      await syncMealFromFoodSession(db, sess as SessionRow, opts.sourceLogId);
    }
  }

  if (opts.expense !== undefined) {
    await syncEventExpense(db, eventId, row, opts.expense);
  }
}

export async function deleteSessionEventTree(
  db: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { data: txn } = await db.from("finance_transactions").select("*").eq(
    "session_event_id",
    eventId,
  );
  const { reverseFinanceWrite } = await import("./financeBalanceSync.ts");
  for (const t of txn || []) {
    await reverseFinanceWrite(db, t as never);
  }
  await db.from("finance_transactions").delete().eq("session_event_id", eventId);
  await db.from("session_events").delete().eq("id", eventId);
}

/** Diary block + atomic events (agent: "болдеринг: такси, зал, такси"). */
export async function executeSessionBundle(
  db: SupabaseClient,
  data: Record<string, unknown>,
  sourceLogId: string | null,
): Promise<{ session_id: string; event_ids: string[] }> {
  const date = String(data.date);
  const eventsIn = Array.isArray(data.events) ? data.events as Record<string, unknown>[] : [];
  if (!eventsIn.length) throw new Error("session_bundle_requires_events");

  let start_time = padTime(data.start_time) ?? padTime(eventsIn[0]?.start_time) ?? "12:00:00";
  let end_time = padTime(data.end_time) ?? padTime(eventsIn[eventsIn.length - 1]?.end_time) ??
    start_time;
  if (eventsIn.length > 1) {
    const mm = minMaxTime(
      eventsIn.map((e) => ({
        start_time: String(padTime(e.start_time) ?? start_time),
        end_time: String(padTime(e.end_time) ?? end_time),
      })),
    );
    start_time = mm.start_time;
    end_time = mm.end_time;
  }

  const category = data.category != null ? String(data.category) : null;
  const type = data.type != null ? String(data.type) : inferSessionType(category);
  const project = data.title != null
    ? String(data.title)
    : data.project != null
    ? String(data.project)
    : null;

  const { data: session, error: sErr } = await db
    .from("sessions")
    .insert({
      date,
      start_time,
      end_time,
      duration_min: diffMinutes(start_time, end_time),
      type,
      category,
      project,
      notes: data.notes != null ? String(data.notes) : null,
      source_log_id: sourceLogId,
    })
    .select()
    .single();
  if (sErr) throw sErr;
  const sessionId = String(session.id);

  const eventIds: string[] = [];
  for (const raw of eventsIn) {
    const norm = normalizeSessionEventPayload({
      ...raw,
      date,
      session_id: sessionId,
    });
    const expense = raw.expense as SessionExpenseInput | undefined;
    const { data: ev, error: eErr } = await db
      .from("session_events")
      .insert({ ...norm, source_log_id: sourceLogId })
      .select()
      .single();
    if (eErr) throw eErr;
    const eid = String(ev.id);
    eventIds.push(eid);
    await afterSessionEventWrite(db, eid, { expense, sourceLogId });
  }

  await rollupSessionEnvelope(db, sessionId);
  if (isFoodSession(session as SessionRow)) {
    await syncMealFromFoodSession(db, session as SessionRow, sourceLogId);
  }

  return { session_id: sessionId, event_ids: eventIds };
}

export async function executeCreateSessionEvent(
  db: SupabaseClient,
  data: Record<string, unknown>,
  sourceLogId: string | null,
): Promise<Record<string, unknown>> {
  const norm = normalizeSessionEventPayload(data);
  const expense = data.expense as SessionExpenseInput | undefined;
  const { data: ev, error } = await db
    .from("session_events")
    .insert({ ...norm, source_log_id: sourceLogId })
    .select()
    .single();
  if (error) throw error;
  const id = String(ev.id);
  await afterSessionEventWrite(db, id, { expense, sourceLogId });
  return ev as Record<string, unknown>;
}

export async function afterSessionDelete(db: SupabaseClient, sessionId: string): Promise<void> {
  const { data: events } = await db.from("session_events").select("id").eq("session_id", sessionId);
  for (const e of events || []) {
    await deleteSessionEventTree(db, String(e.id));
  }
  await deleteSessionExpenses(db, sessionId);
  await db.from("meals").delete().eq("session_id", sessionId);
}
