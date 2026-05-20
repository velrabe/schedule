/** Field specs and form ↔ DB mapping for RecordEditDrawer. */

export const MEAL_SLOTS = ["breakfast", "lunch", "dinner", "snack"];
export const CONFIDENCE_OPTIONS = ["high", "medium", "low"];
export const ACTIVITY_TYPES = ["move", "walking", "run", "sport", "gym", "other"];

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
    ],
  },
  activity: {
    resource: "activities",
    title: "Активность",
    subtitle: (r) => r.type || r.id,
    fields: [
      { key: "date", label: "дата", type: "date" },
      { key: "time", label: "время", type: "time", optional: true },
      { key: "type", label: "тип", type: "select", options: ACTIVITY_TYPES },
      { key: "duration_min", label: "длительность, мин", type: "number" },
      { key: "calories_burned", label: "ккал сожжено", type: "number" },
      { key: "intensity", label: "интенсивность", type: "number", optional: true },
      { key: "source", label: "источник", type: "text", optional: true },
      { key: "notes", label: "заметки", type: "textarea" },
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
    ],
  },
};

export function getRecordEditorMeta(kind) {
  return KIND_META[kind] || null;
}

export function recordToForm(kind, record) {
  if (!record) return {};
  switch (kind) {
    case "meal":
      return {
        date: record.date || "",
        time: trimTime(record.time),
        slot: record.slot || "",
        name: record.name || "",
        kcal: record.kcal ?? "",
        carbs_g: record.carbs_g ?? "",
        protein_g: record.protein_g ?? "",
        fat_g: record.fat_g ?? "",
        portion_grams: record.portion_grams ?? "",
        confidence: record.confidence || "",
        notes: record.notes || "",
      };
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
