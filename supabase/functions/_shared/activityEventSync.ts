import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type ActivityRow = {
  id: string;
  date: string;
  time: string | null;
  type: string;
  duration_min: number | null;
  calories_burned: number | null;
  distance_km?: number | null;
  pace?: string | null;
  source: string | null;
  notes: string | null;
};

export type SessionEventSportRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  kind: string;
  category: string | null;
  sport_type: string | null;
  calories_burned: number | null;
  distance_km: number | null;
  pace: string | null;
  activity_id?: string | null;
};

function trimTime(t: string | null | undefined): string {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function timeToMin(t: string): number {
  const [h, m] = trimTime(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Parse Apple Health style notes into structured metrics. */
export function parseActivityNotes(notes: string | null | undefined): {
  distance_km: number | null;
  calories_burned: number | null;
  pace: string | null;
} {
  const s = String(notes || "");
  const km = s.match(/distance\s+([\d.]+)\s*km/i)?.[1];
  const kcal = s.match(/total\s+([\d.]+)\s*kcal/i)?.[1] ??
    s.match(/([\d.]+)\s*kcal/i)?.[1];
  const speed = s.match(/avg\s+speed\s+([\d.]+)\s*km\/h/i)?.[1] ??
    s.match(/([\d.]+)\s*km\/h/i)?.[1];
  return {
    distance_km: km != null && Number.isFinite(Number(km)) ? Number(km) : null,
    calories_burned: kcal != null && Number.isFinite(Number(kcal)) ? Number(kcal) : null,
    pace: speed != null ? `${speed} km/h` : null,
  };
}

export function metricsFromActivity(act: ActivityRow): {
  calories_burned: number | null;
  distance_km: number | null;
  pace: string | null;
  sport_type: string | null;
} {
  const parsed = parseActivityNotes(act.notes);
  const kcal = act.calories_burned != null ? Number(act.calories_burned) : parsed.calories_burned;
  return {
    calories_burned: Number.isFinite(kcal) ? kcal : null,
    distance_km: act.distance_km != null ? Number(act.distance_km) : parsed.distance_km,
    pace: (act.pace || parsed.pace || "").trim() || null,
    sport_type: act.type || null,
  };
}

function sportTypesMatch(evSport: string, actType: string): boolean {
  const a = (actType || "").toLowerCase();
  const e = (evSport || "").toLowerCase();
  if (!a || !e) return false;
  if (a === e) return true;
  if (a.includes("cycl") && (e.includes("cycl") || e.includes("bike") || e.includes("sport"))) {
    return true;
  }
  if (a.includes("run") && e.includes("run")) return true;
  if (a.includes("walk") && e.includes("walk")) return true;
  if (a.includes("boulder") && e.includes("boulder")) return true;
  if (e.includes("sport") && a.length > 0) return true;
  return false;
}

export function isSportSessionEvent(ev: {
  kind?: string | null;
  category?: string | null;
  sport_type?: string | null;
}): boolean {
  const kind = (ev.kind || "").toLowerCase();
  const cat = (ev.category || "").toLowerCase();
  if (kind === "sport") return true;
  if (cat.startsWith("sport_")) return true;
  if (cat === "walk" || cat === "walking") return true;
  if (ev.sport_type) return true;
  return false;
}

/** Activity timestamp falls inside session_event window (±15 min slack). */
export function activityOverlapsEvent(
  ev: { start_time: string; end_time: string },
  act: { time: string | null },
): boolean {
  const at = timeToMin(trimTime(act.time) || "00:00");
  let s = timeToMin(ev.start_time);
  let e = timeToMin(ev.end_time);
  if (e <= s) e += 24 * 60;
  let a = at;
  if (a < s - 12 * 60) a += 24 * 60;
  return a >= s - 15 && a <= e + 15;
}

export function findBestActivityForEvent(
  ev: SessionEventSportRow,
  activities: ActivityRow[],
): ActivityRow | null {
  if (ev.activity_id) {
    const linked = activities.find((a) => a.id === ev.activity_id);
    if (linked) return linked;
  }
  const sport = (ev.sport_type || ev.category || ev.kind || "").toLowerCase();
  const sameDay = activities.filter((a) => a.date === ev.date);
  const typed = sameDay.filter((a) => sportTypesMatch(sport, a.type));
  const pool = typed.length ? typed : sameDay;
  const overlapping = pool.filter((a) => activityOverlapsEvent(ev, a));
  if (overlapping.length === 1) return overlapping[0];
  if (overlapping.length > 1) {
    overlapping.sort((a, b) => {
      const da = Math.abs(timeToMin(a.time || "00:00") - timeToMin(ev.start_time));
      const db = Math.abs(timeToMin(b.time || "00:00") - timeToMin(ev.start_time));
      return da - db;
    });
    return overlapping[0];
  }
  if (typed.length === 1) return typed[0];
  return null;
}

function preferActivityMetrics(act: ActivityRow): boolean {
  const src = (act.source || "").toLowerCase();
  return src === "apple_health" || src === "strava" || src === "health";
}

export async function applyActivityMetricsToEvent(
  db: SupabaseClient,
  eventId: string,
  act: ActivityRow,
): Promise<void> {
  const m = metricsFromActivity(act);
  const { data: ev } = await db.from("session_events").select(
    "calories_burned, distance_km, pace, sport_type",
  ).eq("id", eventId).single();
  const patch: Record<string, unknown> = { activity_id: act.id };
  const device = preferActivityMetrics(act);
  if (m.calories_burned != null && (device || ev?.calories_burned == null)) {
    patch.calories_burned = m.calories_burned;
  }
  if (m.distance_km != null && (device || ev?.distance_km == null)) {
    patch.distance_km = m.distance_km;
  }
  if (m.pace && (device || !ev?.pace)) patch.pace = m.pace;
  if (m.sport_type && !ev?.sport_type) patch.sport_type = m.sport_type;
  const { error } = await db.from("session_events").update(patch).eq("id", eventId);
  if (error) throw error;
}

export async function enrichActivityFromNotes(
  db: SupabaseClient,
  activityId: string,
): Promise<void> {
  const { data: act, error } = await db.from("activities").select("*").eq("id", activityId).single();
  if (error || !act) return;
  const parsed = parseActivityNotes(act.notes);
  const patch: Record<string, unknown> = {};
  if (parsed.distance_km != null && act.distance_km == null) patch.distance_km = parsed.distance_km;
  if (parsed.pace && !act.pace) patch.pace = parsed.pace;
  if (Object.keys(patch).length) {
    await db.from("activities").update(patch).eq("id", activityId);
  }
}

export async function linkActivityToSportEvent(
  db: SupabaseClient,
  activityId: string,
): Promise<string | null> {
  await enrichActivityFromNotes(db, activityId);
  const { data: act, error } = await db.from("activities").select("*").eq("id", activityId).single();
  if (error || !act) return null;

  const { data: taken } = await db.from("session_events").select("id").eq("activity_id", activityId)
    .maybeSingle();
  if (taken?.id) {
    await applyActivityMetricsToEvent(db, String(taken.id), act as ActivityRow);
    return String(taken.id);
  }

  const { data: events, error: evErr } = await db
    .from("session_events")
    .select("*")
    .eq("date", act.date);
  if (evErr) throw evErr;

  const candidates = (events || []).filter((e) =>
    isSportSessionEvent(e as SessionEventSportRow) && !e.activity_id
  ) as SessionEventSportRow[];

  let best: SessionEventSportRow | null = null;
  for (const ev of candidates) {
    if (activityOverlapsEvent(ev, act as ActivityRow)) {
      if (!best) best = ev;
      else {
        const d0 = Math.abs(timeToMin(act.time || "00:00") - timeToMin(best.start_time));
        const d1 = Math.abs(timeToMin(act.time || "00:00") - timeToMin(ev.start_time));
        if (d1 < d0) best = ev;
      }
    }
  }
  if (!best && candidates.length === 1) best = candidates[0];

  if (!best) return null;
  await applyActivityMetricsToEvent(db, best.id, act as ActivityRow);
  return best.id;
}

export async function tryLinkActivityForEvent(
  db: SupabaseClient,
  eventId: string,
): Promise<void> {
  const { data: ev, error } = await db.from("session_events").select("*").eq("id", eventId).single();
  if (error || !ev || !isSportSessionEvent(ev)) return;

  if (ev.activity_id) {
    const { data: act } = await db.from("activities").select("*").eq("id", ev.activity_id).maybeSingle();
    if (act) await applyActivityMetricsToEvent(db, eventId, act as ActivityRow);
    return;
  }

  const { data: acts, error: aErr } = await db.from("activities").select("*").eq("date", ev.date);
  if (aErr) throw aErr;
  const match = findBestActivityForEvent(ev as SessionEventSportRow, (acts || []) as ActivityRow[]);
  if (match) await applyActivityMetricsToEvent(db, eventId, match);
}

export async function afterActivityWrite(db: SupabaseClient, activityId: string): Promise<void> {
  await linkActivityToSportEvent(db, activityId);
}

export async function afterSportSessionEventWrite(
  db: SupabaseClient,
  eventId: string,
): Promise<void> {
  await tryLinkActivityForEvent(db, eventId);
}
