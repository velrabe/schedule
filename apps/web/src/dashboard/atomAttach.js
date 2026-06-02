/** Attach meals / substances to a session_event (atom) from the drawer. */

import { normalizeMealSlot } from "./mergeNutrition.js";
import { expenseFromForm } from "./sessionFinance.js";
import { manualPatch } from "./manualSave.js";

export const ATOM_LINK_PREFIX = "atom:";

export function atomLinkNote(eventId) {
  return `${ATOM_LINK_PREFIX}${eventId}`;
}

export function parseAtomLinkFromNotes(notes) {
  const m = String(notes || "").match(/atom:([0-9a-f-]{36})/i);
  return m?.[1] || null;
}

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

export function defaultSubstanceAttachForm(ev) {
  return {
    date: ev.date || "",
    time: trimTime(ev.start_time || ev.start) || "",
    name: "caffeine",
    amount: "",
    unit: "",
  };
}

export function defaultMealAttachForm(ev) {
  const slot = normalizeMealSlot({
    date: ev.date,
    time: trimTime(ev.start_time || ev.start),
    slot: ev.meal_slot,
  });
  return {
    date: ev.date || "",
    time: trimTime(ev.start_time || ev.start) || "",
    slot,
    name: (ev.title || "").trim() || "",
    kcal: "",
    protein_g: "",
    carbs_g: "",
    fat_g: "",
    expense_amount: "",
    expense_currency: "VND",
    expense_account: "vcb_vnd",
    expense_category: "food",
    expense_merchant: "",
    expense_notes: "",
  };
}

export async function attachSubstanceToAtom(eventId, form) {
  const { insertRow, notifyDataChanged } = await import("../api/manual");
  const amount =
    form.amount === "" || form.amount == null ? null : Number(form.amount);
  await insertRow("substances", {
    date: form.date,
    time: form.time || null,
    name: form.name || "caffeine",
    amount: Number.isFinite(amount) ? amount : null,
    unit: form.unit || null,
    notes: atomLinkNote(eventId),
  });
  notifyDataChanged();
}

export const SUBSTANCE_ATTACH_FIELDS = [
  { key: "date", label: "дата", type: "date" },
  { key: "time", label: "время", type: "time" },
  {
    key: "name",
    label: "name",
    type: "select",
    options: ["moda", "scooby", "caffeine", "alcohol", "weed"],
  },
  { key: "amount", label: "количество", type: "number", optional: true },
  { key: "unit", label: "ед.", type: "text", optional: true },
];

export const MEAL_ATTACH_FIELDS = [
  { key: "date", label: "дата", type: "date" },
  { key: "time", label: "время", type: "time" },
  {
    key: "slot",
    label: "слот",
    type: "select",
    options: ["breakfast", "lunch", "dinner", "snack"],
  },
  { key: "name", label: "название", type: "text" },
  { key: "kcal", label: "ккал", type: "number", optional: true },
  { key: "carbs_g", label: "углеводы, г", type: "number", optional: true },
  { key: "protein_g", label: "белок, г", type: "number", optional: true },
  { key: "fat_g", label: "жир, г", type: "number", optional: true },
  { key: "expense_amount", label: "стоимость", type: "number", optional: true },
  { key: "expense_currency", label: "валюта", type: "select", options: ["VND", "RUB", "USD"], optional: true },
  { key: "expense_account", label: "счёт", type: "select", options: ["cash_vnd", "vcb_vnd", "savings_rub", "ip_rub"], optional: true },
  { key: "expense_category", label: "категория расхода", type: "text", optional: true },
  { key: "expense_merchant", label: "merchant", type: "text", optional: true },
  { key: "expense_notes", label: "заметки расхода", type: "textarea", optional: true },
];

export function defaultActivityAttachForm(ev) {
  const cat = (ev.category || "").replace(/^sport_/, "");
  const dur = ev.duration_min != null ? Number(ev.duration_min) : null;
  let duration_min = "";
  if (Number.isFinite(dur) && dur > 0) {
    duration_min = dur;
  } else if (ev.start_time && ev.end_time) {
    const [sh, sm] = String(ev.start_time).slice(0, 5).split(":").map(Number);
    const [eh, em] = String(ev.end_time).slice(0, 5).split(":").map(Number);
    const span = (eh * 60 + em) - (sh * 60 + sm);
    if (span > 0) duration_min = span;
  }
  return {
    date: ev.date || "",
    time: trimTime(ev.start_time || ev.start) || "",
    type: ev.sport_type || cat || "sport",
    duration_min,
    calories_burned: ev.calories_burned ?? "",
    distance_km: ev.distance_km ?? "",
    pace: ev.pace || "",
    source: "manual",
  };
}

export const ACTIVITY_ATTACH_FIELDS = [
  { key: "date", label: "дата", type: "date" },
  { key: "time", label: "время", type: "time" },
  { key: "type", label: "тип", type: "text" },
  { key: "duration_min", label: "длительность, мин", type: "number" },
  { key: "calories_burned", label: "ккал", type: "number", optional: true },
  { key: "distance_km", label: "дистанция, км", type: "number", optional: true },
  { key: "pace", label: "темп", type: "text", optional: true },
  { key: "source", label: "источник", type: "text", optional: true },
];

export async function attachActivityToAtom(event, form) {
  const { insertRow, notifyDataChanged } = await import("../api/manual");
  const num = (k) => {
    const v = form[k];
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const res = await insertRow("activities", {
    date: form.date,
    time: form.time || null,
    type: form.type || "sport",
    duration_min: num("duration_min"),
    calories_burned: num("calories_burned"),
    distance_km: num("distance_km"),
    pace: form.pace || null,
    source: form.source || "manual",
    notes: atomLinkNote(event.id),
  });
  const activityId = res?.row?.id;
  if (!activityId) throw new Error("activity_insert_failed");
  await manualPatch("session_events", event.id, { activity_id: activityId });
  notifyDataChanged();
  return activityId;
}

export async function attachMealToAtom(event, form) {
  const { insertRow, notifyDataChanged } = await import("../api/manual");
  const num = (k) => {
    const v = form[k];
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const res = await insertRow("meals", {
    date: form.date,
    time: form.time || null,
    slot: form.slot || "snack",
    name: form.name || "еда",
    kcal: num("kcal"),
    protein_g: num("protein_g"),
    carbs_g: num("carbs_g"),
    fat_g: num("fat_g"),
    session_id: null,
    notes: atomLinkNote(event.id),
  });
  const mealId = res?.row?.id;
  if (!mealId) throw new Error("meal_insert_failed");

  const expense = expenseFromForm(form);
  await manualPatch(
    "session_events",
    event.id,
    { meal_id: mealId },
    expense ? { expense } : {},
  );
  notifyDataChanged();
  return mealId;
}
