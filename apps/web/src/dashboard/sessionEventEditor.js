/** session_events ↔ drawer form (atomic parts of a diary session). */

import { expensesForSessionEvent, linkedEventLabel } from "./sessionFinance.js";
import { findActivityForEvent, isSportSessionEvent, sportMetricsForEvent } from "./activityMetrics.js";

function trimTime(t) {
  if (!t) return "";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function numOrNull(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function diffMinutes(start, end) {
  const [h1, m1] = String(start).slice(0, 5).split(":").map(Number);
  const [h2, m2] = String(end).slice(0, 5).split(":").map(Number);
  const s = (h1 || 0) * 60 + (m1 || 0);
  const e = (h2 || 0) * 60 + (m2 || 0);
  return ((e - s + 24 * 60) % (24 * 60)) || 0;
}

export function mapSessionEventUi(row) {
  const instant = Boolean(row.is_instant) || row.kind === "wake" || row.kind === "substance";
  const start = trimTime(row.start_time);
  const end = trimTime(row.end_time);
  return {
    id: row.id,
    date: row.date,
    session_id: row.session_id,
    start,
    end: instant ? start : end,
    is_instant: instant,
    kind: row.kind || "other",
    category: row.category || "",
    title: row.title || "",
    sport_type: row.sport_type || "",
    calories_burned: row.calories_burned ?? "",
    distance_km: row.distance_km ?? "",
    pace: row.pace || "",
    notes: row.notes || "",
    activity_id: row.activity_id || "",
  };
}

export { findActivityForEvent } from "./activityMetrics.js";

export function sessionEventToForm(ev, finance = [], meals = [], activities = []) {
  const exp = expensesForSessionEvent(ev.id, finance)[0];
  const label = linkedEventLabel(ev, finance, meals) || ev.title || "";
  const base = mapSessionEventUi({ ...ev, title: label });
  const sport = sportMetricsForEvent(ev, activities);
  const cat = (ev.category || "").toLowerCase();
  const isSport = (ev.kind || "") === "sport" || cat.startsWith("sport_") ||
    cat === "walk" || cat === "walking" || ev.sport_type;
  return {
    ...base,
    title: label,
    sport_type: isSport ? sport.sport_type : base.sport_type,
    calories_burned: isSport ? sport.calories_burned : base.calories_burned,
    distance_km: isSport ? sport.distance_km : base.distance_km,
    pace: isSport ? sport.pace : base.pace,
    activity_id: ev.activity_id || sport.linkedActivity?.id || "",
    expense_amount: exp?.amount ?? "",
    expense_currency: exp?.currency || "VND",
    expense_account: exp?.account || "vcb_vnd",
    expense_category: exp?.category || "",
    expense_merchant: exp?.merchant || "",
    expense_notes: exp?.notes || "",
    expense_id: exp?.id || "",
  };
}

export function formToSessionEventPatch(form, sessionId) {
  const instant = Boolean(form.is_instant) || form.kind === "wake" || form.kind === "substance";
  const start = form.start;
  const end = instant ? start : form.end;
  return {
    date: form.date,
    session_id: sessionId,
    start_time: start,
    end_time: end,
    duration_min: instant ? 0 : diffMinutes(start, end),
    is_instant: instant,
    instant,
    kind: form.kind || "other",
    category: strOrNull(form.category),
    title: strOrNull(form.title),
    sport_type: form.kind === "sport" || (form.category || "").startsWith("sport_")
      ? strOrNull(form.sport_type)
      : null,
    calories_burned: form.kind === "sport" || (form.category || "").startsWith("sport_")
      ? numOrNull(form.calories_burned)
      : null,
    distance_km: form.kind === "sport" || (form.category || "").startsWith("sport_")
      ? numOrNull(form.distance_km)
      : null,
    pace: form.kind === "sport" || (form.category || "").startsWith("sport_")
      ? strOrNull(form.pace)
      : null,
    notes: strOrNull(form.notes),
    activity_id: form.kind === "sport" || (form.category || "").startsWith("sport_")
      ? strOrNull(form.activity_id)
      : null,
  };
}
