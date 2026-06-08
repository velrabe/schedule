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

function earliestSessionStartClock(date, sessions = []) {
  let best = null;
  let bestMin = Infinity;
  for (const s of sessions) {
    if (s.date !== date) continue;
    const start = trimTime(s.start ?? s.start_time);
    if (!start) continue;
    const m = timeToMin(start);
    if (m < bestMin) {
      bestMin = m;
      best = start;
    }
  }
  return best;
}

/**
 * Sleep for a day, from отбой (`sleep_start`) to подъём (`wake`) on the same day row.
 * Falls back to the latest session end / earliest session start when a field is missing,
 * and to a stored `sleep_h` only when отбой/подъём cannot be derived.
 * `nextDay` is accepted for signature compatibility but no longer required.
 */
export function computeDisplaySleepHours(day, _nextDay, allSessions = []) {
  if (!day?.date) return null;

  let bedClock = trimTime(day.sleep_start);
  let wakeClock = trimTime(day.wake);

  if (!bedClock) bedClock = latestSessionEndClock(day.date, wakeClock || "06:00", allSessions);
  if (!wakeClock) wakeClock = earliestSessionStartClock(day.date, allSessions);

  if (bedClock && wakeClock) {
    const durMin = (timeToMin(wakeClock) - timeToMin(bedClock) + DAY_MIN) % DAY_MIN;
    const hours = clampSleepHours(durMin);
    if (hours != null) return hours;
  }

  const stored = day.sleep_h;
  if (stored !== null && stored !== undefined && stored !== "" && Number.isFinite(Number(stored))) {
    return Number(stored);
  }
  return null;
}
