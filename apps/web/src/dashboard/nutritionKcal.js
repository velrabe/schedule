/** kcal out: activities + sport session_events (deduped). */

import { isSportSessionEvent, sportMetricsForEvent } from "./activityMetrics.js";

/**
 * @returns {{ total: number, linkedActivityIds: Set<string>, sportEvents: object[] }}
 */
export function kcalOutBreakdown(date, activities = [], sessionEvents = []) {
  const linkedActivityIds = new Set();
  let fromEvents = 0;
  const sportEvents = [];

  for (const ev of sessionEvents) {
    if (ev.date !== date || !isSportSessionEvent(ev)) continue;
    sportEvents.push(ev);
    const m = sportMetricsForEvent(ev, activities);
    const k = Number(m.calories_burned);
    if (Number.isFinite(k) && k > 0) fromEvents += k;
    if (ev.activity_id) linkedActivityIds.add(ev.activity_id);
    else if (m.linkedActivity?.id) linkedActivityIds.add(m.linkedActivity.id);
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
    fromEvents,
    fromOrphanActs,
  };
}

export function dayKcalOut(date, activities = [], sessionEvents = []) {
  return kcalOutBreakdown(date, activities, sessionEvents).total;
}
