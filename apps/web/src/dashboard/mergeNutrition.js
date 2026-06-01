/** Merge food sessions ↔ meals for nutrition UI. Display: meals.slot + meals.name (not session titles). */

export const MEAL_SLOTS_ORDER = ["breakfast", "lunch", "dinner", "snack"];

export const MEAL_SLOT_LABEL_RU = {
  breakfast: "завтрак",
  lunch: "обед",
  dinner: "ужин",
  snack: "перекус",
};

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

/** Canonical slot for a meal row (DB `meals.slot` wins over time heuristic). */
export function normalizeMealSlot(meal) {
  const s = String(meal?.slot || "").toLowerCase();
  if (MEAL_SLOTS_ORDER.includes(s)) return s;
  const t = trimTime(meal?.time);
  const h = Number(t.split(":")[0]) || 12;
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 11 && h < 16) return "lunch";
  if (h >= 17 && h < 22) return "dinner";
  return "snack";
}

/** Title in nutrition columns — never phase/session envelope names when meal.name exists. */
export function displayMealName(meal) {
  if (!meal) return "—";
  const name = String(meal.name || "").trim();
  if (!name) return "—";
  if (!meal._synthetic) return name;
  if (mealHasMacroData(meal)) return name;
  if (name.length > 56 || /\+|чилл|chill|routine|фаза|пробуждение/i.test(name)) return "—";
  return name;
}

function mealPickScore(m) {
  let s = 0;
  if (mealHasMacroData(m)) s += 100;
  if (String(m.name || "").trim()) s += 10;
  if (!m._synthetic) s += 5;
  return s;
}

/**
 * Four fixed slots per day; each filled from meals with matching `slot` (or time fallback).
 * @returns {{ slot: string, meal: object | null }[]}
 */
export function buildDayMealSlots(mealsForDate = []) {
  const bucket = Object.fromEntries(MEAL_SLOTS_ORDER.map((slot) => [slot, null]));
  for (const m of mealsForDate) {
    if (m._synthetic && !mealHasMacroData(m)) continue;
    const slot = normalizeMealSlot(m);
    const cur = bucket[slot];
    if (!cur || mealPickScore(m) > mealPickScore(cur)) bucket[slot] = m;
  }
  return MEAL_SLOTS_ORDER.map((slot) => ({ slot, meal: bucket[slot] }));
}

/** Enrich DB meals for a calendar day (no synthetic session cards). */
export function mealsForNutritionDay(date, sessions = [], mealsRaw = []) {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const dayRaw = mealsRaw.filter((m) => m.date === date);
  const enriched = dayRaw.map((m) => {
    const sess = m.session_id && sessionById.get(m.session_id);
    return sess && isFoodSession(sess) ? enrichMealFromSession(m, sess) : m;
  });
  return buildDayMealSlots(enriched);
}

export function sortMeals(meals) {
  return [...meals].sort((a, b) => {
    const sa = SLOT_ORDER[a.slot] ?? 9;
    const sb = SLOT_ORDER[b.slot] ?? 9;
    if (sa !== sb) return sa - sb;
    return String(a.time || "").localeCompare(String(b.time || ""));
  });
}

function sessionLabel(s) {
  return `${s.project || ""} ${s.note || ""}`.trim().toLowerCase();
}

function mealLabel(m) {
  return `${m.name || ""} ${m.notes || ""}`.trim().toLowerCase();
}

/** Match orphan meal row to a food session (same day, slot or name). */
export function orphanMealMatchesSession(meal, session) {
  if (!meal || meal.session_id) return false;
  if (!isFoodSession(session)) return false;
  if (meal.date !== session.date) return false;

  const slot = inferMealSlotFromSession(session);
  if (meal.slot && meal.slot === slot) return true;

  const mn = mealLabel(meal);
  const sn = sessionLabel(session);
  if (!mn && !sn) return true;
  if (mn && sn && (mn === sn || mn.includes(sn) || sn.includes(mn))) return true;

  const mt = trimTime(meal.time);
  const st = trimTime(session.start);
  if (mt && st && mt === st) return true;

  return false;
}

/** Find linked or heuristic-matched food session for a meal row. */
export function findFoodSessionForMeal(meal, sessions = []) {
  if (!meal) return null;
  if (meal.session_id) {
    const linked = sessions.find((s) => s.id === meal.session_id);
    if (linked && isFoodSession(linked)) return linked;
  }
  for (const s of sessions) {
    if (orphanMealMatchesSession(meal, s)) return s;
  }
  return null;
}

/** Overlay session schedule onto a meal row for display/edit. */
export function enrichMealFromSession(meal, session) {
  if (!session || !isFoodSession(session)) return meal;
  const keepName = String(meal.name || "").trim();
  return {
    ...meal,
    session_id: meal.session_id || session.id,
    date: meal.date || session.date,
    time: meal.time || trimTime(session.start_time || session.start),
    slot:
      meal.slot && MEAL_SLOTS_ORDER.includes(String(meal.slot).toLowerCase())
        ? meal.slot
        : inferMealSlotFromSession(session),
    name: keepName || (session.project || session.note || "еда").trim() || "еда",
    notes: meal.notes ?? session.note ?? null,
  };
}

function syntheticMealFromSession(s) {
  return {
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
  };
}

/**
 * One row per food session: DB meal if present, else synthetic.
 * Orphan meals without session_id are merged onto matching food sessions.
 */
export function mergeMealsWithFoodSessions(sessions = [], meals = []) {
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const linkedSessionIds = new Set();
  const out = [];

  for (const m of meals) {
    if (m.session_id && sessionById.has(m.session_id)) {
      linkedSessionIds.add(m.session_id);
      out.push(enrichMealFromSession(m, sessionById.get(m.session_id)));
      continue;
    }
    out.push(m);
  }

  for (const s of sessions) {
    if (!isFoodSession(s)) continue;
    if (linkedSessionIds.has(s.id)) continue;

    const orphanIdx = out.findIndex(
      (m) => !m.session_id && !m._synthetic && orphanMealMatchesSession(m, s),
    );
    if (orphanIdx >= 0) {
      const orphan = out.splice(orphanIdx, 1)[0];
      linkedSessionIds.add(s.id);
      out.push(enrichMealFromSession(orphan, s));
      continue;
    }

    // No synthetic cards: nutrition UI uses meals.slot + meals.name only.
  }

  return sortMeals(out.filter((m) => !m._synthetic || mealHasMacroData(m)));
}

export function mealCountForNutrition(sessions = [], meals = []) {
  return meals.filter((m) => mealHasMacroData(m) || String(m.name || "").trim()).length;
}

export function mealHasMacroData(meal) {
  return (
    Number(meal?.kcal) > 0 ||
    Number(meal?.protein_g) > 0 ||
    Number(meal?.fat_g) > 0 ||
    Number(meal?.carbs_g) > 0
  );
}
