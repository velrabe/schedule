/** Human-readable semi-JSON day summary for Kanban copy button. */

import { findActivityForEvent, metricsFromActivity } from "./activityMetrics.js";
import {
  childEventsForSession,
  expensesForSession,
  expensesForSessionEvent,
  fmtExpensesShort,
  linkedEventLabel,
} from "./sessionFinance.js";
import { fmtMoney } from "./financeDisplay.js";
import { toRub, FX_RUB_PER_UNIT } from "./financeInsights.js";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dowOf(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return DOW[d.getUTCDay()] ?? "?";
}

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function formatSubstanceShort(s) {
  const name = s.name || "substance";
  const amt = s.amount;
  const unit = (s.unit || "").trim();
  if (amt != null && Number.isFinite(Number(amt))) {
    const n = Number(amt);
    if (n === 0 && (name === "moda" || name === "modafinil")) return "без мода";
    return unit ? `${name} ${n}${unit}` : `${name} ${n}`;
  }
  return name;
}

function substancesForDate(date, substances = [], day) {
  const rows = substances.filter((s) => s.date === date);
  const parts = rows.map(formatSubstanceShort);
  if (!parts.length && day?.modafinil_mg > 0) {
    parts.push(`moda ${day.modafinil_mg}mg`);
  }
  return parts.join(", ");
}

function formatMealMacros(meal) {
  if (!meal) return "";
  const k = Math.round(Number(meal.kcal) || 0);
  const c = meal.carbs_g != null ? Math.round(Number(meal.carbs_g)) : null;
  const p = meal.protein_g != null ? Math.round(Number(meal.protein_g)) : null;
  const f = meal.fat_g != null ? Math.round(Number(meal.fat_g)) : null;
  const macro =
    c != null && p != null && f != null ? ` C${c} P${p} F${f}` : "";
  return k > 0 ? `${k} kcal${macro}` : macro.trim() || "";
}

function formatActivityMeta(act) {
  if (!act) return "";
  const burn = Math.round(Number(act.calories_burned) || 0);
  const dist = act.distance_km != null ? Number(act.distance_km) : null;
  const dur = act.duration_min != null ? `${act.duration_min}m` : "";
  const bits = [];
  if (burn > 0) bits.push(`${burn} kcal`);
  if (Number.isFinite(dist) && dist > 0) bits.push(`${dist} km`);
  if (dur) bits.push(dur);
  const type = act.type || act.source || "activity";
  if (bits.length) return `${type}: ${bits.join(" ")}`;
  return type;
}

function mealForEvent(ev, meals = [], sessions = []) {
  if (ev.meal_id) return meals.find((m) => m.id === ev.meal_id) ?? null;
  if (ev.session_id) {
    return meals.find((m) => m.session_id === ev.session_id) ?? null;
  }
  return null;
}

function formatPartMeta(ev, meals, activities, finance, sessions) {
  const meta = [];
  const meal = mealForEvent(ev, meals, sessions);
  if (meal) {
    const m = formatMealMacros(meal);
    if (m) meta.push(m);
  }
  const act = findActivityForEvent(ev, activities);
  const am = act ? metricsFromActivity(act) : {};
  const kcal = ev.calories_burned != null && Number(ev.calories_burned) > 0
    ? Math.round(Number(ev.calories_burned))
    : am.calories_burned != null
    ? Math.round(am.calories_burned)
    : null;
  const km = ev.distance_km != null && Number(ev.distance_km) > 0
    ? Number(ev.distance_km)
    : am.distance_km;
  if (kcal != null) meta.push(`${kcal} kcal`);
  if (km != null && km > 0) meta.push(`${km} km`);
  if (act) {
    const a = formatActivityMeta(act);
    if (a && !meta.length) meta.push(a);
  }
  if (am.pace && !meta.includes(am.pace)) meta.push(am.pace);
  const exp = expensesForSessionEvent(ev.id, finance);
  if (exp.length) meta.push(fmtExpensesShort(exp));
  return meta;
}

function formatPartLine(ev, meals, activities, finance, sessions) {
  const label = linkedEventLabel(ev, finance);
  const meta = formatPartMeta(ev, meals, activities, finance, sessions);
  return meta.length ? `${label} | ${meta.join(" · ")}` : label;
}

function formatSessionFallback(s, meals, activities, finance) {
  const meta = [];
  if ((s.category || "").toLowerCase() === "food" || s.category === "food") {
    const meal = meals.find((m) => m.session_id === s.id);
    const m = formatMealMacros(meal);
    if (m) meta.push(m);
  }
  const exp = expensesForSession(s.id, finance);
  if (exp.length) meta.push(fmtExpensesShort(exp));
  if (s.note) meta.push(s.note);
  return meta.length ? meta.join(" · ") : "";
}

function daySpendLines(finance, date) {
  const txns = (finance || []).filter(
    (t) => t.date === date && (t.txn_type || "expense").toLowerCase() === "expense",
  );
  if (!txns.length) return { byCurrency: "", rub: 0 };
  const byCur = new Map();
  let rub = 0;
  for (const t of txns) {
    const cur = t.currency || "VND";
    const amt = Number(t.amount) || 0;
    byCur.set(cur, (byCur.get(cur) || 0) + amt);
    rub += toRub(amt, cur, FX_RUB_PER_UNIT);
  }
  const byCurrency = [...byCur.entries()]
    .map(([c, a]) => fmtMoney(a, c))
    .join(" + ");
  return { byCurrency, rub: Math.round(rub) };
}

/**
 * @param {object} opts
 * @param {string} opts.date
 * @param {object} [opts.day]
 * @param {object[]} [opts.sessions]
 * @param {object[]} [opts.sessionEvents]
 * @param {object[]} [opts.meals]
 * @param {object[]} [opts.activities]
 * @param {object[]} [opts.substances]
 * @param {object[]} [opts.finance]
 * @param {(start: string, wake: string) => number} [opts.wakeRelativeMin]
 */
export function formatKanbanDayCopy({
  date,
  day,
  sessions = [],
  sessionEvents = [],
  meals = [],
  activities = [],
  substances = [],
  finance = [],
  wakeRelativeMin,
}) {
  const lines = [];
  const dow = day?.dow || dowOf(date);
  const subs = substancesForDate(date, substances, day);
  lines.push(subs ? `${date}, ${dow} (${subs})` : `${date}, ${dow}`);

  const list = sessions.filter((s) => s.date === date);
  const sorted = day && wakeRelativeMin
    ? [...list].sort(
        (a, b) => wakeRelativeMin(a.start, day.wake || "00:00") - wakeRelativeMin(b.start, day.wake || "00:00"),
      )
    : [...list].sort((a, b) => String(a.start).localeCompare(String(b.start)));

  if (!sorted.length) {
    lines.push("  (сессий нет)");
  }

  for (const s of sorted) {
    const head = `${s.start}–${s.end} ${s.category}${s.project ? ` · ${s.project}` : ""}`;
    lines.push(head);
    const parts = childEventsForSession(s.id, sessionEvents, s.start || s.start_time);
    if (parts.length) {
      for (const p of parts) {
        lines.push(`  · ${formatPartLine(p, meals, activities, finance, sessions)}`);
      }
    } else {
      const fb = formatSessionFallback(s, meals, activities, finance);
      if (fb) lines.push(`  · ${fb}`);
      else if (s.note) lines.push(`  · ${s.note}`);
    }
  }

  const kcalIn = meals
    .filter((m) => m.date === date)
    .reduce((a, m) => a + (Number(m.kcal) || 0), 0);
  const kcalOut = activities
    .filter((x) => x.date === date)
    .reduce((a, x) => a + (Number(x.calories_burned) || 0), 0);
  const balance = Math.round(kcalIn - kcalOut);
  lines.push("");
  lines.push(
    `ккал: +${Math.round(kcalIn)} −${Math.round(kcalOut)} = ${balance}`,
  );

  const spend = daySpendLines(finance, date);
  if (spend.byCurrency) {
    lines.push(`траты: ${spend.byCurrency} (~${spend.rub.toLocaleString("ru-RU")} ₽)`);
  } else {
    lines.push("траты: —");
  }

  return lines.join("\n");
}

export async function copyTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
