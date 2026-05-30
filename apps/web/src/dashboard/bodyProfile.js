/** User anthropometrics + activity for BMR/TDEE and body-composition estimates. */

export const BODY_PROFILE = {
  heightCm: 181,
  age: 29,
  sex: "male",
};

export function bmrMifflinStJeor(weightKg, profile = BODY_PROFILE) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  const { heightCm, age, sex } = profile;
  const base = 10 * w + 6.25 * heightCm - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

/** TDEE = BMR × activity factor (from rolling sport hours in bodyActivity.js). */
export function tdeeFromBmr(bmr, activityFactor) {
  if (bmr == null || !Number.isFinite(bmr)) return null;
  const f = Number(activityFactor);
  if (!Number.isFinite(f) || f <= 0) return null;
  return bmr * f;
}

export function bmi(weightKg, profile = BODY_PROFILE) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  const h = profile.heightCm / 100;
  return w / (h * h);
}

/** Deurenberg et al. — male default in profile. */
export function estimateBfPct(weightKg, profile = BODY_PROFILE) {
  const b = bmi(weightKg, profile);
  if (b == null) return null;
  const { age, sex } = profile;
  if (sex === "female") return 1.2 * b + 0.23 * age - 5.4;
  return 1.2 * b + 0.23 * age - 16.2;
}

export function fatMassKg(weightKg, bfPct) {
  const w = Number(weightKg);
  const bf = Number(bfPct);
  if (!Number.isFinite(w) || !Number.isFinite(bf)) return null;
  return (w * bf) / 100;
}

export function leanMassKg(weightKg, fatMass) {
  const w = Number(weightKg);
  const f = Number(fatMass);
  if (!Number.isFinite(w) || !Number.isFinite(f)) return null;
  return w - f;
}

/** Kim et al. skeletal muscle mass (kg) — estimate when no scale reading. */
export function estimateMuscleMassKg(weightKg, profile = BODY_PROFILE) {
  const w = Number(weightKg);
  if (!Number.isFinite(w) || w <= 0) return null;
  const { heightCm, age, sex } = profile;
  if (sex === "female") {
    return 0.244 * w + 0.099 * heightCm - 0.084 * age - 3.9;
  }
  return 0.244 * w + 0.099 * heightCm - 0.084 * age - 3.9;
}

export function isVerifiedSource(sourceType) {
  return sourceType === "measured" || sourceType === "device";
}

export const SOURCE_TYPE_LABELS = {
  estimated: "расчёт",
  measured: "замер",
  device: "аппарат",
};
