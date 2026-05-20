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
  return {
    ...meal,
    session_id: session.id,
    date: session.date,
    time: trimTime(session.start),
    slot: inferMealSlotFromSession(session),
    name: (session.project || session.note || meal.name || "еда").trim() || "еда",
    notes: session.note ?? meal.notes ?? null,
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

    out.push(syntheticMealFromSession(s));
  }

  return sortMeals(out);
}

export function mealCountForNutrition(sessions = [], meals = []) {
  return mergeMealsWithFoodSessions(sessions, meals).length;
}

export function mealHasMacroData(meal) {
  return (
    Number(meal?.kcal) > 0 ||
    Number(meal?.protein_g) > 0 ||
    Number(meal?.fat_g) > 0 ||
    Number(meal?.carbs_g) > 0
  );
}
