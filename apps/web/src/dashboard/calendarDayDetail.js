/** Calendar day detail: column data + auto insights. */

import { aggregateDay, dayHasMorningSport, focusWorkInsightLine } from "./insightsCompute.js";
import { findSessionOverlapPairs, sessionOverlapLabel } from "./sessionDisplay.js";
import { fmtExpenseShort, financeHumanLabel } from "./sessionFinance.js";
import { sportHoursFromEvents } from "./sportDuration.js";
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

/** kcal vs daily target (нетто = in − out сравнивается с целью). */
export function kcalGoalLines(kcalIn, kcalOut, kcalTarget) {
  const lines = [];
  const kin = Math.round(kcalIn);
  const kout = Math.round(kcalOut);
  const target = Math.round(kcalTarget);
  const net = kin - kout;
  if (kin <= 0 && kout <= 0) return lines;

  const pct = target > 0 ? Math.round((net / target) * 100) : 0;
  lines.push({
    key: "kcal",
    label: kout > 0
      ? `ккал ${kin} in − ${kout} out = ${net} / ${target} (${pct}% цели)`
      : `ккал ${kin} / ${target} (${pct}% цели)`,
    hint: null,
  });

  const vsGoal = net - target;
  if (vsGoal < -50) {
    lines.push({
      key: "kcal_gap",
      label: `до цели ${Math.abs(vsGoal)} (нетто)`,
      tone: "ok",
    });
  } else if (vsGoal > 50) {
    lines.push({
      key: "kcal_over",
      label: `перебор +${vsGoal} над целью (нетто)`,
      tone: "warn",
    });
  }

  return lines;
}

/** Short automatic notes for the day insights column. */
export function buildCalendarDayInsights({
  date,
  day,
  sessions = [],
  sessionEvents = [],
  meals = [],
  activities = [],
  substances = [],
  kcalIn = 0,
  kcalOut = 0,
  kcalTarget = 1800,
}) {
  const lines = [];
  const agg = aggregateDay(date, sessions, sessionEvents);

  lines.push(...kcalGoalLines(kcalIn, kcalOut, kcalTarget));

  const overlaps = findSessionOverlapPairs(sessions, day?.wake || "06:00");
  if (overlaps.length > 0) {
    lines.push({
      key: "overlap",
      label: `⚠ пересечение сессий: ${overlaps.length}`,
      hint: overlaps
        .slice(0, 2)
        .map(
          ([a, b]) =>
            `${sessionOverlapLabel(a)} ${a.start}–${a.end} × ${sessionOverlapLabel(b)} ${b.start}–${b.end}`,
        )
        .join("; "),
      tone: "warn",
    });
  }

  const focusLine = focusWorkInsightLine(date, sessions, sessionEvents);
  if (focusLine) lines.push(focusLine);

  const sportH = sportHoursFromEvents(date, sessionEvents);
  const sh = fmtH(sportH);
  if (sh) lines.push({ key: "sport", label: `спорт ${sh}` });

  const ch = fmtH(agg.chill_h);
  if (ch && agg.chill_h >= 1) lines.push({ key: "chill", label: `chill ${ch}` });

  if (dayHasMorningSport(date, sessions, sessionEvents)) {
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
