/** Helpers for session-linked expenses in the UI. */

import { findFoodSessionForMeal } from "./mergeNutrition.js";
import {
  findMealForEvent,
  isFoodLikeEvent,
  isFoodOrderLikeEvent,
  isMealPhaseFoodEvent,
} from "./sessionEventLinks.js";
import { substanceRowLabel } from "./substanceSession.js";

function isFoodAtom(event) {
  if (!event) return false;
  return Boolean(
    event.meal_id ||
      isFoodLikeEvent(event) ||
      isFoodOrderLikeEvent(event) ||
      isMealPhaseFoodEvent(event),
  );
}

export function expensesForSession(sessionId, finance = []) {
  if (!sessionId) return [];
  return finance.filter(
    (t) => t.session_id === sessionId && (t.txn_type || "expense") === "expense",
  );
}

export function expensesForSessionEvent(eventId, finance = []) {
  if (!eventId) return [];
  return finance.filter(
    (t) => t.session_event_id === eventId && (t.txn_type || "expense") === "expense",
  );
}

function toClockMin(t) {
  const [h, m] = String(t || "00:00").slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fromClockMin(m) {
  const x = ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
}

/** Session envelope crosses midnight on the clock. */
export function sessionCrossesMidnight(sessionStart, sessionEnd) {
  if (!sessionStart || !sessionEnd) return false;
  return toClockMin(sessionEnd) <= toClockMin(sessionStart);
}

/** Events contain both late evening and early-morning times. */
export function eventsSpanMidnight(events) {
  if (!events?.length) return false;
  const mins = events.map((e) => toClockMin(e.start_time));
  const hasEarly = mins.some((m) => m < 6 * 60);
  const hasLate = mins.some((m) => m >= 18 * 60);
  return hasEarly && hasLate;
}

/**
 * Anchor for chrono ordering inside a session.
 * When the envelope is broken (e.g. 02:00–02:00) but events span evening→night,
 * infer anchor from the earliest evening event instead of post-midnight clock time.
 */
export function resolveSessionAnchor(sessionStart, sessionEnd, events = []) {
  if (!events.length) return sessionStart ? String(sessionStart).slice(0, 5) : null;

  const crosses =
    sessionCrossesMidnight(sessionStart, sessionEnd) || eventsSpanMidnight(events);

  if (!crosses) {
    if (sessionStart) return String(sessionStart).slice(0, 5);
    return fromClockMin(Math.min(...events.map((e) => toClockMin(e.start_time))));
  }

  const sessionStartMin = sessionStart ? toClockMin(sessionStart) : null;
  const brokenEnvelope =
    sessionStart &&
    sessionEnd &&
    toClockMin(sessionStart) === toClockMin(sessionEnd) &&
    eventsSpanMidnight(events);

  const anchorLooksPostMidnight =
    sessionStartMin != null &&
    sessionStartMin < 6 * 60 &&
    events.some((e) => toClockMin(e.start_time) >= 18 * 60);

  if (brokenEnvelope || !sessionStart || anchorLooksPostMidnight) {
    const evening = events
      .map((e) => toClockMin(e.start_time))
      .filter((m) => m >= 12 * 60);
    if (evening.length) return fromClockMin(Math.min(...evening));
  }

  if (sessionStart) return String(sessionStart).slice(0, 5);
  return fromClockMin(Math.min(...events.map((e) => toClockMin(e.start_time))));
}

function chronoMinutes(clock, anchor) {
  return (toClockMin(clock) - toClockMin(anchor) + 24 * 60) % (24 * 60);
}

/**
 * Events of a diary session (session_events table).
 * When session times are given, events are ordered on an overnight-aware timeline
 * so a 02:00 отбой sorts after 22:00 ужин.
 */
export function childEventsForSession(
  sessionId,
  sessionEvents = [],
  anchorStart = null,
  sessionEnd = null,
) {
  if (!sessionId) return [];
  const list = sessionEvents.filter(
    (e) =>
      e.session_id === sessionId &&
      !e.substance_id &&
      (e.kind || "").toLowerCase() !== "substance",
  );
  const anchor = resolveSessionAnchor(anchorStart, sessionEnd, list);
  if (anchor) {
    return list.sort(
      (a, b) =>
        chronoMinutes(a.start_time, anchor) - chronoMinutes(b.start_time, anchor),
    );
  }
  return list.sort((a, b) =>
    String(a.start_time || "").localeCompare(String(b.start_time || "")),
  );
}

/** Chronological span label for sorted session events (handles overnight). */
export function sessionEventsTimeSpan(sortedEvents, sessionStart, sessionEnd) {
  if (!sortedEvents?.length) return "";
  const anchor = resolveSessionAnchor(sessionStart, sessionEnd, sortedEvents);
  const first = sortedEvents[0];
  const last = sortedEvents[sortedEvents.length - 1];
  const start = String(first.start_time || "").slice(0, 5);
  const end = String(last.end_time || last.start_time || "").slice(0, 5);
  if (anchor && chronoMinutes(end, anchor) < chronoMinutes(start, anchor)) {
    return `${start}–${end}`;
  }
  return `${start}–${end}`;
}

/** Primary expense for simple UI (first linked txn). */
export function expenseForSession(sessionId, finance = []) {
  const rows = expensesForSession(sessionId, finance);
  return rows[0] ?? null;
}

export function fmtExpensesShort(txns) {
  if (!txns?.length) return "";
  if (txns.length === 1) return fmtExpenseShort(txns[0]);
  return txns.map((t) => fmtExpenseShort(t)).filter(Boolean).join(" + ");
}

/** Same label as finance tab: notes, else merchant, else event title. */
export function financeHumanLabel(txn) {
  if (!txn) return "";
  const notes = String(txn.notes || "").trim();
  if (notes) return notes;
  return String(txn.merchant || "").trim();
}

/** Short merchant for drawer links — never the full Grab order notes dump. */
export function financeMerchantLabel(txn) {
  if (!txn) return "";
  const merchant = String(txn.merchant || "").trim();
  if (merchant) return merchant;
  const notes = String(txn.notes || "").trim();
  const fromOrder = notes.match(/\bfrom\s+([A-Za-z][A-Za-z0-9]*)\s+order/i);
  if (fromOrder) return fromOrder[1];
  if (/grabfood/i.test(notes)) return "GrabFood";
  if (notes.length <= 28) return notes;
  return shortenTitle(notes, 28);
}

function shortenTitle(title, max = 72) {
  const t = String(title || "").trim();
  if (!t) return "";
  const colon = t.indexOf(":");
  if (colon > 8 && colon < 56) return t.slice(0, colon).trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Short label for UI (breadcrumbs, bundle parts) — meal.name only on food atoms, not chill/work siblings. */
export function linkedEventLabel(
  event,
  finance = [],
  meals = [],
  sessionEvents = [],
  substances = [],
) {
  if (!event) return "—";
  if ((event.kind || "").toLowerCase() === "substance" && event.substance_id) {
    const sub = substances.find((s) => s.id === event.substance_id);
    if (sub) return substanceRowLabel(sub);
  }
  if (event.substance_id) {
    const sub = substances.find((s) => s.id === event.substance_id);
    if (sub) return substanceRowLabel(sub);
  }
  if (isFoodAtom(event)) {
    const linkedMeal = findMealForEvent(event, { meals, sessionEvents });
    if (linkedMeal?.name) return String(linkedMeal.name).trim();
    if (event.meal_id) {
      const meal = meals.find((m) => m.id === event.meal_id);
      if (meal?.name) return String(meal.name).trim();
    }
  }
  const title = shortenTitle(event.title);
  const kind = (event.kind || "").toLowerCase();
  if (title) return title;
  if (kind === "food") {
    const txn = expensesForSessionEvent(event.id, finance)[0];
    const merchant = (txn?.merchant || "").trim();
    if (merchant) return merchant;
  }
  const txn = expensesForSessionEvent(event?.id, finance)[0];
  if (txn?.merchant) return String(txn.merchant).trim();
  const notes = financeHumanLabel(txn);
  if (notes && notes.length <= 48) return notes;
  if (notes) return shortenTitle(notes, 48);
  return (event.category || event.kind || "—").trim();
}

export function fmtExpenseShort(txn) {
  if (!txn) return "";
  const n = Number(txn.amount) || 0;
  const cur = txn.currency || "";
  if (cur === "VND") return `${Math.round(n).toLocaleString("ru-RU")} ₫`;
  if (cur === "RUB") return `${Math.round(n).toLocaleString("ru-RU")} ₽`;
  return `${n} ${cur}`;
}

export function expenseFromForm(form) {
  const amount = form.expense_amount === "" || form.expense_amount == null
    ? null
    : Number(form.expense_amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const notes = String(form.expense_notes || form.title || "").trim() || null;
  return {
    amount,
    currency: form.expense_currency || "VND",
    account: form.expense_account || null,
    category: form.expense_category || null,
    merchant: form.expense_merchant || null,
    notes,
  };
}

export function resolveExpenseSessionId(kind, record, sessions = []) {
  if (kind === "session") return record.id;
  if (kind === "meal") {
    if (record.session_id) return record.session_id;
    return findFoodSessionForMeal(record, sessions)?.id || null;
  }
  return null;
}
