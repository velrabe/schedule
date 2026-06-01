/** Calendar day detail: column data + auto insights. */

import { aggregateDay, dayHasMorningSport } from "./insightsCompute.js";
import { findSessionOverlapPairs, focusWorkInsightLine } from "./sessionDisplay.js";
import { fmtExpenseShort, financeHumanLabel } from "./sessionFinance.js";
import { isSportSessionCategory } from "./nutritionKcal.js";

export function substancesForDate(date, substances = []) {
  return substances
    .filter((s) => s.date === date)
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

export function substanceRowLabel(sub) {
  const name = sub.name || "substance";
  const amt = sub.amount;
  const unit = sub.unit || "";
  if (amt != null && Number.isFinite(Number(amt))) {
    const n = Number(amt);
    if (n === 0 && (name === "moda" || name === "modafinil")) return "без мода";
    return unit ? `${name} ${n} ${unit}` : `${name} ${n}`;
  }
  return name;
}

export function dayExpenses(date, finance = []) {
  return finance
    .filter((t) => t.date === date && (t.txn_type || "expense") === "expense")
    .sort((a, b) => String(a.time || a.created_at || "").localeCompare(String(b.time || b.created_at || "")));
}

export function expenseRowLabel(txn) {
  const label = financeHumanLabel(txn);
  const amt = fmtExpenseShort(txn);
  return [label, amt].filter(Boolean).join(" · ") || "расход";
}

function fmtH(h) {
  if (!h || h <= 0) return null;
  return `${h.toFixed(h % 1 === 0 ? 0 : 1)}h`;
}

/** kcal vs daily target (not in−out surplus). */
export function kcalGoalLines(kcalIn, kcalOut, kcalTarget) {
  const lines = [];
  const kin = Math.round(kcalIn);
  const target = Math.round(kcalTarget);
  if (kin <= 0 && kcalOut <= 0) return lines;

  const pct = target > 0 ? Math.round((kin / target) * 100) : 0;
  lines.push({
    key: "kcal",
    label: `ккал ${kin} / ${target} (${pct}% цели)`,
    hint: kcalOut > 0 ? `сожжено ${Math.round(kcalOut)}` : null,
  });

  const vsGoal = kin - target;
  if (vsGoal < -50) {
    lines.push({
      key: "kcal_gap",
      label: `недобор ${Math.abs(vsGoal)} до цели`,
      tone: "ok",
    });
  } else if (vsGoal > 50) {
    lines.push({
      key: "kcal_over",
      label: `перебор +${vsGoal} над целью`,
      tone: "warn",
    });
  }

  if (kcalOut > 0 && kin > 0) {
    const net = kin - Math.round(kcalOut);
    lines.push({
      key: "kcal_net",
      label: `нетто in−out ${net >= 0 ? "+" : ""}${net}`,
      hint: null,
    });
  }

  return lines;
}

/** Short automatic notes for the day insights column. */
export function buildCalendarDayInsights({
  date,
  day,
  sessions = [],
  meals = [],
  activities = [],
  substances = [],
  kcalIn = 0,
  kcalOut = 0,
  kcalTarget = 1800,
}) {
  const lines = [];
  const agg = aggregateDay(date, sessions);

  lines.push(...kcalGoalLines(kcalIn, kcalOut, kcalTarget));

  const overlaps = findSessionOverlapPairs(sessions);
  if (overlaps.length > 0) {
    lines.push({
      key: "overlap",
      label: `⚠ пересечение сессий: ${overlaps.length}`,
      hint: overlaps
        .slice(0, 2)
        .map(([a, b]) => `${a.start}–${a.end} × ${b.start}–${b.end}`)
        .join("; "),
      tone: "warn",
    });
  }

  const focusLine = focusWorkInsightLine(date, sessions);
  if (focusLine) lines.push(focusLine);

  const sh = fmtH(agg.sport_h);
  if (sh) lines.push({ key: "sport", label: `спорт ${sh}` });

  const ch = fmtH(agg.chill_h);
  if (ch && agg.chill_h >= 1) lines.push({ key: "chill", label: `chill ${ch}` });

  if (dayHasMorningSport(date, sessions)) {
    lines.push({ key: "morning_sport", label: "утренний спорт" });
  }

  const scoobyN = substances.filter((s) => s.date === date && s.name === "scooby").length;
  if (scoobyN > 0) {
    lines.push({ key: "scooby", label: `скуби ×${scoobyN}` });
  }

  if (day?.modafinil_mg > 0) {
    lines.push({ key: "moda", label: `мода ${day.modafinil_mg} mg (день)` });
  }

  if (day?.day_type === "burnout") {
    lines.push({ key: "burnout", label: "тип дня: burnout", tone: "warn" });
  }

  const sportSessions = sessions.filter(
    (s) => s.date === date && isSportSessionCategory(s.category),
  );
  if (sportSessions.length >= 2) {
    lines.push({ key: "sport_multi", label: `${sportSessions.length} спорт-сессии` });
  }

  return lines;
}
