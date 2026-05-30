/** activities ↔ session_events sport metrics (client). */

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function timeToMin(t) {
  const [h, m] = trimTime(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function parseActivityNotes(notes) {
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

export function metricsFromActivity(act) {
  if (!act) return {};
  const parsed = parseActivityNotes(act.notes);
  const kcal = act.calories_burned != null ? Number(act.calories_burned) : parsed.calories_burned;
  return {
    calories_burned: Number.isFinite(kcal) ? kcal : null,
    distance_km: act.distance_km != null ? Number(act.distance_km) : parsed.distance_km,
    pace: (act.pace || parsed.pace || "").trim() || null,
    sport_type: act.type || null,
    duration_min: act.duration_min ?? null,
    source: act.source || null,
  };
}

function sportTypesMatch(evSport, actType) {
  const a = (actType || "").toLowerCase();
  const e = (evSport || "").toLowerCase();
  if (!a || !e) return false;
  if (a === e) return true;
  if (a.includes("cycl") && (e.includes("cycl") || e.includes("bike") || e.includes("sport"))) {
    return true;
  }
  if (a.includes("run") && e.includes("run")) return true;
  if (a.includes("walk") && e.includes("walk")) return true;
  if (e.includes("sport") && a.length > 0) return true;
  return false;
}

export function activityOverlapsEvent(ev, act) {
  const at = timeToMin(trimTime(act.time) || "00:00");
  let s = timeToMin(ev.start_time || ev.start);
  let e = timeToMin(ev.end_time || ev.end);
  if (e <= s) e += 24 * 60;
  let a = at;
  if (a < s - 12 * 60) a += 24 * 60;
  return a >= s - 15 && a <= e + 15;
}

export function findActivityForEvent(ev, activities = []) {
  if (!ev?.date) return null;
  if (ev.activity_id) {
    const byId = activities.find((a) => a.id === ev.activity_id);
    if (byId) return byId;
  }
  const sport = (ev.sport_type || ev.category || ev.kind || "").toLowerCase();
  const sameDay = activities.filter((a) => a.date === ev.date);
  const typed = sameDay.filter((a) => sportTypesMatch(sport, a.type));
  const pool = typed.length ? typed : sameDay;
  const overlapping = pool.filter((a) => activityOverlapsEvent(ev, a));
  if (overlapping.length) {
    overlapping.sort((a, b) => {
      const da = Math.abs(timeToMin(a.time) - timeToMin(ev.start_time || ev.start));
      const db = Math.abs(timeToMin(b.time) - timeToMin(ev.start_time || ev.start));
      return da - db;
    });
    return overlapping[0];
  }
  if (typed.length === 1) return typed[0];
  return null;
}

/** Merge session_event form fields with linked activity (device metrics win when empty on event). */
export function sportMetricsForEvent(ev, activities = []) {
  const linked = findActivityForEvent(ev, activities);
  if (!linked) {
    return {
      calories_burned: ev.calories_burned ?? "",
      distance_km: ev.distance_km ?? "",
      pace: ev.pace || "",
      sport_type: ev.sport_type || "",
      linkedActivity: null,
    };
  }
  const m = metricsFromActivity(linked);
  const device = ["apple_health", "strava", "health"].includes(
    String(m.source || "").toLowerCase(),
  );
  return {
    calories_burned: device
      ? (m.calories_burned ?? ev.calories_burned ?? "")
      : (ev.calories_burned ?? m.calories_burned ?? ""),
    distance_km: ev.distance_km ?? m.distance_km ?? "",
    pace: ev.pace || m.pace || "",
    sport_type: ev.sport_type || m.sport_type || "",
    linkedActivity: linked,
  };
}

export function activityLinkLabel(act) {
  const m = metricsFromActivity(act);
  const bits = [];
  if (m.calories_burned != null) bits.push(`${Math.round(m.calories_burned)} kcal`);
  if (m.distance_km != null) bits.push(`${m.distance_km} km`);
  if (m.pace) bits.push(m.pace);
  if (m.duration_min) bits.push(`${m.duration_min}m`);
  return bits.length ? bits.join(" · ") : act.type || "activity";
}
