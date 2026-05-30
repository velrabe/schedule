/** kcal out: activities + sport session_events + sport sessions (deduped). */

import { isSportSessionEvent, sportMetricsForEvent } from "./activityMetrics.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

export function isSportSessionCategory(cat) {
  if (!cat) return false;
  const c = String(cat);
  return c.startsWith("sport_") || c === "walk" || c === "sport_walk";
}

/** Sport envelope for activity overlap when there is no session_event row yet. */
export function sessionToSportEv(session) {
  const start = trimTime(session.start_time || session.start);
  const end = trimTime(session.end_time || session.end);
  const cat = session.category || "";
  return {
    id: session.id,
    date: session.date,
    session_id: session.id,
    start_time: start,
    end_time: end,
    category: cat,
    kind: "sport",
    sport_type: cat.startsWith("sport_") ? cat.slice("sport_".length) : cat === "sport_walk" ? "walk" : null,
    calories_burned: null,
    activity_id: null,
  };
}

/**
 * @returns {{
 *   total: number,
 *   linkedActivityIds: Set<string>,
 *   sportEvents: object[],
 *   sportSessions: { session: object, kcal: number }[],
 *   fromEvents: number,
 *   fromOrphanActs: number,
 * }}
 */
export function kcalOutBreakdown(date, activities = [], sessionEvents = [], sessions = []) {
  const linkedActivityIds = new Set();
  let fromEvents = 0;
  const sportEvents = [];
  const coveredSessionIds = new Set();

  for (const ev of sessionEvents) {
    if (ev.date !== date || !isSportSessionEvent(ev)) continue;
    sportEvents.push(ev);
    if (ev.session_id) coveredSessionIds.add(ev.session_id);
    const m = sportMetricsForEvent(ev, activities);
    const k = Number(m.calories_burned);
    if (Number.isFinite(k) && k > 0) fromEvents += k;
    if (ev.activity_id) linkedActivityIds.add(ev.activity_id);
    else if (m.linkedActivity?.id) linkedActivityIds.add(m.linkedActivity.id);
  }

  const sportSessions = [];
  for (const s of sessions) {
    if (s.date !== date || !isSportSessionCategory(s.category)) continue;
    if (coveredSessionIds.has(s.id)) continue;
    const envelope = sessionToSportEv(s);
    const m = sportMetricsForEvent(envelope, activities);
    const k = Number(m.calories_burned);
    if (Number.isFinite(k) && k > 0) fromEvents += k;
    if (m.linkedActivity?.id) linkedActivityIds.add(m.linkedActivity.id);
    sportSessions.push({
      session: s,
      kcal: Number.isFinite(k) && k > 0 ? k : 0,
      label: s.category?.replace(/^sport_/, "") || s.category || "sport",
    });
  }

  let fromOrphanActs = 0;
  for (const a of activities) {
    if (a.date !== date) continue;
    if (linkedActivityIds.has(a.id)) continue;
    fromOrphanActs += Number(a.calories_burned) || 0;
  }

  return {
    total: fromEvents + fromOrphanActs,
    linkedActivityIds,
    sportEvents,
    sportSessions,
    fromEvents,
    fromOrphanActs,
  };
}

export function dayKcalOut(date, activities = [], sessionEvents = [], sessions = []) {
  return kcalOutBreakdown(date, activities, sessionEvents, sessions).total;
}
