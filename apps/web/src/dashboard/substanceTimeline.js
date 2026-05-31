/** Standalone substance doses (mirrored session_events with substance_id). */

import { linkedEventLabel } from "./sessionFinance.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

/** Instant substance events backed by a substances row — shown outside diary sessions. */
export function standaloneSubstanceEventsForDate(date, sessionEvents = []) {
  return sessionEvents
    .filter((e) => e.date === date && e.substance_id && !e.session_id)
    .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
}

export function substanceEventLabel(ev, finance = []) {
  return linkedEventLabel(ev, finance);
}

export function substanceEventOpenTarget(ev, substances = []) {
  const sid = ev.substance_id;
  if (sid) {
    const sub = substances.find((s) => s.id === sid);
    if (sub) return { kind: "substance", record: sub };
  }
  return { kind: "session_event", record: ev };
}

export function mergeTimelineItems(sessions, substanceEvents, sortFn) {
  const items = [
    ...sessions.map((s) => ({ type: "session", id: s.id, data: s, sort: sortFn(s) })),
    ...substanceEvents.map((e) => ({
      type: "substance_event",
      id: e.id,
      data: e,
      sort: sortFn({ start: trimTime(e.start_time), start_time: e.start_time }),
    })),
  ];
  return items.sort((a, b) => a.sort - b.sort);
}
