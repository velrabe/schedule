/** Field specs and form ↔ DB mapping for RecordEditDrawer. */

import { inferMealSlotFromSession } from "./mergeNutrition.js";
import { formToSessionEventPatch, sessionEventToForm } from "./sessionEventEditor.js";
import { expensesForSessionEvent } from "./sessionFinance.js";

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
export const CONFIDENCE_OPTIONS = ["high", "medium", "low"];
export const ACTIVITY_TYPES = ["move", "walking", "run", "sport", "gym", "other"];
export const CURRENCY_OPTIONS = ["VND", "RUB", "USD"];
export const DEFAULT_ACCOUNTS = ["cash_vnd", "vcb_vnd", "savings_rub", "ip_rub"];

const EXPENSE_FIELDS = [
  { key: "expense_amount", label: "стоимость", type: "number", optional: true, group: "expense" },
  { key: "expense_currency", label: "валюта", type: "select", options: CURRENCY_OPTIONS, optional: true, group: "expense" },
  { key: "expense_account", label: "счёт списания", type: "select", options: DEFAULT_ACCOUNTS, optional: true, group: "expense" },
  { key: "expense_category", label: "категория расхода", type: "text", optional: true, group: "expense" },
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
      { key: "date", label: "дата", type: "date" },
      { key: "time", label: "время", type: "time" },
      { key: "slot", label: "слот", type: "select", options: MEAL_SLOTS },
      { key: "name", label: "название", type: "text" },
      { key: "kcal", label: "ккал", type: "number" },
      { key: "carbs_g", label: "углеводы, г", type: "number" },
      { key: "protein_g", label: "белок, г", type: "number" },
      { key: "fat_g", label: "жир, г", type: "number" },
      { key: "portion_grams", label: "порция, г", type: "number" },
      { key: "confidence", label: "уверенность", type: "select", options: CONFIDENCE_OPTIONS, optional: true },
      { key: "notes", label: "заметки", type: "textarea" },
      ...EXPENSE_FIELDS,
    ],
  },
  activity: {
    resource: "activities",
    title: "Активность",
    subtitle: (r) => r.type || r.id,
    fields: [
      { key: "date", label: "дата", type: "date" },
      { key: "time", label: "время", type: "time", optional: true },
      { key: "type", label: "тип", type: "text" },
      { key: "duration_min", label: "длительность, мин", type: "number" },
      { key: "calories_burned", label: "ккал сожжено", type: "number" },
      { key: "intensity", label: "интенсивность", type: "number", optional: true },
      { key: "source", label: "источник", type: "text", optional: true },
      { key: "notes", label: "заметки", type: "textarea" },
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
      { key: "date", label: "дата", type: "date" },
      { key: "time", label: "время", type: "time", optional: true },
      { key: "txn_type", label: "тип", type: "select", options: ["expense", "income", "transfer"] },
      { key: "account", label: "счёт (откуда / счёт)", type: "select", options: DEFAULT_ACCOUNTS },
      { key: "counter_account", label: "счёт (куда)", type: "select", options: DEFAULT_ACCOUNTS, optional: true },
      { key: "amount", label: "сумма списания", type: "number" },
      { key: "currency", label: "валюта списания", type: "select", options: CURRENCY_OPTIONS },
      { key: "amount_counter", label: "сумма зачисления", type: "number", optional: true },
      { key: "category", label: "категория", type: "text", optional: true },
      { key: "merchant", label: "магазин / контрагент", type: "text", optional: true },
      { key: "notes", label: "заметки", type: "textarea", optional: true },
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
      { key: "date", label: "начало", type: "date" },
      { key: "end_date", label: "конец", type: "date", optional: true },
      { key: "kind", label: "тип", type: "text" },
      { key: "detail", label: "описание", type: "textarea", optional: true },
      {
        key: "severity",
        label: "важность",
        type: "select",
        options: ["info", "warning", "danger"],
      },
      { key: "budget_amount", label: "бюджет", type: "number", optional: true },
      { key: "budget_currency", label: "валюта бюджета", type: "select", options: CURRENCY_OPTIONS, optional: true },
      { key: "budget_account", label: "счёт", type: "select", options: DEFAULT_ACCOUNTS, optional: true },
    ],
  },
  session: {
    resource: "sessions",
    title: "Сессия",
    subtitle: (r) => `${r.start || "?"}–${r.end || "?"} · ${r.category || ""}`,
    fields: [
      { key: "date", label: "дата", type: "date" },
      { key: "start", label: "начало", type: "time" },
      { key: "end", label: "конец", type: "time" },
      { key: "category", label: "категория", type: "text" },
      { key: "project", label: "проект", type: "text", optional: true },
      { key: "note", label: "заметка", type: "textarea", optional: true },
      ...EXPENSE_FIELDS,
    ],
  },
  session_event: {
    resource: "session_events",
    title: "Часть сессии",
    subtitle: (r) => `${r.start || "?"}–${r.end || "?"} · ${r.title || r.kind || ""}`,
    fields: [
      { key: "date", label: "дата", type: "date" },
      { key: "start", label: "начало", type: "time" },
      { key: "end", label: "конец", type: "time" },
      { key: "kind", label: "kind", type: "select", options: ["wake", "chores", "transport", "sport", "food", "work", "chill", "reminder", "other"] },
      { key: "title", label: "название", type: "text" },
      { key: "category", label: "category", type: "text", optional: true },
      { key: "sport_type", label: "sport_type", type: "text", optional: true },
      { key: "calories_burned", label: "ккал", type: "number", optional: true },
      { key: "distance_km", label: "дистанция, км", type: "number", optional: true },
      { key: "pace", label: "pace", type: "text", optional: true },
      { key: "notes", label: "заметки", type: "textarea", optional: true },
      ...EXPENSE_FIELDS,
    ],
  },
};

export function getRecordEditorMeta(kind) {
  return KIND_META[kind] || null;
}

export function recordToForm(kind, record, linkedExpense = null, linkedSession = null, finance = []) {
  if (!record) return {};
  const expense = expenseToFormFields(linkedExpense);
  switch (kind) {
    case "meal": {
      const time =
        linkedSession && linkedSession.start != null
          ? trimTime(linkedSession.start)
          : trimTime(record.time);
      const name =
        linkedSession && (linkedSession.project || linkedSession.note)
          ? (linkedSession.project || linkedSession.note || "").trim()
          : record.name || "";
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
        ...expense,
        expense_category: expense.expense_category || "food",
      };
    }
    case "activity":
      return {
        date: record.date || "",
        time: trimTime(record.time),
        type: record.type || "move",
        duration_min: record.duration_min ?? "",
        calories_burned: record.calories_burned ?? "",
        intensity: record.intensity ?? "",
        source: record.source || "",
        notes: record.notes || "",
      };
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
        amount: numOrNull(form.amount) ?? 0,
        currency: form.currency || "VND",
        account: strOrNull(form.account),
        counter_account: txn_type === "transfer" ? strOrNull(form.counter_account) : null,
        amount_counter: txn_type === "transfer" ? numOrNull(form.amount_counter) : null,
        category: strOrNull(form.category) || (txn_type === "transfer" ? "transfer" : null),
        merchant: strOrNull(form.merchant),
        txn_type,
        notes: strOrNull(form.notes),
      };
    }
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
