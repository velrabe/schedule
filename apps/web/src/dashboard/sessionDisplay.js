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

/** Rows for «часы» block — no duplicate работа + work_paid when only paid work. */
export function businessHourRows(agg) {
  const paid = Number(agg?.work_paid_h) || 0;
  const personal = Number(agg?.personal_h) || 0;
  const byt = Number(agg?.byt_h) || 0;
  const business = Number(agg?.business_h) || 0;
  if (business <= 0) return [];

  const kinds = [paid > 0, personal > 0, byt > 0].filter(Boolean).length;
  if (kinds <= 1) {
    if (paid > 0) return [{ label: "работа", sub: "paid", h: paid }];
    if (personal > 0) return [{ label: "работа", sub: "personal", h: personal }];
    if (byt > 0) return [{ label: "работа", sub: "byt", h: byt }];
    return [{ label: "работа", h: business }];
  }

  return [
    { label: "работа", h: business, total: true },
    ...(paid > 0 ? [{ label: "work_paid", h: paid, breakdown: true }] : []),
    ...(personal > 0 ? [{ label: "personal", h: personal, breakdown: true }] : []),
    ...(byt > 0 ? [{ label: "byt", h: byt, breakdown: true }] : []),
  ];
}

/** Minutes from wake — 01:00 отбой после 23:00, не «утром». */
function wakeRelativeMin(start, wake) {
  const s = timeToMin(start);
  const w = timeToMin(wake);
  return (s - w + 24 * 60) % (24 * 60);
}

function sessionsOverlap(a, b, wake = "06:00") {
  if (sessionDurationMin(a) <= 0 || sessionDurationMin(b) <= 0) return false;
  const as = wakeRelativeMin(a.start ?? a.start_time, wake);
  let ae = wakeRelativeMin(a.end ?? a.end_time, wake);
  const bs = wakeRelativeMin(b.start ?? b.start_time, wake);
  let be = wakeRelativeMin(b.end ?? b.end_time, wake);
  if (ae < as) ae += 24 * 60;
  if (be < bs) be += 24 * 60;
  return as < be && bs < ae;
}

/** Pairs of diary sessions that overlap in time (broken timeline). */
export function findSessionOverlapPairs(sessions = [], wake = "06:00") {
  const rows = [...sessions].sort(
    (a, b) => wakeRelativeMin(a.start, wake) - wakeRelativeMin(b.start, wake),
  );
  const pairs = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (sessionsOverlap(rows[i], rows[j], wake)) pairs.push([rows[i], rows[j]]);
    }
  }
  return pairs;
}

export function sessionOverlapLabel(s) {
  return (s.project || "").trim() || String(s.category || "session").replace(/_/g, " ");
}
