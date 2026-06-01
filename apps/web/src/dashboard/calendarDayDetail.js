/** Calendar day detail: column data + auto insights. */

import { aggregateDay, dayHasMorningSport } from "./insightsCompute.js";
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
  const balance = kcalIn - kcalOut;

  if (kcalIn > 0 || kcalOut > 0) {
    const pct = kcalTarget > 0 ? Math.round((kcalIn / kcalTarget) * 100) : 0;
    lines.push({
      key: "kcal",
      label: `ккал in ${Math.round(kcalIn)} (${pct}% цели)`,
      hint: kcalOut > 0 ? `out ${Math.round(kcalOut)}` : null,
    });
    if (balance !== 0) {
      lines.push({
        key: "balance",
        label: balance > 0 ? `профицит +${Math.round(balance)}` : `дефицит ${Math.round(balance)}`,
        tone: balance > 0 ? "warn" : "ok",
      });
    }
  }

  const bh = fmtH(agg.business_h);
  if (bh) {
    const parts = [];
    if (agg.work_paid_h > 0) parts.push(`paid ${fmtH(agg.work_paid_h)}`);
    if (agg.personal_h > 0) parts.push(`personal ${fmtH(agg.personal_h)}`);
    if (agg.byt_h > 0) parts.push(`byt ${fmtH(agg.byt_h)}`);
    lines.push({ key: "work", label: `работа ${bh}`, hint: parts.join(" · ") || null });
  }

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
