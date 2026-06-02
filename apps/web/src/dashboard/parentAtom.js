/**
 * Single parent session_event (atom) per leaf: substance, meal, activity, finance.
 */

import { atomLinkNote, parseAtomLinkFromNotes } from "./atomAttach.js";
import { manualPatch } from "./manualSave.js";
import { mapSessionEventForDrawer, sessionEventDisplayLabel } from "./recordDisplay.js";
import { isSubstanceMirrorEvent } from "./drawerNavigation.js";

export { isSubstanceMirrorEvent };

/** @returns {string | null} session_event id */
export function getParentAtomId(kind, record, ctx = {}) {
  const { sessionEvents = [], finance = [] } = ctx;
  if (!record) return null;

  if (kind === "substance") {
    const note = parseAtomLinkFromNotes(record.notes);
    if (note) return note;
    const real = sessionEvents.find(
      (e) =>
        e.substance_id === record.id &&
        (e.kind || "").toLowerCase() !== "substance",
    );
    if (real) return real.id;
    const mirror = sessionEvents.find((e) => e.substance_id === record.id);
    return mirror?.id || null;
  }

  if (kind === "meal") {
    const note = parseAtomLinkFromNotes(record.notes);
    if (note) return note;
    return sessionEvents.find((e) => e.meal_id === record.id)?.id || null;
  }

  if (kind === "finance") {
    return record.session_event_id || null;
  }

  if (kind === "activity") {
    const note = parseAtomLinkFromNotes(record.notes);
    if (note) return note;
    return sessionEvents.find((e) => e.activity_id === record.id)?.id || null;
  }

  return null;
}

/** Atoms on this calendar day (no substance mirrors). */
export function dayAtomOptions(date, ctx = {}) {
  const {
    sessionEvents = [],
    finance = [],
    meals = [],
    substances = [],
  } = ctx;
  return sessionEvents
    .filter(
      (e) =>
        e.date === date &&
        (e.kind || "").toLowerCase() !== "substance",
    )
    .map((e) => ({
      id: e.id,
      label: sessionEventDisplayLabel(
        mapSessionEventForDrawer(e),
        finance,
        meals,
        sessionEvents,
        substances,
      ),
      event: e,
    }))
    .sort((a, b) =>
      String(a.event.start_time || "").localeCompare(String(b.event.start_time || "")),
    );
}

export function parentAtomLabel(eventId, ctx = {}) {
  if (!eventId) return "—";
  const ev = ctx.sessionEvents?.find((e) => e.id === eventId);
  if (!ev) return "—";
  const opt = dayAtomOptions(ev.date, ctx).find((o) => o.id === eventId);
  if (opt) return opt.label;
  return sessionEventDisplayLabel(
    mapSessionEventForDrawer(ev),
    ctx.finance || [],
    ctx.meals || [],
    ctx.sessionEvents || [],
    ctx.substances || [],
  );
}

async function clearSubstanceOwners(substanceId, sessionEvents) {
  for (const e of sessionEvents) {
    if (e.substance_id === substanceId) {
      await manualPatch("session_events", e.id, { substance_id: null });
    }
  }
}

export async function setSubstanceParentAtom(substanceId, eventId, ctx = {}) {
  const { sessionEvents = [] } = ctx;
  if (!eventId) throw new Error("выберите атом");
  await clearSubstanceOwners(substanceId, sessionEvents);
  await manualPatch("session_events", eventId, { substance_id: substanceId });
  await manualPatch("substances", substanceId, { notes: atomLinkNote(eventId) });
  const { notifyDataChanged } = await import("../api/manual");
  notifyDataChanged();
}

export async function setMealParentAtom(mealId, eventId, ctx = {}) {
  const { sessionEvents = [] } = ctx;
  if (!eventId) throw new Error("выберите атом");
  const ev = sessionEvents.find((e) => e.id === eventId);
  if (!ev) throw new Error("атом не найден");

  for (const e of sessionEvents) {
    if (e.meal_id === mealId && e.id !== eventId) {
      await manualPatch("session_events", e.id, { meal_id: null });
    }
  }
  await manualPatch("session_events", eventId, { meal_id: mealId });
  const patch = { notes: atomLinkNote(eventId) };
  if (ev.session_id) patch.session_id = ev.session_id;
  await manualPatch("meals", mealId, patch);
  const { notifyDataChanged } = await import("../api/manual");
  notifyDataChanged();
}

export async function setFinanceParentAtom(txnId, eventId, ctx = {}) {
  const { sessionEvents = [] } = ctx;
  if (!eventId) throw new Error("выберите атом");
  const ev = sessionEvents.find((e) => e.id === eventId);
  await manualPatch("finance_transactions", txnId, {
    session_event_id: eventId,
    session_id: ev?.session_id || null,
  });
  const { notifyDataChanged } = await import("../api/manual");
  notifyDataChanged();
}

export async function setActivityParentAtom(activityId, eventId, ctx = {}) {
  const { sessionEvents = [] } = ctx;
  if (!eventId) throw new Error("выберите атом");
  for (const e of sessionEvents) {
    if (e.activity_id === activityId && e.id !== eventId) {
      await manualPatch("session_events", e.id, { activity_id: null });
    }
  }
  await manualPatch("session_events", eventId, { activity_id: activityId });
  const { notifyDataChanged } = await import("../api/manual");
  notifyDataChanged();
}

export async function setLeafParentAtom(kind, record, eventId, ctx = {}) {
  switch (kind) {
    case "substance":
      return setSubstanceParentAtom(record.id, eventId, ctx);
    case "meal":
      return setMealParentAtom(record.id, eventId, ctx);
    case "finance":
      return setFinanceParentAtom(record.id, eventId, ctx);
    case "activity":
      return setActivityParentAtom(record.id, eventId, ctx);
    default:
      throw new Error("unsupported leaf kind");
  }
}
