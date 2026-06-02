/**
 * Heuristic links between session_events, meals, finance, activities in one phase.
 * Fixes split "заказ еды" (expense) vs "завтрак" (meal) atoms in the same session drawer.
 */

import { mealHasMacroData } from "./mergeNutrition.js";
import { isSportSessionEvent } from "./activityMetrics.js";
import { parseAtomLinkFromNotes } from "./atomAttach.js";
import { substanceRowLabel } from "./calendarDayDetail.js";
import {
  expensesForSession,
  expensesForSessionEvent,
} from "./sessionFinance.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function timeToMin(t) {
  const [h, m] = trimTime(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function eventDurationMin(ev) {
  if (ev?.duration_min != null && Number.isFinite(Number(ev.duration_min))) {
    return Number(ev.duration_min);
  }
  const s = timeToMin(ev?.start_time || ev?.start);
  let e = timeToMin(ev?.end_time || ev?.end);
  if (e <= s) e += 24 * 60;
  return Math.max(0, e - s);
}

export function isFoodLikeEvent(ev) {
  if (!ev) return false;
  const k = (ev.kind || "").toLowerCase();
  const c = (ev.category || "").toLowerCase();
  return k === "food" || c === "food";
}

/** Short instant order / grab — not the meal phase atom. */
export function isFoodOrderLikeEvent(ev) {
  if (!ev) return false;
  const blob = `${ev.title || ""} ${ev.category || ""} ${ev.kind || ""}`.toLowerCase();
  if (/заказ|grab|delivery|order\b/.test(blob)) return true;
  const k = (ev.kind || "").toLowerCase();
  if (k === "chores" && /еда|food|обед|завтрак|grab|coffee|кофе/.test(blob)) return true;
  if (isFoodLikeEvent(ev) && (Boolean(ev.is_instant) || eventDurationMin(ev) <= 12)) {
    return true;
  }
  return false;
}

export function isMealPhaseFoodEvent(ev) {
  return isFoodLikeEvent(ev) && !isFoodOrderLikeEvent(ev);
}

function eventsShareMealPhase(a, b) {
  if (!a?.session_id || a.session_id !== b?.session_id) return false;
  const aStart = timeToMin(a.start_time || a.start);
  const bStart = timeToMin(b.start_time || b.start);
  return Math.abs(aStart - bStart) <= 180;
}

/**
 * @param {object} ev session_event
 * @param {{ meals?: object[], sessionEvents?: object[] }} ctx
 */
export function findMealForEvent(ev, ctx = {}) {
  const { meals = [], sessionEvents = [] } = ctx;
  if (!ev) return null;

  const byAtomNote = meals.find(
    (m) => m.date === ev.date && parseAtomLinkFromNotes(m.notes) === ev.id,
  );
  if (byAtomNote) return byAtomNote;

  if (isFoodOrderLikeEvent(ev) && !ev.meal_id) return null;

  if (ev.meal_id) {
    const byId = meals.find((m) => m.id === ev.meal_id);
    if (byId) return byId;
  }

  for (const e of sessionEvents) {
    if (e.id === ev.id || !e.meal_id || e.session_id !== ev.session_id) continue;
    if (eventsShareMealPhase(ev, e)) {
      const m = meals.find((x) => x.id === e.meal_id);
      if (m) return m;
    }
  }

  if (!isMealPhaseFoodEvent(ev) && !ev.meal_id) return null;

  const date = ev.date;
  if (!date) return null;
  const start = timeToMin(ev.start_time || ev.start);
  let end = timeToMin(ev.end_time || ev.end);
  if (end <= start) end = start + Math.max(eventDurationMin(ev), 30);

  const candidates = meals.filter((m) => {
    if (m.date !== date) return false;
    const mt = timeToMin(m.time);
    if (!mt) return Boolean(m.slot);
    return mt >= start - 45 && mt <= end + 45;
  });
  if (!candidates.length) return null;

  const withMacro = candidates.filter(mealHasMacroData);
  const pool = withMacro.length ? withMacro : candidates;
  if (pool.length === 1) return pool[0];

  pool.sort((a, b) => {
    const da = Math.abs(timeToMin(a.time) - start);
    const db = Math.abs(timeToMin(b.time) - start);
    return da - db;
  });
  return pool[0];
}

/**
 * Substances linked to this atom only — not all doses on the day.
 * explicit atom:note, substance_id on event, same instant time, or sibling in same session phase.
 */
export function findLinkedSubstancesForEvent(ev, ctx = {}) {
  const { substances = [], sessionEvents = [] } = ctx;
  if (!ev?.id) return [];
  const seen = new Set();
  const out = [];

  const add = (row) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };

  if (ev.substance_id) {
    add(substances.find((s) => s.id === ev.substance_id));
  }

  for (const s of substances) {
    if (s.date !== ev.date) continue;
    if (parseAtomLinkFromNotes(s.notes) === ev.id) add(s);
  }

  const startStr = trimTime(ev.start_time || ev.start);
  const endStr = trimTime(ev.end_time || ev.end);
  const start = timeToMin(ev.start_time || ev.start);
  let end = timeToMin(ev.end_time || ev.end);
  const instant =
    Boolean(ev.is_instant) ||
    ev.kind === "wake" ||
    ev.kind === "substance" ||
    (startStr && (!endStr || startStr === endStr));

  if (instant) {
    for (const s of substances) {
      if (s.date !== ev.date || !s.time) continue;
      if (trimTime(s.time) === startStr) add(s);
    }
  } else {
    if (end <= start) end = start + Math.max(eventDurationMin(ev), 5);
    const pad = 10;
    for (const s of substances) {
      if (s.date !== ev.date || !s.time) continue;
      const t = timeToMin(s.time);
      if (t >= start - pad && t <= end + pad) add(s);
    }
  }

  if (ev.session_id) {
    for (const e of sessionEvents) {
      if (
        e.date !== ev.date ||
        e.id === ev.id ||
        e.session_id !== ev.session_id ||
        !e.substance_id
      ) {
        continue;
      }
      add(substances.find((s) => s.id === e.substance_id));
    }
  }

  return out.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

export function substanceLinkLabel(sub) {
  return substanceRowLabel(sub);
}

function collectSessionExpenses(sessionId, finance, sessionEvents) {
  const out = [];
  const seen = new Set();
  for (const e of sessionEvents.filter((x) => x.session_id === sessionId)) {
    for (const txn of expensesForSessionEvent(e.id, finance)) {
      if (!txn?.id || seen.has(txn.id)) continue;
      seen.add(txn.id);
      out.push({
        txn,
        sourceEvent: e,
        atMin: timeToMin(txn.time || txn.created_at || e.start_time),
      });
    }
  }
  for (const txn of expensesForSession(sessionId, finance)) {
    if (!txn?.id || seen.has(txn.id)) continue;
    if (txn.session_event_id) continue;
    seen.add(txn.id);
    out.push({
      txn,
      sourceEvent: null,
      atMin: timeToMin(txn.time || txn.created_at),
    });
  }
  return out;
}

function isFoodTxn(txn) {
  const c = (txn?.category || "").toLowerCase();
  return c === "food" || c.includes("food");
}

function isSportTxn(txn) {
  const c = (txn?.category || "").toLowerCase();
  return c.includes("sport");
}

function pickNearestExpense(ev, candidates) {
  if (!candidates.length) return null;
  const evStart = timeToMin(ev.start_time || ev.start);
  let evEnd = timeToMin(ev.end_time || ev.end);
  if (evEnd <= evStart) evEnd = evStart + eventDurationMin(ev);

  const scored = candidates.map((c) => {
    const t = c.atMin ?? timeToMin(c.sourceEvent?.start_time);
    const inPhase = t >= evStart - 90 && t <= evEnd + 45;
    const dist = Math.min(Math.abs(t - evStart), Math.abs(t - evEnd));
    return { ...c, score: inPhase ? dist : dist + 500 };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.txn || null;
}

function expenseCandidatesForEvent(ev, all) {
  return all.filter((c) => {
    const ownerId = c.txn?.session_event_id;
    if (!ownerId) return true;
    return ownerId === ev.id;
  });
}

/**
 * Expense on this event, or sibling food/sport atom in the same session phase.
 * Never show a txn already pinned to another atom via session_event_id.
 */
export function findLinkedExpenseForEvent(ev, ctx = {}) {
  const { finance = [], sessionEvents = [] } = ctx;
  const direct = expensesForSessionEvent(ev.id, finance)[0];
  if (direct) return direct;

  const sessionId = ev.session_id;
  if (!sessionId) return null;

  const all = expenseCandidatesForEvent(ev, collectSessionExpenses(sessionId, finance, sessionEvents));
  if (!all.length) return null;

  if (isSportSessionEvent(ev)) {
    const sportPool = all.filter(
      (c) =>
        isSportTxn(c.txn) ||
        (c.sourceEvent && isSportSessionEvent(c.sourceEvent)),
    );
    return pickNearestExpense(ev, sportPool.length ? sportPool : all);
  }

  if (isFoodLikeEvent(ev) || isFoodOrderLikeEvent(ev)) {
    const foodPool = all.filter(
      (c) =>
        isFoodTxn(c.txn) ||
        isFoodLikeEvent(c.sourceEvent) ||
        isFoodOrderLikeEvent(c.sourceEvent),
    );
    const pool = foodPool.length ? foodPool : all;
    if (isMealPhaseFoodEvent(ev)) {
      return pickNearestExpense(ev, pool);
    }
    const onSelf = pool.find((c) => c.sourceEvent?.id === ev.id);
    if (onSelf) return onSelf.txn;
    const evStart = timeToMin(ev.start_time || ev.start);
    const near = pool
      .filter((c) => Math.abs((c.atMin ?? 0) - evStart) <= 45)
      .sort(
        (a, b) =>
          Math.abs((a.atMin ?? 0) - evStart) - Math.abs((b.atMin ?? 0) - evStart),
      );
    return near[0]?.txn || pool[0]?.txn || null;
  }

  return null;
}
