import { isSportSessionCategory } from "./nutritionKcal.js";

/** Rolling window for NEAT/sport → PAL multiplier. */
export const ACTIVITY_WINDOW_DAYS = 7;

/**
 * Sport hours on a calendar day from session categories.
 */
export function sportHoursOnDate(date, sessions = []) {
  let min = 0;
  for (const s of sessions) {
    if (s.date !== date) continue;
    if (!isSportSessionCategory(s.category)) continue;
    min += Number(s.min) || 0;
  }
  return min / 60;
}

/**
 * Sum sport hours in [endDate - windowDays + 1, endDate].
 */
export function rollingSportHours(endDate, sessions = [], windowDays = ACTIVITY_WINDOW_DAYS) {
  if (!endDate) return 0;
  const end = new Date(`${endDate}T12:00:00Z`);
  let total = 0;
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - (windowDays - 1 - i));
    const iso = d.toISOString().slice(0, 10);
    total += sportHoursOnDate(iso, sessions);
  }
  return total;
}

/**
 * PAL-style multiplier from weekly sport volume (sessions in DB).
 * Sedentary week → lower TDEE; heavy sport week → up to ~1.85.
 */
export function activityFactorFromSportHours(sportHoursPerWeek) {
  const h = Number(sportHoursPerWeek) || 0;
  if (h < 0.5) return 1.32;
  if (h < 2) return 1.42;
  if (h < 5) return 1.52;
  if (h < 9) return 1.62;
  if (h < 14) return 1.72;
  return 1.82;
}

export function activityFactorLabel(factor) {
  const f = Number(factor) || 1.32;
  if (f < 1.38) return "низкая (мало спорта)";
  if (f < 1.5) return "умеренная";
  if (f < 1.65) return "активная";
  if (f < 1.75) return "высокая";
  return "очень высокая";
}
