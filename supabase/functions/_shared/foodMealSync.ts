import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { padTime, diffMinutes } from "./actions.ts";
import { trimTime } from "./sessionSchedule.ts";

export type SessionRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  type: string | null;
  category: string | null;
  project: string | null;
  notes: string | null;
};

export function isFoodSession(row: {
  type?: string | null;
  category?: string | null;
}): boolean {
  const t = (row.type || "").toLowerCase();
  const c = (row.category || "").toLowerCase();
  return t === "food" || c === "food";
}

/** Infer meal slot from session project/notes/time. */
export function inferMealSlot(session: {
  start_time?: string;
  start?: string;
  project?: string | null;
  notes?: string | null;
  note?: string | null;
}): string {
  const text = `${session.project || ""} ${session.notes || session.note || ""}`.toLowerCase();
  if (/breakfast|завтрак/.test(text)) return "breakfast";
  if (/lunch|обед/.test(text)) return "lunch";
  if (/dinner|ужин/.test(text)) return "dinner";
  if (/snack|снек|перекус/.test(text)) return "snack";

  const t = trimTime(session.start_time ?? session.start) || "12:00";
  const h = Number(t.split(":")[0]) || 12;
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

export function mealNameFromSession(session: {
  project?: string | null;
  notes?: string | null;
  note?: string | null;
}): string {
  const p = (session.project || "").trim();
  const n = (session.notes || session.note || "").trim();
  return p || n || "еда";
}

function sessionFromDb(row: Record<string, unknown>): SessionRow {
  return {
    id: String(row.id),
    date: String(row.date),
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    duration_min: Number(row.duration_min) || 0,
    type: row.type != null ? String(row.type) : null,
    category: row.category != null ? String(row.category) : null,
    project: row.project != null ? String(row.project) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

function orphanMealMatchesSession(
  meal: Record<string, unknown>,
  session: SessionRow,
): boolean {
  if (meal.session_id != null) return false;
  if (String(meal.date) !== session.date) return false;

  const slot = inferMealSlot(session);
  if (meal.slot != null && String(meal.slot) === slot) return true;

  const mn = `${meal.name || ""} ${meal.notes || ""}`.trim().toLowerCase();
  const sn = `${session.project || ""} ${session.notes || ""}`.trim().toLowerCase();
  if (mn && sn && (mn === sn || mn.includes(sn) || sn.includes(mn))) return true;

  const mt = trimTime(String(meal.time ?? ""));
  const st = trimTime(session.start_time);
  if (mt && st && mt === st) return true;

  return false;
}

/** Create or update meal linked to a food session. */
export async function syncMealFromFoodSession(
  db: SupabaseClient,
  session: SessionRow,
  sourceLogId?: string | null,
): Promise<Record<string, unknown>> {
  const { data: linkedRows, error: findErr } = await db
    .from("meals")
    .select("*")
    .eq("session_id", session.id)
    .order("created_at", { ascending: true });
  if (findErr) throw findErr;

  let existing = (linkedRows?.[0] as Record<string, unknown> | undefined) ?? null;
  if (linkedRows && linkedRows.length > 1) {
    const extraIds = linkedRows.slice(1).map((r) => String((r as Record<string, unknown>).id));
    await db.from("meals").delete().in("id", extraIds);
  }

  if (!existing) {
    const { data: orphans, error: orphanErr } = await db
      .from("meals")
      .select("*")
      .eq("date", session.date)
      .is("session_id", null);
    if (orphanErr) throw orphanErr;
    existing =
      (orphans || []).find((m) => orphanMealMatchesSession(m as Record<string, unknown>, session)) as
        | Record<string, unknown>
        | undefined ?? null;
  }

  const payload = {
    date: session.date,
    time: padTime(session.start_time),
    slot: inferMealSlot(session),
    name: mealNameFromSession(session),
    notes: session.notes,
    session_id: session.id,
    source_log_id: sourceLogId ?? existing?.source_log_id ?? null,
  };

  if (existing?.id) {
    const { data, error } = await db
      .from("meals")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  const { data, error } = await db
    .from("meals")
    .insert({ ...payload, session_id: session.id })
    .select()
    .single();
  if (error) throw error;
  return data as Record<string, unknown>;
}

/** Create food session for a meal (when meal logged without session). */
export async function syncFoodSessionFromMeal(
  db: SupabaseClient,
  meal: Record<string, unknown>,
  sourceLogId?: string | null,
): Promise<Record<string, unknown>> {
  const mealId = String(meal.id);
  const date = String(meal.date);
  const start = padTime(meal.time) ?? "12:00:00";
  const slot = meal.slot != null ? String(meal.slot) : inferMealSlot({ start_time: start });
  const name = String(meal.name || "еда");
  const duration = 30;

  const existingSid = meal.session_id != null ? String(meal.session_id) : null;
  if (existingSid) {
    const endMin = (Number(start.split(":")[0]) * 60 + Number(start.split(":")[1])) + duration;
    const endH = Math.floor((endMin % (24 * 60)) / 60);
    const endM = (endMin % (24 * 60)) % 60;
    const end_time = `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;

    const { data, error } = await db
      .from("sessions")
      .update({
        date,
        start_time: start,
        end_time,
        duration_min: duration,
        type: "food",
        category: "food",
        project: name,
        notes: meal.notes != null ? String(meal.notes) : null,
      })
      .eq("id", existingSid)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  const [sh, sm] = start.split(":").map(Number);
  const endMin = (sh * 60 + sm + duration) % (24 * 60);
  const end_time =
    `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}:00`;

  const { data, error } = await db
    .from("sessions")
    .insert({
      date,
      start_time: start,
      end_time,
      duration_min: duration,
      type: "food",
      category: "food",
      project: name,
      notes: meal.notes != null ? String(meal.notes) : null,
      source_log_id: sourceLogId ?? null,
    })
    .select()
    .single();
  if (error) throw error;

  const session = sessionFromDb(data as Record<string, unknown>);
  await db.from("meals").update({ session_id: session.id }).eq("id", mealId);
  return data as Record<string, unknown>;
}

export async function afterFoodSessionWrite(
  db: SupabaseClient,
  sessionId: string,
  sourceLogId?: string | null,
): Promise<void> {
  const { data, error } = await db.from("sessions").select("*").eq("id", sessionId).single();
  if (error) throw error;
  const session = sessionFromDb(data as Record<string, unknown>);
  const { ensureSessionEventMirror } = await import("./sessionEvents.ts");
  if (!isFoodSession(session)) {
    await ensureSessionEventMirror(db, sessionId, sourceLogId);
    return;
  }
  await syncMealFromFoodSession(db, session, sourceLogId);
  await ensureSessionEventMirror(db, sessionId, sourceLogId);
}

export async function afterMealWrite(
  db: SupabaseClient,
  mealId: string,
  sourceLogId?: string | null,
): Promise<void> {
  const { data, error } = await db.from("meals").select("*").eq("id", mealId).single();
  if (error) throw error;
  await syncFoodSessionFromMeal(db, data as Record<string, unknown>, sourceLogId);
}

export async function afterFoodSessionDelete(db: SupabaseClient, sessionId: string): Promise<void> {
  const { afterSessionDelete } = await import("./sessionEvents.ts");
  await afterSessionDelete(db, sessionId);
}

/** Batch sync after session schedule executor finishes. */
export async function syncMealsForSessions(
  db: SupabaseClient,
  sessions: SessionRow[],
  sourceLogId?: string | null,
): Promise<void> {
  for (const s of sessions) {
    if (isFoodSession(s)) await syncMealFromFoodSession(db, s, sourceLogId);
  }
}
