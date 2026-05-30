import {
  bmrMifflinStJeor,
  bmi,
  estimateBfPct,
  fatMassKg,
  estimateMuscleMassKg,
  isVerifiedSource,
} from "./bodyProfile.js";
import {
  ACTIVITY_WINDOW_DAYS,
  activityFactorFromSportHours,
  rollingSportHours,
} from "./bodyActivity.js";

const METRIC_KEYS = ["weight_kg", "bf_pct", "fat_mass_kg", "muscle_mass_kg"];

function metricPriority(sourceType) {
  if (sourceType === "device") return 3;
  if (sourceType === "measured") return 2;
  return 1;
}

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function rowsAtStamp(rows, date, time) {
  const t = trimTime(time);
  return rows.filter((r) => r.date === date && trimTime(r.time) === t);
}

function pickMetricAt(rows, metric, date, time) {
  const at = rowsAtStamp(rows, date, time);
  const list = at.filter((r) => r.metric === metric);
  if (!list.length) {
    const dayList = rows.filter((r) => r.date === date && r.metric === metric);
    if (!dayList.length) return null;
    return dayList.sort((a, b) => metricPriority(b.source_type) - metricPriority(a.source_type))[0];
  }
  return list.sort((a, b) => metricPriority(b.source_type) - metricPriority(a.source_type))[0];
}

function sortKey(date, time) {
  return `${date}T${trimTime(time) || "00:00"}`;
}

/**
 * One chart point per weigh-in (body_metrics weight_kg or days.weight_kg fallback).
 */
export function buildBodyTimeline({ days = [], body_metrics = [], sessions = [] }) {
  const weighIns = [];

  for (const m of body_metrics) {
    if (m.metric !== "weight_kg") continue;
    const w = Number(m.value);
    if (!Number.isFinite(w) || w <= 0) continue;
    weighIns.push({
      date: m.date,
      time: trimTime(m.time),
      weight_kg: w,
      weight_source: m.source_type || "estimated",
      metric_id: m.id,
    });
  }

  const daysWithWeight = new Set(weighIns.map((w) => w.date));
  for (const d of days) {
    if (daysWithWeight.has(d.date)) continue;
    const w = Number(d.weight_kg);
    if (!Number.isFinite(w) || w <= 0) continue;
    weighIns.push({
      date: d.date,
      time: "",
      weight_kg: w,
      weight_source: "measured",
      metric_id: null,
    });
  }

  weighIns.sort((a, b) => sortKey(a.date, a.time).localeCompare(sortKey(b.date, b.time)));

  const points = weighIns.map((wi) => {
    const bfRow = pickMetricAt(body_metrics, "bf_pct", wi.date, wi.time);
    const fatRow = pickMetricAt(body_metrics, "fat_mass_kg", wi.date, wi.time);
    const muscleRow = pickMetricAt(body_metrics, "muscle_mass_kg", wi.date, wi.time);

    let bfPct = bfRow ? Number(bfRow.value) : null;
    let bfSource = bfRow?.source_type || "estimated";
    if (bfPct == null || !Number.isFinite(bfPct)) {
      bfPct = estimateBfPct(wi.weight_kg);
      bfSource = "estimated";
    }

    let fatKg = fatRow ? Number(fatRow.value) : null;
    let fatSource = fatRow?.source_type || "estimated";
    if (fatKg == null || !Number.isFinite(fatKg)) {
      fatKg = fatMassKg(wi.weight_kg, bfPct);
      fatSource = "estimated";
    }

    let muscleKg = muscleRow ? Number(muscleRow.value) : null;
    let muscleSource = muscleRow?.source_type || "estimated";
    if (muscleKg == null || !Number.isFinite(muscleKg)) {
      muscleKg = estimateMuscleMassKg(wi.weight_kg);
      muscleSource = "estimated";
    }

    const sport7 = rollingSportHours(wi.date, sessions, ACTIVITY_WINDOW_DAYS);
    const activityFactor = activityFactorFromSportHours(sport7);
    const bmr = bmrMifflinStJeor(wi.weight_kg);
    const tdee = bmr != null ? bmr * activityFactor : null;

    return {
      date: wi.date,
      time: wi.time,
      pointKey: sortKey(wi.date, wi.time),
      weight_kg: wi.weight_kg,
      weight_verified: isVerifiedSource(wi.weight_source),
      bf_pct: bfPct,
      bf_verified: isVerifiedSource(bfSource),
      fat_mass_kg: fatKg,
      fat_verified: isVerifiedSource(fatSource),
      muscle_mass_kg: muscleKg,
      muscle_verified: isVerifiedSource(muscleSource),
      bmi: bmi(wi.weight_kg),
      bmr_kcal: bmr,
      activity_factor: activityFactor,
      sport_h_7d: sport7,
      tdee_kcal: tdee,
    };
  });

  const latestWeight = points.length ? points[points.length - 1].weight_kg : null;
  const latestPoint = points.length ? points[points.length - 1] : null;

  return { points, latestWeight, latestPoint };
}

export function buildActivityInsight(points, sessions = []) {
  if (!points.length) return null;
  const last = points[points.length - 1];
  const sport7 = last.sport_h_7d ?? 0;
  const factor = last.activity_factor ?? 1.32;
  const prevWeekDate = addDaysISO(last.date, -7);
  const prevSport = rollingSportHours(prevWeekDate, sessions, ACTIVITY_WINDOW_DAYS);
  const prevFactor = activityFactorFromSportHours(prevSport);
  const delta = factor - prevFactor;
  if (Math.abs(delta) < 0.04 && sport7 < 1) {
    return `За ${ACTIVITY_WINDOW_DAYS} дн. почти нет sport-сессий → активность ×${factor.toFixed(2)} (TDEE ниже).`;
  }
  if (delta <= -0.06) {
    return `Активность снизилась: было ×${prevFactor.toFixed(2)}, сейчас ×${factor.toFixed(2)} (${sport7.toFixed(1)} ч спорта / ${ACTIVITY_WINDOW_DAYS} дн.).`;
  }
  if (sport7 >= 10) {
    return `Много спорта: ${sport7.toFixed(1)} ч за ${ACTIVITY_WINDOW_DAYS} дн. → ×${factor.toFixed(2)} к BMR.`;
  }
  return `Спорт ${sport7.toFixed(1)} ч / ${ACTIVITY_WINDOW_DAYS} дн. → множитель ×${factor.toFixed(2)}.`;
}

export function filterBodyPeriod(points, period, today) {
  if (!points.length) return [];
  if (period === "all") return points;
  const daysBack = period === "week" ? 7 : period === "month" ? 30 : 90;
  const from = addDaysISO(today, -daysBack);
  return points.filter((p) => p.date >= from);
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function periodStats(points, valueKey) {
  const vals = points
    .map((p) => p[valueKey])
    .filter((v) => v != null && Number.isFinite(v));
  if (!vals.length) {
    return { avg: null, change: null, max: null, min: null, maxDate: null, minDate: null, count: 0 };
  }
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const first = points.find((p) => p[valueKey] != null && Number.isFinite(p[valueKey]));
  const last = [...points].reverse().find((p) => p[valueKey] != null && Number.isFinite(p[valueKey]));
  const change =
    first && last && first.pointKey !== last.pointKey ? last[valueKey] - first[valueKey] : null;

  let max = -Infinity;
  let min = Infinity;
  let maxDate = null;
  let minDate = null;
  for (const p of points) {
    const v = p[valueKey];
    if (v == null || !Number.isFinite(v)) continue;
    if (v > max) {
      max = v;
      maxDate = p.date;
    }
    if (v < min) {
      min = v;
      minDate = p.date;
    }
  }

  return {
    avg,
    change,
    max: Number.isFinite(max) ? max : null,
    min: Number.isFinite(min) ? min : null,
    maxDate,
    minDate,
    count: points.length,
  };
}

export const BODY_METRIC_TABS = [
  {
    id: "weight_kg",
    label: "Вес",
    unit: "кг",
    decimals: 1,
    verifiedKey: "weight_verified",
    yMargin: 10,
  },
  { id: "bmi", label: "BMI", unit: "", decimals: 1, verifiedKey: null, yMargin: 1 },
  { id: "bf_pct", label: "% жира", unit: "%", decimals: 1, verifiedKey: "bf_verified", yMargin: 2 },
  {
    id: "muscle_mass_kg",
    label: "Мышцы",
    unit: "кг",
    decimals: 1,
    verifiedKey: "muscle_verified",
    yMargin: 3,
  },
  { id: "bmr_kcal", label: "BMR", unit: "ккал", decimals: 0, verifiedKey: null, yMargin: 120 },
  { id: "tdee_kcal", label: "TDEE", unit: "ккал", decimals: 0, verifiedKey: null, yMargin: 150 },
];

export { METRIC_KEYS, ACTIVITY_WINDOW_DAYS };
