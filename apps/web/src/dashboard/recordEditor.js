/** Field specs and form ↔ DB mapping for RecordEditDrawer. */

import { inferMealSlotFromSession } from "./mergeNutrition.js";
import { formToSessionEventPatch, sessionEventToForm } from "./sessionEventEditor.js";
import { isSportSessionEvent } from "./activityMetrics.js";

export const SPORT_EVENT_FIELD_KEYS = new Set([
  "sport_type",
  "calories_burned",
  "distance_km",
  "pace",
]);

export function filterSessionEventFields(record, fields = []) {
  if (isSportSessionEvent(record)) return fields;
  return fields.filter((f) => !SPORT_EVENT_FIELD_KEYS.has(f.key));
}
import { expensesForSessionEvent } from "./sessionFinance.js";
import { parseAmount } from "./money.js";
import { mapSessionEventForDrawer, sessionEventDisplayLabel } from "./recordDisplay.js";
import { metricsFromActivity } from "./activityMetrics.js";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
export const CONFIDENCE_OPTIONS = ["high", "medium", "low"];
export const ACTIVITY_TYPES = ["move", "walking", "run", "sport", "gym", "other"];
export const CURRENCY_OPTIONS = ["VND", "RUB", "USD"];
export const DEFAULT_ACCOUNTS = ["cash_vnd", "vcb_vnd", "savings_rub", "ip_rub"];

// Labels mirror the finance_transactions columns these map to.
const EXPENSE_FIELDS = [
  { key: "expense_amount", label: "amount", type: "text", optional: true, group: "expense" },
  { key: "expense_currency", label: "currency", type: "select", options: CURRENCY_OPTIONS, optional: true, group: "expense" },
  { key: "expense_account", label: "account", type: "select", options: DEFAULT_ACCOUNTS, optional: true, group: "expense" },
  { key: "expense_category", label: "category", type: "text", optional: true, group: "expense" },
];

function trimTime(t) {
  if (!t) return "";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

function numOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  const s = v == null ? "" : String(v).trim();
  return s === "" ? null : s;
}

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).slice(0, 5).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function diffMinutes(start, end) {
  const s = timeToMin(start);
  const e = timeToMin(end);
  return ((e - s + 24 * 60) % (24 * 60)) || 0;
}

function expenseToFormFields(linked) {
  if (!linked) {
    return {
      expense_amount: "",
      expense_currency: "VND",
      expense_account: "cash_vnd",
      expense_category: "",
      expense_merchant: "",
      expense_notes: "",
      expense_id: "",
    };
  }
  return {
    expense_amount: linked.amount ?? "",
    expense_currency: linked.currency || "VND",
    expense_account: linked.account || "",
    expense_category: linked.category || "",
    expense_merchant: linked.merchant || "",
    expense_notes: linked.notes || "",
    expense_id: linked.id || "",
  };
}

export function withAccountOptions(fields, accountIds = []) {
  const opts = accountIds.length ? accountIds : DEFAULT_ACCOUNTS;
  return fields.map((f) =>
    f.key === "expense_account" || f.key === "account" || f.key === "counter_account"
      ? { ...f, options: opts }
      : f,
  );
}

const KIND_META = {
  meal: {
    resource: "meals",
    title: "Приём пищи",
    subtitle: (r) => r.name || r.slot || r.id,
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "time", label: "time", type: "time" },
      { key: "slot", label: "slot", type: "select", options: MEAL_SLOTS },
      { key: "name", label: "name", type: "text" },
      { key: "kcal", label: "kcal", type: "number" },
      { key: "carbs_g", label: "carbs_g", type: "number" },
      { key: "protein_g", label: "protein_g", type: "number" },
      { key: "fat_g", label: "fat_g", type: "number" },
      { key: "portion_grams", label: "portion_grams", type: "number" },
      { key: "confidence", label: "confidence", type: "select", options: CONFIDENCE_OPTIONS, optional: true },
      { key: "notes", label: "notes", type: "textarea" },
    ],
  },
  activity: {
    resource: "activities",
    title: "Активность",
    subtitle: (r) => r.type || r.id,
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "time", label: "time", type: "time", optional: true },
      { key: "type", label: "type", type: "text" },
      { key: "duration_min", label: "duration_min", type: "number" },
      { key: "calories_burned", label: "calories_burned", type: "number" },
      { key: "distance_km", label: "distance_km", type: "number", optional: true },
      { key: "pace", label: "pace", type: "text", optional: true },
      { key: "intensity", label: "intensity", type: "number", optional: true },
      { key: "source", label: "source", type: "text", optional: true },
      { key: "notes", label: "notes", type: "textarea" },
    ],
  },
  substance: {
    resource: "substances",
    title: "Субстанция",
    subtitle: (r) => {
      const t = r.time ? String(r.time).slice(0, 5) : "";
      const amt =
        r.amount != null && Number.isFinite(Number(r.amount))
          ? ` ${r.amount}${r.unit ? r.unit : ""}`
          : "";
      return [r.name || "substance", amt, t].filter(Boolean).join(" · ");
    },
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "time", label: "time", type: "time" },
      {
        key: "name",
        label: "name",
        type: "select",
        options: ["moda", "scooby", "caffeine", "alcohol", "weed"],
      },
      { key: "amount", label: "amount", type: "number", optional: true },
      { key: "unit", label: "unit", type: "text", optional: true },
      { key: "notes", label: "notes", type: "textarea", optional: true },
    ],
  },
  body_metric: {
    resource: "body_metrics",
    title: "Метрика тела",
    subtitle: (r) => `${r.metric || "?"} · ${r.date || ""}`,
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "time", label: "time", type: "time", optional: true },
      {
        key: "metric",
        label: "metric",
        type: "select",
        options: ["weight_kg", "bf_pct", "fat_mass_kg", "muscle_mass_kg", "resting_hr", "hrv"],
      },
      { key: "value", label: "value", type: "number" },
      { key: "unit", label: "unit", type: "text", optional: true },
      {
        key: "source_type",
        label: "source_type",
        type: "select",
        options: ["estimated", "measured", "device"],
      },
      { key: "notes", label: "notes", type: "textarea", optional: true },
    ],
  },
  finance: {
    resource: "finance_transactions",
    title: "Операция",
    subtitle: (r) => {
      if (r._new) return "новая операция";
      if ((r.txn_type || "") === "transfer" && r.counter_account) {
        return `${r.account || "?"} → ${r.counter_account}`;
      }
      return `${r.amount} ${r.currency || ""}`;
    },
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "time", label: "time", type: "time", optional: true },
      { key: "txn_type", label: "txn_type", type: "select", options: ["expense", "income", "transfer"] },
      { key: "account", label: "account", type: "select", options: DEFAULT_ACCOUNTS },
      { key: "counter_account", label: "counter_account", type: "select", options: DEFAULT_ACCOUNTS, optional: true },
      { key: "amount", label: "amount", type: "text" },
      { key: "currency", label: "currency", type: "select", options: CURRENCY_OPTIONS },
      { key: "amount_counter", label: "amount_counter", type: "text", optional: true },
      { key: "category", label: "category", type: "text", optional: true },
      { key: "merchant", label: "merchant", type: "text", optional: true },
      { key: "notes", label: "notes", type: "textarea", optional: true },
    ],
  },
  event: {
    resource: "events",
    title: "Событие",
    subtitle: (r) => {
      if (r._new) return "новое событие";
      return `${r.date}${r.end_date ? " → " + r.end_date : ""} · ${r.kind || ""}`;
    },
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "end_date", label: "end_date", type: "date", optional: true },
      { key: "kind", label: "kind", type: "text" },
      { key: "detail", label: "detail", type: "textarea", optional: true },
      {
        key: "severity",
        label: "severity",
        type: "select",
        options: ["info", "warning", "danger"],
      },
      { key: "budget_amount", label: "budget_amount", type: "number", optional: true },
      { key: "budget_currency", label: "budget_currency", type: "select", options: CURRENCY_OPTIONS, optional: true },
      { key: "budget_account", label: "budget_account", type: "select", options: DEFAULT_ACCOUNTS, optional: true },
    ],
  },
  session: {
    resource: "sessions",
    title: "Сессия",
    subtitle: (r) => `${r.start || "?"}–${r.end || "?"} · ${r.category || ""}`,
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "start", label: "start_time", type: "time" },
      { key: "end", label: "end_time", type: "time" },
      { key: "category", label: "category", type: "text" },
      { key: "project", label: "project", type: "text", optional: true },
      { key: "note", label: "notes", type: "textarea", optional: true },
      ...EXPENSE_FIELDS,
    ],
  },
  session_event: {
    resource: "session_events",
    title: "Ивент",
    subtitle: (r) => sessionEventDisplayLabel(mapSessionEventForDrawer(r)),
    fields: [
      { key: "date", label: "date", type: "date" },
      { key: "start", label: "start_time", type: "time" },
      { key: "end", label: "end_time", type: "time" },
      { key: "kind", label: "kind", type: "select", options: ["wake", "substance", "chores", "transport", "sport", "food", "work", "chill", "reminder", "other"] },
      { key: "title", label: "title", type: "text" },
      { key: "category", label: "category", type: "text", optional: true },
      { key: "sport_type", label: "sport_type", type: "text", optional: true },
      { key: "calories_burned", label: "calories_burned", type: "number", optional: true },
      { key: "distance_km", label: "distance_km", type: "number", optional: true },
      { key: "pace", label: "pace", type: "text", optional: true },
      { key: "notes", label: "notes", type: "textarea", optional: true },
      ...EXPENSE_FIELDS,
    ],
  },
};

export function getRecordEditorMeta(kind) {
  return KIND_META[kind] || null;
}

export function recordToForm(
  kind,
  record,
  linkedExpense = null,
  linkedSession = null,
  finance = [],
  activities = [],
  meals = [],
  sessionEvents = [],
) {
  if (!record) return {};
  const expense = expenseToFormFields(linkedExpense);
  switch (kind) {
    case "meal": {
      const time =
        linkedSession && linkedSession.start != null
          ? trimTime(linkedSession.start)
          : trimTime(record.time);
      const name = (record.name || "").trim() ||
        (linkedSession && (linkedSession.project || linkedSession.note)
          ? (linkedSession.project || linkedSession.note || "").trim()
          : "");
      return {
        date: (linkedSession && linkedSession.date) || record.date || "",
        time,
        slot:
          linkedSession && linkedSession.start
            ? inferMealSlotFromSession(linkedSession)
            : record.slot || "",
        name: name || record.name || "",
        kcal: record.kcal ?? "",
        carbs_g: record.carbs_g ?? "",
        protein_g: record.protein_g ?? "",
        fat_g: record.fat_g ?? "",
        portion_grams: record.portion_grams ?? "",
        confidence: record.confidence || "",
        notes: record.notes || "",
      };
    }
    case "activity": {
      const m = metricsFromActivity(record);
      return {
        date: record.date || "",
        time: trimTime(record.time),
        type: record.type || "move",
        duration_min: record.duration_min ?? "",
        calories_burned: record.calories_burned ?? m.calories_burned ?? "",
        distance_km: record.distance_km ?? m.distance_km ?? "",
        pace: record.pace || m.pace || "",
        intensity: record.intensity ?? "",
        source: record.source || "",
        notes: record.notes || "",
      };
    }
    case "session":
      return {
        date: record.date || "",
        start: trimTime(record.start),
        end: trimTime(record.end),
        category: record.category || "",
        project: record.project || "",
        note: record.note || "",
        ...expense,
      };
    case "session_event":
      return {
        ...sessionEventToForm(
          {
            ...record,
            start_time: record.start_time || record.start,
            end_time: record.end_time || record.end,
          },
          linkedExpense ? [linkedExpense] : finance,
          meals,
          activities,
          sessionEvents,
        ),
        _session_id: record.session_id,
      };
    case "event":
      return {
        date: record.date || "",
        end_date: record.end_date || "",
        kind: record.kind || "",
        detail: record.detail || "",
        severity: record.severity || "info",
        budget_amount: record.budget_amount ?? "",
        budget_currency: record.budget_currency || "RUB",
        budget_account: record.budget_account || "",
      };
    case "finance":
      return {
        date: record.date || "",
        time: trimTime(record.time),
        txn_type: record.txn_type || "expense",
        account: record.account || "",
        counter_account: record.counter_account || "",
        amount: record.amount ?? "",
        currency: record.currency || "VND",
        amount_counter: record.amount_counter ?? "",
        category: record.category || (record.txn_type === "transfer" ? "transfer" : ""),
        merchant: record.merchant || "",
        notes: record.notes || "",
      };
    case "body_metric":
      return {
        date: record.date || "",
        time: trimTime(record.time),
        metric: record.metric || "weight_kg",
        value: record.value ?? "",
        unit: record.unit || "kg",
        source_type: record.source_type || "estimated",
        notes: record.notes || "",
      };
    case "substance":
      return {
        date: record.date || "",
        time: trimTime(record.time),
        name: record.name || "",
        amount: record.amount ?? "",
        unit: record.unit || "",
        notes: record.notes || "",
      };
    default:
      return {};
  }
}

/** DB patch for manual API. */
export function formToDbPatch(kind, form) {
  switch (kind) {
    case "meal":
      return {
        date: form.date,
        time: strOrNull(form.time),
        slot: strOrNull(form.slot),
        name: form.name || "",
        kcal: numOrNull(form.kcal),
        carbs_g: numOrNull(form.carbs_g),
        protein_g: numOrNull(form.protein_g),
        fat_g: numOrNull(form.fat_g),
        portion_grams: numOrNull(form.portion_grams),
        confidence: strOrNull(form.confidence),
        notes: strOrNull(form.notes),
      };
    case "activity":
      return {
        date: form.date,
        time: strOrNull(form.time),
        type: form.type || "move",
        duration_min: numOrNull(form.duration_min),
        calories_burned: numOrNull(form.calories_burned),
        distance_km: numOrNull(form.distance_km),
        pace: strOrNull(form.pace),
        intensity: numOrNull(form.intensity),
        source: strOrNull(form.source),
        notes: strOrNull(form.notes),
      };
    case "session": {
      const min = diffMinutes(form.start, form.end);
      return {
        date: form.date,
        start_time: form.start,
        end_time: form.end,
        duration_min: min,
        category: strOrNull(form.category),
        project: strOrNull(form.project),
        notes: strOrNull(form.note),
      };
    }
    case "session_event": {
      const { _session_id, ...rest } = form;
      return formToSessionEventPatch(rest, _session_id || null);
    }
    case "event":
      return {
        date: form.date,
        end_date: strOrNull(form.end_date),
        kind: form.kind || "other",
        detail: strOrNull(form.detail),
        severity: form.severity || "info",
        budget_amount: numOrNull(form.budget_amount),
        budget_currency: strOrNull(form.budget_currency) || "RUB",
        budget_account: strOrNull(form.budget_account),
      };
    case "finance": {
      const txn_type = form.txn_type || "expense";
      return {
        date: form.date,
        time: strOrNull(form.time),
        amount: parseAmount(form.amount) ?? 0,
        currency: form.currency || "VND",
        account: strOrNull(form.account),
        counter_account: txn_type === "transfer" ? strOrNull(form.counter_account) : null,
        amount_counter: txn_type === "transfer" ? parseAmount(form.amount_counter) : null,
        category: strOrNull(form.category) || (txn_type === "transfer" ? "transfer" : null),
        merchant: strOrNull(form.merchant),
        txn_type,
        notes: strOrNull(form.notes),
      };
    }
    case "body_metric":
      return {
        date: form.date,
        time: strOrNull(form.time),
        metric: form.metric || "weight_kg",
        value: numOrNull(form.value) ?? 0,
        unit: strOrNull(form.unit),
        source_type: form.source_type || "estimated",
        notes: strOrNull(form.notes),
      };
    case "substance":
      return {
        date: form.date,
        time: strOrNull(form.time),
        name: form.name || "",
        amount: numOrNull(form.amount),
        unit: strOrNull(form.unit),
        notes: strOrNull(form.notes),
      };
    default:
      return {};
  }
}

/** Local session shape after save (dashboard). */
export function formToSessionUi(form) {
  const min = diffMinutes(form.start, form.end);
  return {
    date: form.date,
    start: form.start,
    end: form.end,
    min,
    category: form.category || "",
    project: form.project || "",
    note: form.note || "",
  };
}

export function isExpenseField(field) {
  return field.group === "expense";
}
