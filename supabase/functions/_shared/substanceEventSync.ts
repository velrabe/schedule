import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { padTime } from "./actions.ts";
import { normalizeSessionEventPayload, rollupSessionEnvelope } from "./sessionEvents.ts";
import { isModaSubstance, SUBSTANCE_MODA, SUBSTANCE_SCOOBY } from "./substanceNames.ts";

/** Tracked doses that must live in substances + parallel timeline (not inside a session bundle). */
const FACT_ROW_SUBSTANCES = new Set([
  SUBSTANCE_SCOOBY,
  SUBSTANCE_MODA,
  "modafinil",
  "alcohol",
  "weed",
]);

type SubstanceRow = {
  id: string;
  date: string;
  time: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
};

function substanceTitle(sub: SubstanceRow): string {
  const name = sub.name || "substance";
  const amt = sub.amount;
  const unit = sub.unit || "";
  if (amt != null && Number.isFinite(Number(amt))) {
    const n = Number(amt);
    if (n === 0 && isModaSubstance(name)) return "без мода";
    return unit ? `${name} ${n}${unit}` : `${name} ${n}`;
  }
  return name;
}

async function syncDayModafinilMg(
  db: SupabaseClient,
  date: string,
  excludeSubstanceId?: string,
): Promise<void> {
  const { data: rows, error } = await db
    .from("substances")
    .select("id, amount")
    .eq("date", date)
    .in("name", [SUBSTANCE_MODA, "modafinil"]);
  if (error) throw error;
  const total = (rows || [])
    .filter((r) => String(r.id) !== excludeSubstanceId)
    .reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const { error: upErr } = await db
    .from("days")
    .update({ modafinil_mg: Math.round(total), updated_at: new Date().toISOString() })
    .eq("date", date);
  if (upErr) throw upErr;
}

function resolveFactSubstanceName(category: string | null, title: string | null): string | null {
  const cat = (category || "").trim().toLowerCase();
  const tit = (title || "").trim().toLowerCase();
  if (cat === SUBSTANCE_SCOOBY || tit.includes("scooby") || tit.includes("скуби")) {
    return SUBSTANCE_SCOOBY;
  }
  if (isModaSubstance(cat) || isModaSubstance(tit) || tit.includes("мода")) return SUBSTANCE_MODA;
  if (FACT_ROW_SUBSTANCES.has(cat)) return cat === "modafinil" ? SUBSTANCE_MODA : cat;
  return null;
}

function defaultAmountUnit(name: string): { amount: number | null; unit: string | null } {
  if (name === SUBSTANCE_SCOOBY) return { amount: 1, unit: "session" };
  if (isModaSubstance(name)) return { amount: null, unit: "mg" };
  if (name === "alcohol" || name === "weed") return { amount: 1, unit: "session" };
  return { amount: null, unit: null };
}

/**
 * Agent sometimes logs scooby/moda as kind=substance inside a session bundle.
 * Promote to substances row + detach mirrored event (drawer kind=substance).
 */
export async function promoteBundledSubstanceEvent(
  db: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { data, error } = await db.from("session_events").select("*").eq("id", eventId).single();
  if (error || !data) return;

  const row = data as {
    id: string;
    date: string;
    start_time: string;
    kind: string;
    category: string | null;
    title: string | null;
    notes: string | null;
    substance_id: string | null;
    session_id: string | null;
    source_log_id?: string | null;
  };

  if (row.kind !== "substance" || row.substance_id) return;
  const name = resolveFactSubstanceName(row.category, row.title);
  if (!name) return;

  const { amount, unit } = defaultAmountUnit(name);
  const parentSessionId = row.session_id != null ? String(row.session_id) : null;

  const { data: sub, error: insErr } = await db
    .from("substances")
    .insert({
      date: row.date,
      time: padTime(row.start_time),
      name,
      amount,
      unit,
      notes: row.notes,
      source_log_id: row.source_log_id ?? null,
    })
    .select("*")
    .single();
  if (insErr) throw insErr;

  const substanceId = String(sub.id);
  const payload = normalizeSessionEventPayload({
    date: row.date,
    start_time: row.start_time,
    session_id: null,
    kind: "substance",
    category: name,
    title: substanceTitle(sub as SubstanceRow),
    notes: row.notes,
    substance_id: substanceId,
    instant: true,
  });

  const { error: upErr } = await db.from("session_events").update(payload).eq("id", eventId);
  if (upErr) throw upErr;

  if (parentSessionId) await rollupSessionEnvelope(db, parentSessionId);
  if (isModaSubstance(name)) await syncDayModafinilMg(db, row.date);
}

/** Mirror substances row → instant session_event (kind=substance) for diary linking. */
export async function afterSubstanceWrite(db: SupabaseClient, substanceId: string): Promise<void> {
  const { data: sub, error } = await db.from("substances").select("*").eq("id", substanceId).single();
  if (error) throw error;
  if (!sub) return;

  const row = sub as SubstanceRow;
  const at = padTime(row.time) ?? "12:00:00";
  const title = substanceTitle(row);
  const payload = normalizeSessionEventPayload({
    date: row.date,
    start_time: at,
    session_id: null,
    kind: "substance",
    category: row.name,
    title,
    notes: row.notes,
    substance_id: row.id,
    instant: true,
  });

  const { data: existing } = await db
    .from("session_events")
    .select("id")
    .eq("substance_id", substanceId)
    .maybeSingle();

  if (existing?.id) {
    const { error: upErr } = await db.from("session_events").update(payload).eq("id", existing.id);
    if (upErr) throw upErr;
  } else {
    const { error: insErr } = await db.from("session_events").insert(payload).select("id").single();
    if (insErr) throw insErr;
  }

  if (isModaSubstance(row.name)) await syncDayModafinilMg(db, row.date);
}

export async function beforeSubstanceDelete(db: SupabaseClient, substanceId: string): Promise<void> {
  const { data: ev } = await db
    .from("session_events")
    .select("id, date, session_id")
    .eq("substance_id", substanceId)
    .maybeSingle();
  if (ev?.id) {
    await db.from("session_events").delete().eq("id", ev.id);
    if (ev.session_id) {
      const { rollupSessionEnvelope } = await import("./sessionEvents.ts");
      await rollupSessionEnvelope(db, String(ev.session_id));
    }
  }
  const { data: sub } = await db.from("substances").select("date, name").eq("id", substanceId).maybeSingle();
  if (sub?.name && isModaSubstance(sub.name) && sub.date) {
    await syncDayModafinilMg(db, String(sub.date), substanceId);
  }
}
