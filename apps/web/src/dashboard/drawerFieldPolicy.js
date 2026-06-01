/**
 * Which session_event fields are editable in drawers vs read-only / linked source.
 * Avoids duplicate expense or metric overrides (meal, finance, activity, substance).
 */

import { findFoodSessionForMeal } from "./mergeNutrition.js";
import {
  expensesForSession,
  expensesForSessionEvent,
  expenseFromForm,
  fmtExpensesShort,
  financeHumanLabel,
} from "./sessionFinance.js";
import {
  findActivityForEvent,
  isSportSessionEvent,
  metricsFromActivity,
  activityLinkLabel,
} from "./activityMetrics.js";
import { getRelatedLinks } from "./recordLinks.js";

/** @typedef {'hidden' | 'add_button' | 'readonly'} ExpenseUiMode */

/**
 * @param {object} ev session_event row
 * @param {{ meals?: object[], activities?: object[], substances?: object[], finance?: object[], sessions?: object[] }} ctx
 */
export function sessionEventDrawerPolicy(ev, ctx = {}) {
  const { meals = [], activities = [], substances = [], finance = [], sessions = [] } = ctx;
  const hideFields = new Set();
  const readonlyRows = [];
  const links = getRelatedLinks("session_event", ev, ctx).filter((l) => l.kind !== "session");

  const txnOnEvent = expensesForSessionEvent(ev.id, finance)[0] || null;
  const meal = ev.meal_id ? meals.find((m) => m.id === ev.meal_id) : null;
  const substance = ev.substance_id
    ? substances.find((s) => s.id === ev.substance_id)
    : null;
  const activity =
    (ev.activity_id && activities.find((a) => a.id === ev.activity_id)) ||
    (isSportSessionEvent(ev) ? findActivityForEvent(ev, activities) : null);

  let expenseMode = /** @type {ExpenseUiMode} */ ("add_button");
  let expenseTxn = null;

  if (txnOnEvent) {
    expenseMode = "readonly";
    expenseTxn = txnOnEvent;
    hideFields.add("expense_amount");
    hideFields.add("expense_currency");
    hideFields.add("expense_account");
    hideFields.add("expense_category");
    hideFields.add("expense_merchant");
    hideFields.add("expense_notes");
    readonlyRows.push({
      key: "expense",
      label: "расход",
      value: fmtExpensesShort([txnOnEvent]),
      detail: [txnOnEvent.account, txnOnEvent.category].filter(Boolean).join(" · "),
      linkKind: "finance",
      linkRecord: txnOnEvent,
      linkLabel: financeHumanLabel(txnOnEvent) || "операция",
    });
  } else if (meal) {
    expenseMode = "hidden";
    hideFields.add("expense_amount");
    hideFields.add("expense_currency");
    hideFields.add("expense_account");
    hideFields.add("expense_category");
    hideFields.add("expense_merchant");
    hideFields.add("expense_notes");

    const sess =
      (meal.session_id && sessions.find((s) => s.id === meal.session_id)) ||
      findFoodSessionForMeal(meal, sessions);
    const mealTxns = sess ? expensesForSession(sess.id, finance) : [];
    if (mealTxns.length) {
      readonlyRows.push({
        key: "meal-expense",
        label: "расход (приём пищи)",
        value: fmtExpensesShort(mealTxns),
        linkKind: "finance",
        linkRecord: mealTxns[0],
        linkLabel: financeHumanLabel(mealTxns[0]) || "операция",
      });
    }

    hideFields.add("title");
    const macro = [
      meal.kcal != null && `${meal.kcal} ккал`,
      meal.protein_g != null && `Б ${meal.protein_g}г`,
      meal.carbs_g != null && `У ${meal.carbs_g}г`,
      meal.fat_g != null && `Ж ${meal.fat_g}г`,
    ].filter(Boolean);
    readonlyRows.push({
      key: "meal",
      label: "приём пищи",
      value: meal.name || "meal",
      detail: macro.join(" · "),
      linkKind: "meal",
      linkRecord: meal,
      linkLabel: meal.name || "meal",
    });
  }

  if (substance) {
    expenseMode = expenseMode === "add_button" ? "hidden" : expenseMode;
    hideFields.add("title");
    hideFields.add("kind");
    const amt =
      substance.amount != null && Number.isFinite(Number(substance.amount))
        ? `${substance.amount}${substance.unit ? ` ${substance.unit}` : ""}`
        : "";
    readonlyRows.push({
      key: "substance",
      label: "substance",
      value: [substance.name, amt].filter(Boolean).join(" · "),
      detail: String(substance.time || "").slice(0, 5),
      linkKind: "substance",
      linkRecord: substance,
      linkLabel: substance.name || "substance",
    });
  }

  if (activity && isSportSessionEvent(ev)) {
    hideFields.add("sport_type");
    hideFields.add("calories_burned");
    hideFields.add("distance_km");
    hideFields.add("pace");
    hideFields.add("activity_id");
    const m = metricsFromActivity(activity);
    const parts = [];
    if (m.calories_burned != null) parts.push(`${m.calories_burned} ккал`);
    if (m.distance_km != null) parts.push(`${m.distance_km} км`);
    if (m.pace) parts.push(m.pace);
    readonlyRows.push({
      key: "activity",
      label: "активность",
      value: activityLinkLabel(activity),
      detail: parts.join(" · "),
      linkKind: "activity",
      linkRecord: activity,
      linkLabel: `активность · ${activityLinkLabel(activity)}`,
    });
  }

  const instant =
    Boolean(ev.is_instant) || ev.kind === "wake" || ev.kind === "substance";
  if (ev.kind === "wake" || instant && ev.kind === "wake") {
    hideFields.add("kind");
    hideFields.add("end");
  }

  const canEditExpenseInline = expenseMode === "add_button";

  return {
    expenseMode,
    expenseTxn,
    hideFields,
    readonlyRows,
    links,
    canEditExpenseInline,
    instant,
    meal,
    substance,
    activity,
  };
}

export function stripExpenseFormFields(form) {
  const next = { ...form };
  for (const k of [
    "expense_amount",
    "expense_currency",
    "expense_account",
    "expense_category",
    "expense_merchant",
    "expense_notes",
    "expense_id",
  ]) {
    delete next[k];
  }
  return next;
}

export function shouldSendExpensePatch(policy, form, eventId, finance, expenseExpanded) {
  if (!policy.canEditExpenseInline) return undefined;
  if (!expenseExpanded) return undefined;
  const parsed = expenseFromForm(form);
  if (parsed) return parsed;
  if (expensesForSessionEvent(eventId, finance).length) return null;
  return undefined;
}

/** Drop fields owned by meal / activity / substance / finance links. */
export function applySessionEventPolicyToPatch(patch, policy) {
  if (!policy || !patch) return patch;
  const next = { ...patch };
  if (policy.hideFields.has("title")) delete next.title;
  if (policy.hideFields.has("kind")) {
    delete next.kind;
    delete next.category;
  }
  if (policy.hideFields.has("sport_type")) delete next.sport_type;
  if (policy.hideFields.has("calories_burned")) delete next.calories_burned;
  if (policy.hideFields.has("distance_km")) delete next.distance_km;
  if (policy.hideFields.has("pace")) delete next.pace;
  if (policy.hideFields.has("activity_id")) delete next.activity_id;
  if (policy.hideFields.has("end") && policy.instant) {
    next.end_time = next.start_time;
    next.duration_min = 0;
    next.is_instant = true;
    next.instant = true;
  }
  return next;
}
