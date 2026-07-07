/**
 * Chronological ordering helpers for a diary day / session that crosses midnight,
 * plus automatic sleep duration (отбой → подъём).
 *
 * Within one diary day a clock before `wake` belongs to the late-night tail, so
 * 00:30 sorts AFTER 22:00 when they are part of the same night.
 */

const DAY_MIN = 24 * 60;

export function trimTime(t) {
  const s = String(t ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function timeToMin(t) {
  const [h, mm] = trimTime(t || "00:00").split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(mm)) return 0;
  return h * 60 + mm;
}

/** Minutes after `wake` along the wake-day cycle (0 … <1440). */
export function dayWakeChronoMinutes(clock, wake) {
  const c = timeToMin(trimTime(clock) || "00:00");
  const w = timeToMin(trimTime(wake) || "06:00");
  if (c >= w) return c - w;
  return DAY_MIN - w + c;
}

/** Minutes after a session's own start — orders events inside a session across midnight. */
export function sessionEventChronoMinutes(clock, sessionStart) {
  const c = timeToMin(trimTime(clock) || "00:00");
  const a = timeToMin(trimTime(sessionStart) || "00:00");
  return (c - a + DAY_MIN) % DAY_MIN;
}

export function addCalendarDaysISO(dateStr, delta) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function clampSleepHours(durMin) {
  if (!Number.isFinite(durMin) || durMin <= 0) return null;
  if (durMin > 20 * 60) return null;
  return Math.round((durMin / 60) * 100) / 100;
}

/** Latest session end of the day, ordered by the day's wake cycle (handles 01:30 ends). */
function latestSessionEndClock(date, wake, sessions = []) {
  let best = null;
  let bestRank = -1;
  for (const s of sessions) {
    if (s.date !== date) continue;
    const end = trimTime(s.end ?? s.end_time);
    if (!end) continue;
    const rank = dayWakeChronoMinutes(end, wake);
    if (rank > bestRank) {
      bestRank = rank;
      best = end;
    }
  }
  return best;
}

/**
 * Wake clock inferred from a day's sessions when `days.wake_time` is empty:
 * the day begins right after the longest inactivity gap (the sleep). This is
 * anchor-free, so it handles days that start before dawn (a continuous night,
 * «без пробуждения» — wake 04:35) AND days whose wake is in the evening
 * (wake 19:30 with sessions running past midnight) — a fixed clock anchor
 * mis-sorts both. Returns "HH:MM" or null when the day has no sessions.
 * ponytail: assumes one dominant sleep gap per day; a nap longer than the night
 * would move the anchor. Upgrade path: set days.wake_time explicitly.
 */
export function inferWakeClock(date, sessions = []) {
  const spans = [];
  for (const s of sessions) {
    if (s.date !== date) continue;
    const start = trimTime(s.start ?? s.start_time);
    if (!start) continue;
    const end = trimTime(s.end ?? s.end_time);
    spans.push({ clock: start, start: timeToMin(start), end: timeToMin(end || start) });
  }
  if (spans.length === 0) return null;
  spans.sort((a, b) => a.start - b.start);
  if (spans.length === 1) return spans[0].clock;
  let wake = spans[0].clock;
  let bestGap = -1;
  for (let i = 0; i < spans.length; i++) {
    const prev = spans[(i - 1 + spans.length) % spans.length];
    const gap = (spans[i].start - prev.end + DAY_MIN) % DAY_MIN;
    if (gap > bestGap) {
      bestGap = gap;
      wake = spans[i].clock;
    }
  }
  return wake;
}

/** Wake clock to order a day by: explicit `wake`, else inferred, else dawn. */
export function effectiveWakeClock(day, date, sessions = []) {
  return trimTime(day?.wake) || inferWakeClock(date ?? day?.date, sessions) || "06:00";
}

/**
 * Sleep that powers a given day D = from the PREVIOUS day's отбой (`sleep_start`,
 * the bedtime that night) to this day's подъём (`wake`). So a 6th-evening отбой 02:30
 * paired with a 7th подъём 11:05 = 8ч35м, attributed to the 7th (the wake day),
 * which matches how `sleep_hours` is stored on the wake row.
 *
 * Falls back to the previous day's latest session end (bed) / this day's earliest
 * session start (rise) when a field is missing, and to a stored `sleep_h` last.
 */
export function computeDisplaySleepHours(day, prevDay, allSessions = []) {
  if (!day?.date) return null;
  const prevDate = addCalendarDaysISO(day.date, -1);

  let riseClock = trimTime(day.wake);
  if (!riseClock) riseClock = inferWakeClock(day.date, allSessions);

  let bedClock = trimTime(prevDay?.sleep_start);
  if (!bedClock) {
    const prevWake = trimTime(prevDay?.wake) || inferWakeClock(prevDate, allSessions) || "06:00";
    bedClock = latestSessionEndClock(prevDate, prevWake, allSessions);
  }

  if (bedClock && riseClock) {
    const durMin = (timeToMin(riseClock) - timeToMin(bedClock) + DAY_MIN) % DAY_MIN;
    const hours = clampSleepHours(durMin);
    if (hours != null) return hours;
  }

  const stored = day.sleep_h;
  if (stored !== null && stored !== undefined && stored !== "" && Number.isFinite(Number(stored))) {
    return Number(stored);
  }
  return null;
}

/** Duration in hours → "9ч 05м" / "9ч" / "35м" / "—" (no decimals). */
export function fmtHoursHM(hours) {
  if (hours == null || !Number.isFinite(Number(hours))) return "—";
  const total = Math.round(Number(hours) * 60);
  if (total <= 0) return "0ч";
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h > 0 && m > 0) return `${h}ч ${String(m).padStart(2, "0")}м`;
  if (h > 0) return `${h}ч`;
  return `${m}м`;
}

/** Minutes → "9ч 05м" / "9ч" / "35м" / "—" (no decimals). */
export function fmtMinutesHM(min) {
  if (min == null || !Number.isFinite(Number(min))) return "—";
  return fmtHoursHM(Number(min) / 60);
}
