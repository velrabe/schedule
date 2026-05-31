/** Helpers for session-linked expenses in the UI. */

import { findFoodSessionForMeal } from "./mergeNutrition.js";

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

/** Atomic parts of a diary session (session_events table). */
export function childEventsForSession(sessionId, sessionEvents = []) {
  if (!sessionId) return [];
  return sessionEvents
    .filter((e) => e.session_id === sessionId && !e.substance_id)
    .sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
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

export function linkedEventLabel(event, finance = []) {
  const txn = expensesForSessionEvent(event?.id, finance)[0];
  const fromFinance = financeHumanLabel(txn);
  if (fromFinance) return fromFinance;
  return (event?.title || event?.category || event?.kind || "—").trim();
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
