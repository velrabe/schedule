/** Match substances rows to a diary session phase by time (and explicit session link). */

import { substanceRowLabel } from "./calendarDayDetail.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function timeToMin(t) {
  const [h, m] = trimTime(t).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function normalizeSessionTimes(session) {
  const start = timeToMin(session.start ?? session.start_time);
  let end = timeToMin(session.end ?? session.end_time);
  if (end <= start) end += 24 * 60;
  return { start, end };
}

function timeInSessionWindow(time, start, end) {
  let t = timeToMin(time);
  if (t < start - 12 * 60) t += 24 * 60;
  return t >= start && t <= end;
}

/**
 * Substances whose `time` falls in session envelope, or mirror event tied to this session.
 * @returns {object[]} substances rows sorted by time
 */
export function substancesForSessionPhase(session, substances = [], sessionEvents = []) {
  if (!session?.date) return [];
  const date = session.date;
  const { start, end } = normalizeSessionTimes(session);
  const sid = session.id;
  const seen = new Set();
  const out = [];

  const add = (row) => {
    if (!row?.id || seen.has(row.id)) return;
    seen.add(row.id);
    out.push(row);
  };

  for (const e of sessionEvents) {
    if (e.session_id === sid && e.substance_id) {
      add(substances.find((s) => s.id === e.substance_id));
    }
  }

  for (const s of substances) {
    if (s.date !== date || !s.time) continue;
    if (timeInSessionWindow(s.time, start, end)) add(s);
  }

  return out.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

export function substancesForDate(date, substances = []) {
  return substances
    .filter((s) => s.date === date)
    .sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
}

export { substanceRowLabel };
