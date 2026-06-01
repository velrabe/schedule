/**
 * Bottom drawer links for meal / activity / finance leaf sheets.
 * Session + calendar event stay in breadcrumbs only.
 */

import { findFoodSessionForMeal } from "./mergeNutrition.js";
import {
  findActivityForEvent,
  activityLinkLabel,
  isSportSessionEvent,
} from "./activityMetrics.js";
import {
  expensesForSessionEvent,
  fmtExpenseShort,
  expenseFromForm,
  financeMerchantLabel,
} from "./sessionFinance.js";
import {
  findMealForEvent,
  findLinkedExpenseForEvent,
  isFoodLikeEvent,
  isMealPhaseFoodEvent,
} from "./sessionEventLinks.js";
import { manualPatch } from "./manualSave.js";

export const FINANCE_ATTACH_FIELDS = [
  { key: "expense_amount", label: "стоимость", type: "number" },
  {
    key: "expense_currency",
    label: "валюта",
    type: "select",
    options: ["VND", "RUB", "USD"],
  },
  {
    key: "expense_account",
    label: "счёт списания",
    type: "select",
    options: ["cash_vnd", "vcb_vnd", "savings_rub", "ip_rub"],
  },
  { key: "expense_category", label: "категория", type: "text", optional: true },
  { key: "expense_merchant", label: "магазин", type: "text", optional: true },
];

export function findAtomEventForMeal(meal, sessionEvents = [], sessions = []) {
  const direct = sessionEvents.find((e) => e.meal_id === meal.id);
  if (direct) return direct;
  const sid = meal.session_id || findFoodSessionForMeal(meal, sessions)?.id;
  if (!sid) return null;
  const inSession = sessionEvents.filter((e) => e.session_id === sid);
  return (
    inSession.find((e) => e.meal_id === meal.id) ||
    inSession.find((e) => isMealPhaseFoodEvent(e)) ||
    inSession.find((e) => isFoodLikeEvent(e) && !e.meal_id) ||
    null
  );
}

export function findAtomEventForActivity(activity, sessionEvents = []) {
  const direct = sessionEvents.find((e) => e.activity_id === activity.id);
  if (direct) return direct;
  return (
    sessionEvents.find((ev) => {
      if (!isSportSessionEvent(ev) || ev.activity_id) return false;
      return findActivityForEvent(ev, [activity])?.id === activity.id;
    }) || null
  );
}

export function findFinanceForMeal(meal, ctx = {}) {
  const { finance = [], sessionEvents = [] } = ctx;
  if (!meal) return null;

  for (const ev of sessionEvents.filter((e) => e.meal_id === meal.id)) {
    const txn = expensesForSessionEvent(ev.id, finance)[0];
    if (txn) return txn;
  }

  const sid = meal.session_id || findFoodSessionForMeal(meal, ctx.sessions || [])?.id;
  if (sid) {
    for (const ev of sessionEvents.filter((e) => e.session_id === sid)) {
      const linkedMeal = findMealForEvent(ev, ctx);
      if (linkedMeal?.id !== meal.id && ev.meal_id !== meal.id) continue;
      const txn =
        expensesForSessionEvent(ev.id, finance)[0] ||
        findLinkedExpenseForEvent(ev, ctx);
      if (txn) return txn;
    }
  }

  for (const ev of sessionEvents) {
    const linkedMeal = findMealForEvent(ev, ctx);
    if (linkedMeal?.id === meal.id) {
      return (
        expensesForSessionEvent(ev.id, finance)[0] ||
        findLinkedExpenseForEvent(ev, ctx)
      );
    }
  }

  return null;
}

export function findFinanceForActivity(activity, ctx = {}) {
  const { finance = [], sessionEvents = [], activities = [] } = ctx;
  if (!activity) return null;

  const ev = findAtomEventForActivity(activity, sessionEvents);
  if (ev) {
    return (
      expensesForSessionEvent(ev.id, finance)[0] ||
      findLinkedExpenseForEvent(ev, { ...ctx, activities })
    );
  }

  for (const e of sessionEvents) {
    if (!isSportSessionEvent(e)) continue;
    const act = findActivityForEvent(e, activities);
    if (act?.id === activity.id) {
      return (
        expensesForSessionEvent(e.id, finance)[0] ||
        findLinkedExpenseForEvent(e, { ...ctx, activities })
      );
    }
  }

  return null;
}

function peerFromSessionEvent(ev, ctx) {
  const { meals = [], activities = [] } = ctx;
  if (!ev) return null;

  if (ev.meal_id) {
    const meal = meals.find((m) => m.id === ev.meal_id);
    if (meal) return { kind: "meal", record: meal };
  }

  const meal = findMealForEvent(ev, ctx);
  if (meal) return { kind: "meal", record: meal };

  if (ev.activity_id) {
    const act = activities.find((a) => a.id === ev.activity_id);
    if (act) return { kind: "activity", record: act };
  }

  const act = findActivityForEvent(ev, activities);
  if (act) return { kind: "activity", record: act };

  return null;
}

/** Meal or activity peer for a finance row (not session / session_event / event). */
export function findPeerForFinance(txn, ctx = {}) {
  const { sessionEvents = [], meals = [] } = ctx;
  if (!txn) return null;

  const ev = txn.session_event_id
    ? sessionEvents.find((e) => e.id === txn.session_event_id)
    : null;
  const fromEv = peerFromSessionEvent(ev, ctx);
  if (fromEv) return fromEv;

  if (!txn.session_id) return null;

  const inSession = sessionEvents.filter((e) => e.session_id === txn.session_id);
  for (const e of inSession) {
    const peer = peerFromSessionEvent(e, ctx);
    if (peer) return peer;
  }

  const mealOnSession = meals.find((m) => m.session_id === txn.session_id);
  if (mealOnSession) return { kind: "meal", record: mealOnSession };

  return null;
}

export function buildLeafNavRows(kind, record, ctx = {}) {
  if (kind === "meal") {
    const txn = findFinanceForMeal(record, ctx);
    if (!txn) return { rows: [], canCreateFinance: true };
    return {
      rows: [
        {
          key: "finance",
          label: "транзакция",
          value: fmtExpenseShort(txn),
          detail: [txn.account, txn.category].filter(Boolean).join(" · "),
          linkKind: "finance",
          linkRecord: txn,
          linkText: financeMerchantLabel(txn) || "операция",
        },
      ],
      canCreateFinance: false,
    };
  }

  if (kind === "activity") {
    const txn = findFinanceForActivity(record, ctx);
    if (!txn) return { rows: [], canCreateFinance: true };
    return {
      rows: [
        {
          key: "finance",
          label: "транзакция",
          value: fmtExpenseShort(txn),
          detail: [txn.account, txn.category].filter(Boolean).join(" · "),
          linkKind: "finance",
          linkRecord: txn,
          linkText: financeMerchantLabel(txn) || "операция",
        },
      ],
      canCreateFinance: false,
    };
  }

  if (kind === "finance") {
    const peer = findPeerForFinance(record, ctx);
    if (!peer) return { rows: [], canCreateFinance: false };
    const label = peer.kind === "meal" ? "приём пищи" : "активность";
    const linkText =
      peer.kind === "meal"
        ? peer.record.name || peer.record.slot || "meal"
        : activityLinkLabel(peer.record);
    return {
      rows: [
        {
          key: peer.kind,
          label,
          linkKind: peer.kind,
          linkRecord: peer.record,
          linkText,
        },
      ],
      canCreateFinance: false,
    };
  }

  return { rows: [], canCreateFinance: false };
}

export function defaultFinanceAttachForm(kind, record) {
  const merchant =
    kind === "meal" ? String(record?.name || "").trim() : "";
  return {
    expense_amount: "",
    expense_currency: "VND",
    expense_account: "vcb_vnd",
    expense_category: kind === "activity" ? "sport" : "food",
    expense_merchant: merchant,
  };
}

export async function attachFinanceToMeal(meal, form, ctx = {}) {
  const { sessionEvents = [], sessions = [] } = ctx;
  const expense = expenseFromForm(form);
  if (!expense) throw new Error("укажите стоимость");

  const ev = findAtomEventForMeal(meal, sessionEvents, sessions);
  if (ev) {
    const patch = ev.meal_id === meal.id ? {} : { meal_id: meal.id };
    await manualPatch("session_events", ev.id, patch, { expense });
    return;
  }

  const sid = meal.session_id || findFoodSessionForMeal(meal, sessions)?.id;
  if (!sid) {
    throw new Error("нет сессии еды — откройте приём из календаря или привяжите к атому");
  }
  await manualPatch(
    "meals",
    meal.id,
    meal.session_id ? {} : { session_id: sid },
    { expense, expense_session_id: sid },
  );
}

export async function attachFinanceToActivity(activity, form, ctx = {}) {
  const { sessionEvents = [] } = ctx;
  const expense = expenseFromForm(form);
  if (!expense) throw new Error("укажите стоимость");

  const ev = findAtomEventForActivity(activity, sessionEvents);
  if (ev) {
    await manualPatch("session_events", ev.id, {}, { expense });
    return;
  }

  const { insertRow, notifyDataChanged } = await import("../api/manual");
  await insertRow("finance_transactions", {
    date: activity.date,
    time: activity.time || null,
    amount: expense.amount,
    currency: expense.currency || "VND",
    account: expense.account,
    category: expense.category || "sport",
    merchant: expense.merchant,
    notes: expense.notes,
    txn_type: "expense",
  });
  notifyDataChanged();
}

export function leafDrawerExcludeKinds(kind) {
  if (kind === "meal") return ["finance", "meal"];
  if (kind === "activity") return ["finance", "activity", "session_event"];
  if (kind === "finance") return ["finance", "meal", "activity", "session", "session_event"];
  return [];
}
