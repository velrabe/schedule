/** Session row display: duration labels, redundant mirror detection. */

const FOCUS_CATEGORIES = new Set(["work_paid", "personal", "byt", "planning", "portfolio"]);

function timeToMin(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function durationFromTimes(start, end) {
  const s = timeToMin(start);
  let e = timeToMin(end);
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s);
}

/** Human duration: 45m, 1h, 1h 15m */
export function fmtSessionDuration(min) {
  const m = Math.round(Number(min) || 0);
  if (m <= 0) return "—";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export function sessionDurationMin(session) {
  const m = Number(session?.min);
  if (m > 0) return m;
  return durationFromTimes(session?.start, session?.end);
}

export function partDurationMin(part) {
  if (part?.is_instant) return 0;
  const dm = Number(part?.duration_min);
  if (dm > 0) return dm;
  return durationFromTimes(
    String(part?.start_time || "").slice(0, 5),
    String(part?.end_time || "").slice(0, 5),
  );
}

/** Server mirror: one child event copies the parent session envelope — hide in schedule UI. */
export function isRedundantMirrorPart(session, parts) {
  if (!parts || parts.length !== 1) return false;
  const p = parts[0];
  const s0 = String(session?.start || "").slice(0, 5);
  const s1 = String(session?.end || "").slice(0, 5);
  const p0 = String(p?.start_time || "").slice(0, 5);
  const p1 = String(p?.end_time || "").slice(0, 5);
  if (s0 === p0 && s1 === p1) return true;
  const sMin = sessionDurationMin(session);
  const pMin = partDurationMin(p);
  if (sMin > 0 && pMin > 0 && sMin === pMin && s0 === p0) return true;
  return false;
}

/** Merge consecutive focus sessions (same project) for insights. */
export function focusBlocksForDate(date, sessions = []) {
  const rows = sessions
    .filter((s) => s.date === date && FOCUS_CATEGORIES.has(s.category))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const blocks = [];
  for (const s of rows) {
    const proj = (s.project || s.category || "").trim() || "работа";
    const last = blocks[blocks.length - 1];
    const gap = last ? timeToMin(s.start) - timeToMin(last.end) : 999;
    if (last && last.project === proj && gap >= 0 && gap <= 20) {
      if (timeToMin(s.end) > timeToMin(last.end)) last.end = s.end;
      last.min += sessionDurationMin(s);
      last.sessionIds.push(s.id);
    } else {
      blocks.push({
        project: proj,
        category: s.category,
        start: s.start,
        end: s.end,
        min: sessionDurationMin(s),
        sessionIds: [s.id],
      });
    }
  }
  return blocks;
}

export function focusBlockInsightLines(date, sessions = []) {
  return focusBlocksForDate(date, sessions)
    .filter((b) => b.min >= 45)
    .map((b, i) => ({
      key: `focus-${i}`,
      label: `фокус ${b.start}–${b.end} · ${b.project}`,
      hint: fmtSessionDuration(b.min),
      tone: b.min >= 120 ? "ok" : undefined,
    }));
}
