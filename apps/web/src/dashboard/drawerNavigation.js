/** Canonical drawer stack: session → session_event → leaf (finance / meal / activity / substance). */

import { findFoodSessionForMeal } from "./mergeNutrition.js";
import { parseAtomLinkFromNotes } from "./atomAttach.js";
import { mapSessionEventForDrawer } from "./recordDisplay.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function timeToMin(t) {
  const [h, m] = trimTime(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isSubstanceMirrorEvent(ev) {
  return (ev?.kind || "").toLowerCase() === "substance" && Boolean(ev?.substance_id);
}

/** Real diary atom for a substance row (not the instant mirror). */
export function findParentEventForSubstance(sub, sessionEvents = []) {
  const noteId = parseAtomLinkFromNotes(sub?.notes);
  if (noteId) {
    const byNote = sessionEvents.find((e) => e.id === noteId);
    if (byNote) return byNote;
  }
  const linked = sessionEvents.filter((e) => e.substance_id === sub?.id);
  return (
    linked.find((e) => (e.kind || "").toLowerCase() !== "substance") ||
    linked[0] ||
    null
  );
}

export function findSessionCoveringSubstance(sub, sessions = []) {
  if (!sub?.date || !sub?.time) return null;
  const t = timeToMin(sub.time);
  for (const s of sessions) {
    if (s.date !== sub.date) continue;
    const start = timeToMin(s.start ?? s.start_time);
    let end = timeToMin(s.end ?? s.end_time);
    if (end <= start) end += 24 * 60;
    let tm = t;
    if (tm < start - 12 * 60) tm += 24 * 60;
    if (tm >= start - 5 && tm <= end + 5) return s;
  }
  return null;
}

export function mapSessionForDrawer(s) {
  if (!s) return null;
  return {
    ...s,
    start: s.start ?? trimTime(s.start_time),
    end: s.end ?? trimTime(s.end_time),
    note: s.note ?? s.notes ?? "",
  };
}

export function sessionBreadcrumbLabel(session) {
  const s = mapSessionForDrawer(session);
  if (!s) return "сессия";
  const title = (s.project || s.note || "").trim();
  const span = `${s.start || "?"}–${s.end || "?"}`;
  return title ? `${span} · ${title}` : `${span} · ${s.category || "—"}`;
}

function findFoodEventForMeal(meal, session, sessionEvents = []) {
  if (!meal) return null;
  if (meal.id) {
    const byMeal = sessionEvents.find((e) => e.meal_id === meal.id);
    if (byMeal) return byMeal;
  }
  const sid = meal.session_id || session?.id;
  if (!sid) return null;
  return (
    sessionEvents.find(
      (e) =>
        e.session_id === sid &&
        ((e.kind || "").toLowerCase() === "food" ||
          (e.category || "").toLowerCase() === "food"),
    ) || null
  );
}

/**
 * @param {{ kind: string, record: object }} target
 * @param {object} ctx sessions, sessionEvents, meals, …
 */
export function resolveCanonicalDrawerStack(target, ctx = {}) {
  if (!target?.record) return [];
  const { kind, record } = target;
  const {
    sessions = [],
    sessionEvents = [],
    meals = [],
  } = ctx;

  if (kind === "session") {
    return [{ kind: "session", record: mapSessionForDrawer(record) }];
  }

  let session = null;
  let event = null;

  if (kind === "session_event") {
    event = mapSessionEventForDrawer(record);
    session = sessions.find((s) => s.id === event.session_id) || null;
  } else if (kind === "finance") {
    event = record.session_event_id
      ? sessionEvents.find((e) => e.id === record.session_event_id) || null
      : null;
    session =
      sessions.find((s) => s.id === (event?.session_id || record.session_id)) ||
      null;
  } else if (kind === "meal") {
    session =
      (record.session_id && sessions.find((s) => s.id === record.session_id)) ||
      findFoodSessionForMeal(record, sessions) ||
      null;
    event = findFoodEventForMeal(record, session, sessionEvents);
  } else if (kind === "activity") {
    event = sessionEvents.find((e) => e.activity_id === record.id) || null;
    session = event
      ? sessions.find((s) => s.id === event.session_id) || null
      : null;
  } else if (kind === "substance") {
    event = findParentEventForSubstance(record, sessionEvents);
    if (event && isSubstanceMirrorEvent(event)) {
      const noteId = parseAtomLinkFromNotes(record.notes);
      event = noteId
        ? sessionEvents.find((e) => e.id === noteId) || null
        : null;
    }
    session =
      (event?.session_id && sessions.find((s) => s.id === event.session_id)) ||
      findSessionCoveringSubstance(record, sessions) ||
      null;
  } else {
    return [target];
  }

  const stack = [];
  if (session) {
    stack.push({ kind: "session", record: mapSessionForDrawer(session) });
  }
  if (event && !isSubstanceMirrorEvent(event)) {
    stack.push({ kind: "session_event", record: mapSessionEventForDrawer(event) });
  }
  if (kind !== "session" && kind !== "session_event") {
    stack.push({ kind, record });
  }
  return stack.length ? stack : [target];
}
