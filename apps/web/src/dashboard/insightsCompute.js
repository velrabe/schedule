import { isSportSessionCategory, dayKcalOut } from "./nutritionKcal.js";
import { financeTxnDeltaRub } from "./financeInsights.js";

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function aggregateDay(date, sessions) {
  const ds = sessions.filter((s) => s.date === date);
  const sum = (pred) => ds.filter(pred).reduce((a, s) => a + (s.min || 0), 0);
  const work_paid_h = sum((s) => s.category === "work_paid") / 60;
  const personal_h = sum((s) => s.category === "personal" || s.category === "portfolio") / 60;
  const byt_h = sum((s) => s.category === "byt" || s.category === "planning") / 60;
  const business_h = work_paid_h + personal_h + byt_h;
  const sport_h = sum((s) => isSportSessionCategory(s.category)) / 60;
  const walk_h = sum((s) => s.category === "sport_walk" || s.category === "walk") / 60;
  const food_h = sum((s) => s.category === "food") / 60;
  const social_h = sum((s) => s.category === "social") / 60;
  const chill_h = sum((s) => s.category === "chill") / 60;
  const tracked_h =
    work_paid_h + personal_h + byt_h + sport_h + food_h + social_h + chill_h;
  return {
    work_paid_h,
    personal_h,
    byt_h,
    business_h,
    sport_h,
    walk_h,
    food_h,
    social_h,
    chill_h,
    tracked_h,
    sessions: ds.length,
  };
}

function avg(list, pick) {
  const vals = list.map(pick).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function dayHasMorningSport(date, sessions) {
  return sessions.some(
    (s) =>
      s.date === date && isSportSessionCategory(s.category) && timeToMin(s.start) < 12 * 60,
  );
}

function sportCategoryLabel(cat) {
  if (!cat) return "sport";
  if (cat === "walk" || cat === "sport_walk") return "walk";
  if (cat.startsWith("sport_")) return cat.slice("sport_".length);
  return cat;
}

export function buildInsightsModel({
  days = [],
  sessions = [],
  meals = [],
  activities = [],
  sessionEvents = [],
  finance = [],
  substances = [],
}) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const enriched = sorted.map((d) => {
    const agg = aggregateDay(d.date, sessions);
    const kcalIn = meals
      .filter((m) => m.date === d.date)
      .reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    const kcalOut = dayKcalOut(d.date, activities, sessionEvents, sessions);
    return {
      ...d,
      ...agg,
      morningSport: dayHasMorningSport(d.date, sessions),
      kcalIn,
      kcalOut,
      kcalBalance: kcalIn > 0 || kcalOut > 0 ? kcalIn - kcalOut : null,
    };
  });

  const n = enriched.length;
  const burnoutDays = enriched.filter((d) => d.day_type === "burnout");
  const modDays = enriched.filter((d) => d.modafinil_mg > 0);

  const kpis = {
    days: n,
    avgBusiness: avg(enriched, (d) => d.business_h) ?? 0,
    avgSleep: avg(
      enriched.filter((d) => d.sleep_h != null),
      (d) => d.sleep_h,
    ),
    avgSport: avg(enriched, (d) => d.sport_h) ?? 0,
    avgWalk: avg(enriched, (d) => d.walk_h) ?? 0,
    modPct: n ? Math.round((modDays.length / n) * 100) : 0,
    burnoutCount: burnoutDays.length,
    avgKcalIn: meals.length ? avg(enriched.filter((d) => d.kcalIn > 0), (d) => d.kcalIn) : null,
    avgKcalOut: activities.length || sessionEvents.length
      ? avg(enriched.filter((d) => d.kcalOut > 0), (d) => d.kcalOut)
      : null,
  };

  const timeBudget = [
    { key: "work_paid", label: "work_paid", h: avg(enriched, (d) => d.work_paid_h) ?? 0, tone: "success" },
    { key: "personal", label: "personal", h: avg(enriched, (d) => d.personal_h) ?? 0, tone: "info" },
    { key: "byt", label: "byt", h: avg(enriched, (d) => d.byt_h) ?? 0, tone: "warning" },
    { key: "sport", label: "sport", h: avg(enriched, (d) => d.sport_h) ?? 0, tone: "danger" },
    { key: "food", label: "food", h: avg(enriched, (d) => d.food_h) ?? 0, tone: "neutral" },
    { key: "chill", label: "chill", h: avg(enriched, (d) => d.chill_h) ?? 0, tone: "neutral" },
    { key: "social", label: "social", h: avg(enriched, (d) => d.social_h) ?? 0, tone: "neutral" },
  ].filter((r) => r.h > 0.05);

  const sportMinutes = {};
  for (const s of sessions) {
    if (!isSportSessionCategory(s.category)) continue;
    const label = sportCategoryLabel(s.category);
    sportMinutes[label] = (sportMinutes[label] || 0) + (s.min || 0);
  }
  const sportMix = Object.entries(sportMinutes)
    .map(([label, min]) => ({ label, hours: min / 60 }))
    .sort((a, b) => b.hours - a.hours);

  const projectMinutes = {};
  for (const s of sessions) {
    if (!["work_paid", "personal", "portfolio", "byt", "planning"].includes(s.category)) continue;
    const key = s.project?.trim() || s.category;
    projectMinutes[key] = (projectMinutes[key] || 0) + (s.min || 0);
  }
  const topProjects = Object.entries(projectMinutes)
    .map(([label, min]) => ({ label, hours: min / 60 }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 8);

  const modBuckets = [0, 50, 75, 100].map((mg) => {
    const list = enriched.filter((d) => d.modafinil_mg === mg);
    return {
      key: mg === 0 ? "0 mg" : `${mg} mg`,
      count: list.length,
      avgWork: list.length ? avg(list, (d) => d.business_h) ?? 0 : 0,
      avgSleep: avg(list.filter((d) => d.sleep_h != null), (d) => d.sleep_h),
    };
  });

  const sleepBuckets = [
    { label: "< 6h", min: 0, max: 6 },
    { label: "6–7h", min: 6, max: 7 },
    { label: "7–8h", min: 7, max: 8 },
    { label: "8–10h", min: 8, max: 10 },
    { label: "≥ 10h", min: 10, max: 99 },
  ].map((b) => {
    const list = enriched.filter(
      (d) => d.sleep_h !== null && d.sleep_h >= b.min && d.sleep_h < b.max,
    );
    return {
      key: b.label,
      count: list.length,
      avgWork: list.length ? avg(list, (d) => d.business_h) ?? 0 : 0,
    };
  });

  const dowOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const byDow = dowOrder.map((dn) => {
    const list = enriched.filter((d) => d.dow === dn);
    return {
      key: dn,
      count: list.length,
      avgWork: list.length ? avg(list, (d) => d.business_h) ?? 0 : 0,
      avgSport: list.length ? avg(list, (d) => d.sport_h) ?? 0 : 0,
    };
  });

  const dayTypeCounts = Object.entries(
    enriched.reduce((acc, d) => {
      const t = d.day_type || "—";
      acc[t] = (acc[t] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const morning = enriched.filter((d) => d.morningSport);
  const noMorning = enriched.filter((d) => !d.morningSport);
  const morningSport = {
    morning: {
      count: morning.length,
      avg: morning.length ? avg(morning, (d) => d.business_h) ?? 0 : 0,
    },
    noMorning: {
      count: noMorning.length,
      avg: noMorning.length ? avg(noMorning, (d) => d.business_h) ?? 0 : 0,
    },
  };

  const financeByCategory = {};
  let financeExpenseTotal = 0;
  for (const t of finance) {
    const delta = financeTxnDeltaRub(t);
    if (delta >= 0) continue;
    const cat = (t.category || t.merchant || "прочее").trim() || "прочее";
    financeByCategory[cat] = (financeByCategory[cat] || 0) + Math.abs(delta);
    financeExpenseTotal += Math.abs(delta);
  }
  const financeTop = Object.entries(financeByCategory)
    .map(([label, rub]) => ({ label, rub }))
    .sort((a, b) => b.rub - a.rub)
    .slice(0, 10);

  const substanceCounts = {};
  for (const s of substances) {
    const name = s.name || "unknown";
    substanceCounts[name] = (substanceCounts[name] || 0) + 1;
  }
  const substanceRows = Object.entries(substanceCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const moodStats = {
    mood: avg(enriched.filter((d) => d.mood != null), (d) => d.mood),
    energy: avg(enriched.filter((d) => d.energy != null), (d) => d.energy),
    focus: avg(enriched.filter((d) => d.focus != null), (d) => d.focus),
  };
  const hasMood = moodStats.mood != null || moodStats.energy != null || moodStats.focus != null;

  const extremes = {
    bestWork: [...enriched].sort((a, b) => b.business_h - a.business_h)[0] || null,
    worstWork: [...enriched].filter((d) => d.business_h >= 0).sort((a, b) => a.business_h - b.business_h)[0] || null,
    maxKcalIn: [...enriched].filter((d) => d.kcalIn > 0).sort((a, b) => b.kcalIn - a.kcalIn)[0] || null,
    maxKcalOut: [...enriched].filter((d) => d.kcalOut > 0).sort((a, b) => b.kcalOut - a.kcalOut)[0] || null,
    shortestSleepWork: [...enriched]
      .filter((d) => d.sleep_h != null && d.sleep_h < 6 && d.business_h >= 5)
      .sort((a, b) => a.sleep_h - b.sleep_h)[0] || null,
  };

  const fmtH = (v) => (v == null ? "—" : `${v.toFixed(1)}ч`);

  const insights = [];

  const mod75 = enriched.filter((d) => d.modafinil_mg === 75);
  const mod100 = enriched.filter((d) => d.modafinil_mg === 100);
  const avg75 = mod75.length ? avg(mod75, (d) => d.business_h) : null;
  const avg100 = mod100.length ? avg(mod100, (d) => d.business_h) : null;
  if (mod75.length >= 2 && mod100.length >= 1 && avg75 != null && avg100 != null) {
    const diff = avg100 - avg75;
    insights.push({
      tone: diff > 1 ? "info" : "warning",
      title: "Модафинил 75 vs 100",
      body: `75мг (n=${mod75.length}): ${fmtH(avg75)} работы в среднем. 100мг (n=${mod100.length}): ${fmtH(avg100)}. Разница ${diff >= 0 ? "+" : ""}${diff.toFixed(1)}ч — ${diff < 0.5 ? "прирост слабый относительно дозы" : "100мг даёт заметный буст"}.`,
    });
  }

  const shortSleep = enriched.filter((d) => d.sleep_h != null && d.sleep_h < 6);
  const goodSleep = enriched.filter((d) => d.sleep_h != null && d.sleep_h >= 7 && d.sleep_h < 9);
  const avgShort = shortSleep.length ? avg(shortSleep, (d) => d.business_h) : null;
  const avgGood = goodSleep.length ? avg(goodSleep, (d) => d.business_h) : null;
  if (shortSleep.length >= 2 && goodSleep.length >= 2 && avgShort != null && avgGood != null) {
    insights.push({
      tone: avgShort < avgGood - 1 ? "danger" : "warning",
      title: "Короткий сон",
      body: `При сне <6ч (n=${shortSleep.length}) работа ${fmtH(avgShort)}; при 7–8ч (n=${goodSleep.length}) — ${fmtH(avgGood)}.`,
    });
  }

  if (morningSport.morning.count >= 2 && morningSport.noMorning.count >= 2) {
    const delta = morningSport.noMorning.avg - morningSport.morning.avg;
    insights.push({
      tone: delta > 0.5 ? "warning" : "info",
      title: "Утренний спорт",
      body: `До 12:00 спорт: n=${morningSport.morning.count}, ${fmtH(morningSport.morning.avg)} работы. Без: n=${morningSport.noMorning.count}, ${fmtH(morningSport.noMorning.avg)}.${delta > 0.5 ? " Утро для спорта проигрывает по выработке." : ""}`,
    });
  }

  if (burnoutDays.length >= 2) {
    const afterShort = burnoutDays.filter((d) => d.sleep_h != null && d.sleep_h < 7).length;
    insights.push({
      tone: "danger",
      title: "Burnout",
      body: `${burnoutDays.length} дней с day_type=burnout (${n ? Math.round((burnoutDays.length / n) * 100) : 0}% выборки). ${afterShort} из них после сна <7ч.`,
    });
  }

  if (kpis.avgKcalIn != null && kpis.avgKcalOut != null) {
    const net = kpis.avgKcalIn - kpis.avgKcalOut;
    insights.push({
      tone: net > 300 ? "warning" : "info",
      title: "Питание (среднее)",
      body: `Вход ${Math.round(kpis.avgKcalIn)} ккал/день, расход ${Math.round(kpis.avgKcalOut)} ккал/день. Баланс ${net >= 0 ? "+" : ""}${Math.round(net)} ккал.`,
    });
  }

  if (financeTop.length >= 3) {
    const top3 = financeTop.slice(0, 3).map((r) => `${r.label}`).join(", ");
    insights.push({
      tone: "info",
      title: "Расходы (факт)",
      body: `Топ категорий: ${top3}. Всего расходов в выборке ≈ ${Math.round(financeExpenseTotal).toLocaleString("ru-RU")} ₽.`,
    });
  }

  if (topProjects[0]) {
    const totalWorkH = topProjects.reduce((s, p) => s + p.hours, 0);
    const share = totalWorkH > 0 ? (topProjects[0].hours / totalWorkH) * 100 : 0;
    if (share >= 40) {
      insights.push({
        tone: "info",
        title: "Фокус проектов",
        body: `«${topProjects[0].label}» — ${share.toFixed(0)}% рабочего времени (${topProjects[0].hours.toFixed(1)}ч из ${totalWorkH.toFixed(1)}ч).`,
      });
    }
  }

  return {
    enriched,
    kpis,
    timeBudget,
    sportMix,
    topProjects,
    modBuckets,
    sleepBuckets,
    byDow,
    dayTypeCounts,
    morningSport,
    financeTop,
    financeExpenseTotal,
    substanceRows,
    moodStats,
    hasMood,
    extremes,
    insights,
    hasNutrition: meals.length > 0 || activities.length > 0,
    hasFinance: finance.length > 0,
    hasSubstances: substanceRows.length > 0,
  };
}
