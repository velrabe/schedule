/**
 * Factual sport minutes: activities + sport session_events (deduped).
 * Calendar insights «спорт» use sport hours from session_events only — see sportHoursFromEvents.
 */

import { findActivityForEvent, isSportSessionEvent } from "./activityMetrics.js";
import { eventDurationMin } from "./sessionEventLinks.js";

function isSportActivityType(type) {
  const t = (type || "").toLowerCase();
  return /walk|run|sport|gym|cycl|bike|swim|workout|hike|move/.test(t);
}

/**
 * @returns {number} minutes
 */
export function sportMinutesFactual(date, activities = [], sessionEvents = []) {
  if (!date) return 0;
  const seenActs = new Set();
  let minutes = 0;

  for (const ev of sessionEvents) {
    if (ev.date !== date || !isSportSessionEvent(ev)) continue;
    const act = findActivityForEvent(ev, activities);
    if (act?.id) {
      if (seenActs.has(act.id)) continue;
      seenActs.add(act.id);
      const dm = Number(act.duration_min);
      minutes += Number.isFinite(dm) && dm > 0 ? dm : eventDurationMin(ev);
      continue;
    }
    minutes += eventDurationMin(ev);
  }

  for (const a of activities) {
    if (a.date !== date || !isSportActivityType(a.type)) continue;
    if (seenActs.has(a.id)) continue;
    seenActs.add(a.id);
    const dm = Number(a.duration_min);
    if (Number.isFinite(dm) && dm > 0) minutes += dm;
  }

  return minutes;
}

export function sportHoursFactual(date, activities = [], sessionEvents = []) {
  return sportMinutesFactual(date, activities, sessionEvents) / 60;
}

/** Sport diary atoms only (no activities, no session envelope). */
export function sportEventMinutesOnly(date, sessionEvents = []) {
  let minutes = 0;
  for (const ev of sessionEvents) {
    if (ev.date !== date || !isSportSessionEvent(ev)) continue;
    minutes += eventDurationMin(ev);
  }
  return minutes;
}

export function sportHoursFromEvents(date, sessionEvents = []) {
  return sportEventMinutesOnly(date, sessionEvents) / 60;
}
