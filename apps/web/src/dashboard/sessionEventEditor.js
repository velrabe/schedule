/** session_events ↔ drawer form (atomic parts of a diary session). */

import { expensesForSessionEvent, financeHumanLabel } from "./sessionFinance.js";

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

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function diffMinutes(start, end) {
  const s = timeToMin(start);
  const e = timeToMin(end);
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
  };
}

export function findActivityForEvent(ev, activities = []) {
  if (!ev?.date) return null;
  const t0 = trimTime(ev.start_time);
  const sport = (ev.sport_type || ev.kind || "").toLowerCase();
  const exact = activities.find(
    (a) => a.date === ev.date && trimTime(a.time) === t0,
  );
  if (exact) return exact;
  return (
    activities.find(
      (a) =>
        a.date === ev.date &&
        (a.type === sport || (sport && String(a.type || "").includes(sport))),
    ) || null
  );
}

export function sessionEventToForm(ev, finance = []) {
  const exp = expensesForSessionEvent(ev.id, finance)[0];
  const label = financeHumanLabel(exp) || ev.title || "";
  return {
    ...mapSessionEventUi({ ...ev, title: label }),
    title: label,
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
    sport_type: strOrNull(form.sport_type),
    calories_burned: numOrNull(form.calories_burned),
    distance_km: numOrNull(form.distance_km),
    pace: strOrNull(form.pace),
    notes: strOrNull(form.notes),
  };
}
