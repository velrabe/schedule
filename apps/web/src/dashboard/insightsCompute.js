import { isSportSessionCategory, dayKcalOut } from "./nutritionKcal.js";
import { isSportSessionEvent } from "./activityMetrics.js";
import { partDurationMin, fmtSessionDuration, focusBlocksForDate } from "./sessionDisplay.js";
import { financeTxnDeltaRub } from "./financeInsights.js";
import { computeDisplaySleepHours, addCalendarDaysISO, fmtHoursHM } from "./dayWakeTimeline.js";

function timeToMin(t) {
  if (!t) return 0;
  const [h, m] = String(t).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Map one session_event to hour buckets for day insights (atom-first).
 * Uses atom kind/category when set; otherwise parent session.category.
 */
export function insightBucketForEvent(ev, session) {
  const k = (ev.kind || "").toLowerCase();
  const cat = (ev.category || "").toLowerCase();
  const sc = session ? String(session.category || "").toLowerCase() : "";

  if (ev.is_instant || k === "wake") return null;
  if (k === "substance" || ev.substance_id) return null;

  if (isSportSessionEvent(ev)) {
    if (cat === "sport_walk" || cat === "walk" || k === "walk") return "walk";
    return "sport";
  }

  // The event is the source of truth. Its own kind/category wins; the parent
  // session's category is only a fallback hint (a session is a named wrapper,
  // it carries nothing unique). Otherwise a work event under a category-less
  // wrapper session would be bucketed as nothing.
  const c = cat || sc;
  if (k === "food" || c === "food") return "food";
  if (k === "chill" || c === "chill") return "chill";
  if (k === "social" || c === "social") return "social";
  if (c === "work_paid") return "work_paid";
  if (c === "personal" || c === "portfolio") return "personal";
  if (c === "byt" || c === "planning" || c === "admin") return "byt";
  // Bare "work" or a work kind with no specific category still counts as business.
  if (c === "work" || k === "work") return "work_paid";
  if (isSportSessionCategory(c)) return null;

  return null;
}

/** Map a session envelope's own category to an hour bucket (fallback when it has no child events). */
function bucketForSessionCategory(cat) {
  const c = (cat || "").toLowerCase();
  if (c === "work_paid" || c === "work") return "work_paid";
  if (c === "personal" || c === "portfolio") return "personal";
  if (c === "byt" || c === "planning" || c === "admin") return "byt";
  if (c === "sport_walk" || c === "walk") return "walk";
  if (isSportSessionCategory(c)) return "sport";
  if (c === "food") return "food";
  if (c === "social") return "social";
  if (c === "chill") return "chill";
  return null;
}

/** Day hour buckets from session_events (sum of atom durations), else session envelopes. */
export function aggregateDay(date, sessions, sessionEvents = []) {
  const ds = sessions.filter((s) => s.date === date);
  const dayEvts = sessionEvents.filter((e) => e.date === date && e.session_id);
  const sessById = new Map(ds.map((s) => [s.id, s]));

  let work_paid = 0;
  let personal = 0;
  let byt = 0;
  let sport = 0;
  let walk = 0;
  let food = 0;
  let social = 0;
  let chill = 0;

  const add = (bucket, dm) => {
    if (!bucket || !(dm > 0)) return;
    switch (bucket) {
      case "work_paid": work_paid += dm; break;
      case "personal": personal += dm; break;
      case "byt": byt += dm; break;
      case "sport": sport += dm; break;
      case "walk": walk += dm; sport += dm; break;
      case "food": food += dm; break;
      case "social": social += dm; break;
      case "chill": chill += dm; break;
      default: break;
    }
  };

  // Sessions with child events are measured by those events; sessions without
  // any child event still count via their own envelope so envelope-only work
  // is never dropped just because the day has an unrelated meal/substance event.
  const coveredSessions = new Set(dayEvts.map((e) => e.session_id));
  for (const ev of dayEvts) {
    add(insightBucketForEvent(ev, sessById.get(ev.session_id)), partDurationMin(ev));
  }
  for (const s of ds) {
    if (coveredSessions.has(s.id)) continue;
    add(bucketForSessionCategory(s.category), s.min || 0);
  }

  const work_paid_h = work_paid / 60;
  const personal_h = personal / 60;
  const byt_h = byt / 60;
  const business_h = work_paid_h + personal_h + byt_h;
  const sport_h = sport / 60;
  const walk_h = walk / 60;
  const food_h = food / 60;
  const social_h = social / 60;
  const chill_h = chill / 60;
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

const FOCUS_INSIGHT_BUCKETS = new Set(["work_paid", "personal", "byt"]);

/** Calendar insight: total focus time from work atoms (or session fallback if no events). */
export function focusWorkInsightLine(date, sessions = [], sessionEvents = []) {
  const sessById = new Map(sessions.filter((s) => s.date === date).map((s) => [s.id, s]));
  const dayEvts = sessionEvents.filter((e) => e.date === date && e.session_id);

  let blocks;
  if (dayEvts.length) {
    const rows = [];
    for (const e of dayEvts) {
      const session = sessById.get(e.session_id);
      const bucket = insightBucketForEvent(e, session);
      if (!bucket || !FOCUS_INSIGHT_BUCKETS.has(bucket)) continue;
      const dm = partDurationMin(e);
      if (dm <= 0) continue;
      const proj = `${(e.title || session?.project || session?.category || "").trim()}` || "работа";
      rows.push({
        start: String(e.start_time || e.start || "00:00").slice(0, 5),
        end: String(e.end_time || e.end || "00:00").slice(0, 5),
        min: dm,
        project: proj,
      });
    }
    rows.sort((a, b) => String(a.start).localeCompare(String(b.start)));
    blocks = [];
    for (const row of rows) {
      const last = blocks[blocks.length - 1];
      const gap = last ? timeToMin(row.start) - timeToMin(last.end) : 999;
      if (last && last.project === row.project && gap >= 0 && gap <= 20) {
        if (timeToMin(row.end) > timeToMin(last.end)) last.end = row.end;
        last.min += row.min;
      } else {
        blocks.push({
          project: row.project,
          start: row.start,
          end: row.end,
          min: row.min,
        });
      }
    }
  } else {
    blocks = focusBlocksForDate(date, sessions);
  }

  if (!blocks.length) return null;
  const totalMin = blocks.reduce((a, b) => a + b.min, 0);
  if (totalMin < 15) return null;
  const projects = [...new Set(blocks.map((b) => b.project))];
  const hint =
    projects.length === 1
      ? projects[0]
      : projects.slice(0, 2).join(", ") + (projects.length > 2 ? "…" : "");
  return {
    key: "focus_total",
    label: `фокус ${fmtSessionDuration(totalMin)}`,
    hint,
    tone: totalMin >= 120 ? "ok" : undefined,
  };
}

function avg(list, pick) {
  const vals = list.map(pick).filter((v) => v !== null && v !== undefined && !Number.isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function dayHasMorningSport(date, sessions, sessionEvents = []) {
  const evs = sessionEvents.filter((e) => e.date === date && isSportSessionEvent(e));
  for (const e of evs) {
    const t = timeToMin(e.start_time || e.start);
    if (t >= 0 && t < 12 * 60) return true;
  }
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
  const byDate = new Map(days.map((d) => [d.date, d]));
  // Insights must also surface dates that have activity but no day row yet
  // (e.g. today's work logged before отбой/подъём), otherwise their work
  // hours never show up in the dynamics chart or averages.
  const allDates = new Set(days.map((d) => d.date));
  for (const s of sessions) if (s?.date) allDates.add(s.date);
  for (const e of sessionEvents) if (e?.date) allDates.add(e.date);
  const sorted = [...allDates]
    .sort((a, b) => String(a).localeCompare(String(b)))
    .map((date) => byDate.get(date) || { date });
  const enriched = sorted.map((d) => {
    const agg = aggregateDay(d.date, sessions, sessionEvents);
    const kcalIn = meals
      .filter((m) => m.date === d.date)
      .reduce((s, m) => s + (Number(m.kcal) || 0), 0);
    const kcalOut = dayKcalOut(d.date, activities, sessionEvents, sessions);
    const sleep_h = computeDisplaySleepHours(d, byDate.get(addCalendarDaysISO(d.date, -1)), sessions);
    return {
      ...d,
      ...agg,
      sleep_h: sleep_h != null ? sleep_h : d.sleep_h,
      morningSport: dayHasMorningSport(d.date, sessions, sessionEvents),
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
  for (const ev of sessionEvents) {
    if (!ev.date || !isSportSessionEvent(ev)) continue;
    const sess = sessions.find((s) => s.id === ev.session_id);
    const label = sportCategoryLabel(ev.category || sess?.category || "");
    const dm = partDurationMin(ev);
    if (dm <= 0) continue;
    sportMinutes[label] = (sportMinutes[label] || 0) + dm;
  }
  const sportMix = Object.entries(sportMinutes)
    .map(([label, min]) => ({ label, hours: min / 60 }))
    .sort((a, b) => b.hours - a.hours);

  const projectMinutes = {};
  for (const ev of sessionEvents) {
    if (!ev.date || !ev.session_id) continue;
    const sess = sessions.find((s) => s.id === ev.session_id);
    const bucket = insightBucketForEvent(ev, sess);
    if (!bucket || !["work_paid", "personal", "byt"].includes(bucket)) continue;
    const dm = partDurationMin(ev);
    if (dm <= 0) continue;
    const key = (ev.title || sess?.project || sess?.category || "").trim() || bucket;
    projectMinutes[key] = (projectMinutes[key] || 0) + dm;
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

  const fmtH = (v) => (v == null ? "—" : fmtHoursHM(v));

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
      body: `75мг (n=${mod75.length}): ${fmtH(avg75)} работы в среднем. 100мг (n=${mod100.length}): ${fmtH(avg100)}. Разница ${diff >= 0 ? "+" : "−"}${fmtHoursHM(Math.abs(diff))} — ${diff < 0.5 ? "прирост слабый относительно +25мг" : "100мг даёт заметный буст"}.`,
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
        body: `«${topProjects[0].label}» — ${share.toFixed(0)}% рабочего времени (${fmtHoursHM(topProjects[0].hours)} из ${fmtHoursHM(totalWorkH)}).`,
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
