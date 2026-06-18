/** Resolve related records and labels for drawer navigation. */

import { findFoodSessionForMeal } from "./mergeNutrition.js";
import { findActivityForEvent, activityLinkLabel, isSportSessionEvent } from "./activityMetrics.js";
import {
  childEventsForSession,
  expensesForSessionEvent,
  expensesForSession,
  linkedEventLabel,
  fmtExpensesShort,
} from "./sessionFinance.js";
import { financeTxnLabel, financeTxnShortMeta } from "./financeDisplay.js";
import { getRecordEditorMeta } from "./recordEditor.js";
import { substanceRowLabel } from "./substanceSession.js";
import { findMealForEvent } from "./sessionEventLinks.js";
import { mapSessionEventForDrawer, sessionEventDisplayLabel } from "./recordDisplay.js";
import { mapSessionForDrawer, sessionBreadcrumbLabel } from "./drawerNavigation.js";
import { fmtExpenseShort } from "./sessionFinance.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

export function targetLabel(kind, record, ctx = {}) {
  const { finance = [], sessionEvents = [], activities = [], meals = [] } = ctx;
  if (!record) return "—";
  if (kind === "session") {
    return sessionBreadcrumbLabel(record);
  }
  if (kind === "session_event") {
    return sessionEventDisplayLabel(
      mapSessionEventForDrawer(record),
      finance,
      meals,
      sessionEvents,
      ctx.substances || [],
    );
  }
  if (kind === "finance") {
    const amt = fmtExpenseShort(record);
    const merchant = (record.merchant || "").trim();
    return merchant ? `${amt} · ${merchant}` : amt || financeTxnLabel(record);
  }
  if (kind === "meal") return record.name || "meal";
  const meta = getRecordEditorMeta(kind);
  if (meta?.subtitle) return meta.subtitle(record);
  if (kind === "activity") {
    return `активность · ${activityLinkLabel(record)}`;
  }
  if (kind === "substance") {
    const t = record.time ? trimTime(record.time) : "";
    return [record.name, t].filter(Boolean).join(" · ") || "substance";
  }
  if (kind === "event") return record.detail || record.kind || "event";
  return record.id || kind;
}

/**
 * Quick navigation targets from the current drawer record.
 * @returns {{ kind: string, record: object, label: string }[]}
 */
export function getRelatedLinks(kind, record, ctx = {}) {
  const {
    sessions = [],
    sessionEvents = [],
    meals = [],
    activities = [],
    substances = [],
    finance = [],
  } = ctx;
  const links = [];
  const push = (item) => {
    if (!item?.record) return;
    if (links.some((l) => l.kind === item.kind && l.record?.id === item.record?.id)) return;
    links.push(item);
  };

  if (kind === "session_event" && record) {
    if (record.session_id) {
      const sess = sessions.find((s) => s.id === record.session_id);
      if (sess) {
        push({
          kind: "session",
          record: mapSessionForDrawer(sess),
          label: `сессия ${trimTime(sess.start_time || sess.start)}–${trimTime(sess.end_time || sess.end)}`,
        });
      }
    }
    const txn = expensesForSessionEvent(record.id, finance)[0];
    if (txn) {
      push({
        kind: "finance",
        record: txn,
        label: `${financeTxnLabel(txn)} · ${financeTxnShortMeta(txn)}`,
      });
    }
    if (isSportSessionEvent(record)) {
    const act = record.activity_id
      ? activities.find((a) => a.id === record.activity_id)
      : findActivityForEvent(record, activities);
    if (act) {
      push({
        kind: "activity",
        record: act,
        label: `активность · ${activityLinkLabel(act)}`,
      });
    }
    }
    const meal =
      findMealForEvent(record, { meals, sessionEvents }) ||
      (record.meal_id ? meals.find((m) => m.id === record.meal_id) : null);
    if (meal) push({ kind: "meal", record: meal, label: meal.name || "meal" });
  }

  if (kind === "finance" && record) {
    let ev = null;
    if (record.session_event_id) {
      ev = sessionEvents.find((e) => e.id === record.session_event_id) || null;
      if (ev) {
        push({
          kind: "session_event",
          record: ev,
          label: linkedEventLabel(ev, finance, meals),
        });
      }
    }
    const sessionId = ev?.session_id || record.session_id;
    if (sessionId) {
      const sess = sessions.find((s) => s.id === sessionId);
      if (sess) {
        push({
          kind: "session",
          record: mapSessionForDrawer(sess),
          label: `сессия ${trimTime(sess.start_time || sess.start)}–${trimTime(sess.end_time || sess.end)}`,
        });
      }
    }
  }

  if (kind === "meal" && record) {
    const sess =
      (record.session_id && sessions.find((s) => s.id === record.session_id)) ||
      findFoodSessionForMeal(record, sessions);
    if (sess) {
      push({
        kind: "session",
        record: mapSessionForDrawer(sess),
        label: `сессия еды ${trimTime(sess.start_time || sess.start)}–${trimTime(sess.end_time || sess.end)}`,
      });
    }
    const sid = sess?.id || record.session_id;
    const mealTxns = finance.filter(
      (t) => t.session_id === sid && (t.txn_type || "expense") === "expense",
    );
    for (const t of mealTxns.slice(0, 2)) {
      push({
        kind: "finance",
        record: t,
        label: financeTxnLabel(t),
      });
    }
  }

  if (kind === "activity" && record) {
    const ev = sessionEvents.find((e) => e.activity_id === record.id);
    if (ev) {
      push({
        kind: "session_event",
        record: ev,
        label: `часть · ${linkedEventLabel(ev, finance)}`,
      });
    }
  }

  if (kind === "substance" && record) {
    const ev = sessionEvents.find((e) => e.substance_id === record.id);
    if (ev) {
      push({
        kind: "session_event",
        record: ev,
        label: linkedEventLabel(ev, finance, meals),
      });
    }
  }

  if (kind === "session_event" && record?.substance_id) {
    const sub = substances.find((s) => s.id === record.substance_id);
    if (sub) {
      push({
        kind: "substance",
        record: sub,
        label: substanceRowLabel(sub),
      });
    }
  }

  if (kind === "session" && record) {
    const parts = childEventsForSession(
      record.id,
      sessionEvents,
      record.start || record.start_time,
      record.end || record.end_time,
    );
    for (const p of parts.slice(0, 6)) {
      if (p.substance_id) continue;
      push({
        kind: "session_event",
        record: p,
        label: linkedEventLabel(p, finance, meals),
      });
    }
    const txns = expensesForSession(record.id, finance).filter(
      (t) => !t.session_event_id,
    );
    for (const t of txns.slice(0, 3)) {
      push({
        kind: "finance",
        record: t,
        label: fmtExpensesShort([t]),
      });
    }
  }

  return links;
}

export function buildBreadcrumbItems(stack, ctx = {}) {
  return (stack || []).map((item, index) => ({
    index,
    kind: item.kind,
    record: item.record,
    label: targetLabel(item.kind, item.record, ctx),
    isCurrent: index === stack.length - 1,
  }));
}
