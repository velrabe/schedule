import {
  BODY_PROFILE,
  bmrMifflinStJeor,
  bmi,
  estimateBfPct,
  fatMassKg,
  estimateMuscleMassKg,
  isVerifiedSource,
  tdeeFromBmr,
} from "./bodyProfile.js";

const METRIC_KEYS = ["weight_kg", "bf_pct", "fat_mass_kg", "muscle_mass_kg"];

function metricPriority(sourceType) {
  if (sourceType === "device") return 3;
  if (sourceType === "measured") return 2;
  return 1;
}

function pickMetricRow(rows, metric) {
  const list = (rows || []).filter((r) => r.metric === metric);
  if (!list.length) return null;
  return list.sort((a, b) => metricPriority(b.source_type) - metricPriority(a.source_type))[0];
}

/**
 * @param {{ days?: object[], body_metrics?: object[] }} input
 * @returns {{ points: object[], latestWeight: number|null }}
 */
export function buildBodyTimeline({ days = [], body_metrics = [] }) {
  const dateSet = new Set();
  for (const d of days) dateSet.add(d.date);
  for (const m of body_metrics) dateSet.add(m.date);

  const byDate = new Map();
  for (const date of dateSet) {
    const day = days.find((d) => d.date === date);
    const dayRows = body_metrics.filter((m) => m.date === date);

    const weightRow =
      pickMetricRow(dayRows, "weight_kg") ||
      (day?.weight_kg != null
        ? {
            value: Number(day.weight_kg),
            source_type: "measured",
            metric: "weight_kg",
            date,
          }
        : null);

    const weight =
      weightRow && Number.isFinite(Number(weightRow.value)) ? Number(weightRow.value) : null;
    if (weight == null) continue;

    const bfRow = pickMetricRow(dayRows, "bf_pct");
    const fatRow = pickMetricRow(dayRows, "fat_mass_kg");
    const muscleRow = pickMetricRow(dayRows, "muscle_mass_kg");

    let bfPct = bfRow ? Number(bfRow.value) : null;
    let bfSource = bfRow?.source_type || "estimated";
    if (bfPct == null || !Number.isFinite(bfPct)) {
      bfPct = estimateBfPct(weight);
      bfSource = "estimated";
    }

    let fatKg = fatRow ? Number(fatRow.value) : null;
    let fatSource = fatRow?.source_type || "estimated";
    if (fatKg == null || !Number.isFinite(fatKg)) {
      fatKg = fatMassKg(weight, bfPct);
      fatSource = "estimated";
    }

    let muscleKg = muscleRow ? Number(muscleRow.value) : null;
    let muscleSource = muscleRow?.source_type || "estimated";
    if (muscleKg == null || !Number.isFinite(muscleKg)) {
      muscleKg = estimateMuscleMassKg(weight);
      muscleSource = "estimated";
    }

    const bmr = bmrMifflinStJeor(weight);
    const bmiVal = bmi(weight);

    byDate.set(date, {
      date,
      weight_kg: weight,
      weight_verified: isVerifiedSource(weightRow?.source_type || "estimated"),
      bf_pct: bfPct,
      bf_verified: isVerifiedSource(bfSource),
      fat_mass_kg: fatKg,
      fat_verified: isVerifiedSource(fatSource),
      muscle_mass_kg: muscleKg,
      muscle_verified: isVerifiedSource(muscleSource),
      bmi: bmiVal,
      bmr_kcal: bmr,
      tdee_kcal: tdeeFromBmr(bmr),
    });
  }

  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const latestWeight = points.length ? points[points.length - 1].weight_kg : null;

  return { points, latestWeight };
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
    first && last && first.date !== last.date ? last[valueKey] - first[valueKey] : null;

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
  { id: "weight_kg", label: "Вес", unit: "кг", decimals: 1, verifiedKey: "weight_verified" },
  { id: "bmi", label: "BMI", unit: "", decimals: 1, verifiedKey: null },
  { id: "bf_pct", label: "% жира", unit: "%", decimals: 1, verifiedKey: "bf_verified" },
  { id: "muscle_mass_kg", label: "Мышцы", unit: "кг", decimals: 1, verifiedKey: "muscle_verified" },
  { id: "bmr_kcal", label: "BMR", unit: "ккал", decimals: 0, verifiedKey: null },
];

export { METRIC_KEYS };
