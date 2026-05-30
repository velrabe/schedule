/** Resolve related records and labels for drawer navigation. */

import { findFoodSessionForMeal } from "./mergeNutrition.js";
import { findActivityForEvent, activityLinkLabel } from "./activityMetrics.js";
import {
  childEventsForSession,
  expensesForSessionEvent,
  expensesForSession,
  linkedEventLabel,
  fmtExpensesShort,
} from "./sessionFinance.js";
import { financeTxnLabel, financeTxnShortMeta } from "./financeDisplay.js";
import { getRecordEditorMeta } from "./recordEditor.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function mapSessionForDrawer(s) {
  if (!s) return null;
  return {
    ...s,
    start: s.start ?? trimTime(s.start_time),
    end: s.end ?? trimTime(s.end_time),
    note: s.note ?? s.notes ?? "",
  };
}

export function targetLabel(kind, record, ctx = {}) {
  const { finance = [], sessionEvents = [], activities = [] } = ctx;
  if (!record) return "—";
  const meta = getRecordEditorMeta(kind);
  if (meta?.subtitle) return meta.subtitle(record);
  if (kind === "session") {
    const s = mapSessionForDrawer(record);
    return `${s.start}–${s.end} ${s.category || ""}`;
  }
  if (kind === "session_event") {
    return linkedEventLabel(record, finance);
  }
  if (kind === "finance") {
    return financeTxnLabel(record);
  }
  if (kind === "meal") return record.name || "meal";
  if (kind === "activity") {
    return `активность · ${activityLinkLabel(record)}`;
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
    if (record.meal_id) {
      const meal = meals.find((m) => m.id === record.meal_id);
      if (meal) push({ kind: "meal", record: meal, label: meal.name || "meal" });
    }
  }

  if (kind === "finance" && record) {
    if (record.session_event_id) {
      const ev = sessionEvents.find((e) => e.id === record.session_event_id);
      if (ev) {
        push({
          kind: "session_event",
          record: ev,
          label: `часть · ${linkedEventLabel(ev, finance)}`,
        });
      }
    }
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

  if (kind === "session" && record) {
    const parts = childEventsForSession(record.id, sessionEvents);
    for (const p of parts.slice(0, 6)) {
      push({
        kind: "session_event",
        record: p,
        label: `часть · ${linkedEventLabel(p, finance)}`,
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
