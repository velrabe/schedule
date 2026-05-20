/** Merge food sessions ↔ meals for nutrition UI (sessions are source of truth). */

export function isFoodSession(s) {
  const c = (s.category || "").toLowerCase();
  return c === "food";
}

function trimTime(t) {
  if (!t) return "";
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export function inferMealSlotFromSession(s) {
  const text = `${s.project || ""} ${s.note || ""}`.toLowerCase();
  if (/breakfast|завтрак/.test(text)) return "breakfast";
  if (/lunch|обед/.test(text)) return "lunch";
  if (/dinner|ужин/.test(text)) return "dinner";
  if (/snack|снек|перекус/.test(text)) return "snack";
  const t = trimTime(s.start) || "12:00";
  const h = Number(t.split(":")[0]) || 12;
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

const SLOT_ORDER = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

export function sortMeals(meals) {
  return [...meals].sort((a, b) => {
    const sa = SLOT_ORDER[a.slot] ?? 9;
    const sb = SLOT_ORDER[b.slot] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.time || "").localeCompare(String(b.time || ""));
  });
}

/** One row per food session: DB meal if present, else synthetic until sync/backfill. */
export function mergeMealsWithFoodSessions(sessions = [], meals = []) {
  const linked = new Set();
  for (const m of meals) {
    if (m.session_id) linked.add(m.session_id);
  }

  const out = [...meals];
  for (const s of sessions) {
    if (!isFoodSession(s)) continue;
    if (linked.has(s.id)) continue;
    out.push({
      id: `session:${s.id}`,
      session_id: s.id,
      date: s.date,
      time: trimTime(s.start),
      slot: inferMealSlotFromSession(s),
      name: (s.project || s.note || "еда").trim() || "еда",
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      portion_grams: null,
      confidence: null,
      notes: s.note || null,
      photo_url: null,
      _synthetic: true,
    });
  }
  return sortMeals(out);
}

export function mealCountForNutrition(sessions = [], meals = []) {
  return mergeMealsWithFoodSessions(sessions, meals).length;
}
