/**
 * Which session_event fields are editable in drawers vs read-only / linked source.
 * Avoids duplicate expense or metric overrides (meal, finance, activity, substance).
 */

import {
  expensesForSessionEvent,
  expenseFromForm,
  fmtExpensesShort,
  financeMerchantLabel,
} from "./sessionFinance.js";
import {
  findActivityForEvent,
  isSportSessionEvent,
  metricsFromActivity,
  activityLinkLabel,
} from "./activityMetrics.js";
import { getRelatedLinks } from "./recordLinks.js";
import {
  findMealForEvent,
  findLinkedExpenseForEvent,
  findLinkedSubstancesForEvent,
  isMealPhaseFoodEvent,
  isFoodLikeEvent,
  isFoodOrderLikeEvent,
  substanceLinkLabel,
} from "./sessionEventLinks.js";

/** @typedef {'hidden' | 'add_button' | 'readonly'} ExpenseUiMode */

function pushExpenseRow(readonlyRows, txn) {
  if (!txn) return;
  if (readonlyRows.some((r) => r.key === "expense" || r.key === "meal-expense")) return;
  readonlyRows.push({
    key: "expense",
    label: "расход",
    value: fmtExpensesShort([txn]),
    detail: [txn.account, txn.category].filter(Boolean).join(" · "),
    linkKind: "finance",
    linkRecord: txn,
    linkText: financeMerchantLabel(txn) || "операция",
  });
}

function pushMealRow(readonlyRows, meal) {
  if (!meal || readonlyRows.some((r) => r.key === "meal")) return;
  const macro = [
    meal.kcal != null && `${meal.kcal} ккал`,
    meal.protein_g != null && `Б ${meal.protein_g}г`,
    meal.carbs_g != null && `У ${meal.carbs_g}г`,
    meal.fat_g != null && `Ж ${meal.fat_g}г`,
  ].filter(Boolean);
  readonlyRows.push({
    key: "meal",
    label: "приём пищи",
    value: "",
    detail: macro.join(" · "),
    linkKind: "meal",
    linkRecord: meal,
    linkText: meal.name || "meal",
  });
}

/**
 * @param {object} ev session_event row
 * @param {{ meals?: object[], activities?: object[], substances?: object[], finance?: object[], sessions?: object[], sessionEvents?: object[] }} ctx
 */
export function sessionEventDrawerPolicy(ev, ctx = {}) {
  const {
    meals = [],
    activities = [],
    substances = [],
    finance = [],
    sessionEvents = [],
  } = ctx;
  const hideFields = new Set();
  const readonlyRows = [];
  const links = getRelatedLinks("session_event", ev, ctx).filter((l) => l.kind !== "session");

  const linkCtx = { meals, sessionEvents, finance, activities, sessions: ctx.sessions || [] };
  const meal = findMealForEvent(ev, linkCtx);
  const expenseTxn = findLinkedExpenseForEvent(ev, linkCtx);
  const linkedSubstances = findLinkedSubstancesForEvent(ev, {
    substances,
    sessionEvents,
  });
  const substance = ev.substance_id
    ? substances.find((s) => s.id === ev.substance_id)
    : linkedSubstances[0] || null;
  const activity =
    (ev.activity_id && activities.find((a) => a.id === ev.activity_id)) ||
    (isSportSessionEvent(ev) ? findActivityForEvent(ev, activities) : null);

  let expenseMode = /** @type {ExpenseUiMode} */ ("add_button");

  if (expenseTxn) {
    expenseMode = "readonly";
    hideFields.add("expense_amount");
    hideFields.add("expense_currency");
    hideFields.add("expense_account");
    hideFields.add("expense_category");
    hideFields.add("expense_merchant");
    hideFields.add("expense_notes");
    pushExpenseRow(readonlyRows, expenseTxn);
  }

  if (meal && (ev.meal_id || isMealPhaseFoodEvent(ev))) {
    if (!expenseTxn) {
      expenseMode = "hidden";
      hideFields.add("expense_amount");
      hideFields.add("expense_currency");
      hideFields.add("expense_account");
      hideFields.add("expense_category");
      hideFields.add("expense_merchant");
      hideFields.add("expense_notes");
    }
    hideFields.add("title");
    pushMealRow(readonlyRows, meal);
  }

  if (ev.kind === "substance" || ev.substance_id) {
    expenseMode = expenseMode === "add_button" ? "hidden" : expenseMode;
    hideFields.add("title");
    hideFields.add("kind");
  }

  for (const sub of linkedSubstances) {
    const amt =
      sub.amount != null && Number.isFinite(Number(sub.amount))
        ? `${sub.amount}${sub.unit ? ` ${sub.unit}` : ""}`
        : "";
    readonlyRows.push({
      key: `substance-${sub.id}`,
      label: "субстанция",
      value: substanceLinkLabel(sub),
      detail: [amt, String(sub.time || "").slice(0, 5)].filter(Boolean).join(" · "),
      linkKind: "substance",
      linkRecord: sub,
      linkText: substanceLinkLabel(sub),
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
      linkText: activityLinkLabel(activity),
    });
  }

  const instant =
    Boolean(ev.is_instant) || ev.kind === "wake" || ev.kind === "substance";
  if (ev.kind === "wake" || (instant && ev.kind === "wake")) {
    hideFields.add("kind");
    hideFields.add("end");
  }

  const canEditExpenseInline = expenseMode === "add_button";
  const canAddSubstance = ev.kind !== "substance" && !ev.substance_id;
  const canAddMeal =
    !meal &&
    !ev.meal_id &&
    (isFoodLikeEvent(ev) || isFoodOrderLikeEvent(ev));

  return {
    expenseMode,
    expenseTxn,
    hideFields,
    readonlyRows,
    links,
    canEditExpenseInline,
    canAddSubstance,
    canAddMeal,
    instant,
    meal,
    substance,
    linkedSubstances,
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
  if (policy.expenseTxn) return null;
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
