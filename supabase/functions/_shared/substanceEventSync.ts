import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { padTime } from "./actions.ts";
import { normalizeSessionEventPayload } from "./sessionEvents.ts";
import { isModaSubstance, SUBSTANCE_MODA } from "./substanceNames.ts";

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
