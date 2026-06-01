/** Labels and normalized times for drawer / breadcrumbs. */

import { linkedEventLabel } from "./sessionFinance.js";

function trimTime(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

export function mapSessionEventForDrawer(ev) {
  if (!ev) return ev;
  const start = trimTime(ev.start ?? ev.start_time);
  let end = trimTime(ev.end ?? ev.end_time);
  const instant =
    Boolean(ev.is_instant) ||
    ev.kind === "wake" ||
    ev.kind === "substance" ||
    (start && (!end || start === end));
  if (instant && start) end = start;
  return { ...ev, start, end, start_time: ev.start_time ?? start, end_time: ev.end_time ?? end };
}

export function sessionEventTimeSpan(ev) {
  const row = mapSessionEventForDrawer(ev);
  const start = row.start || "?";
  const end = row.end || "?";
  if (
    Boolean(row.is_instant) ||
    row.kind === "wake" ||
    row.kind === "substance" ||
    start === end
  ) {
    return start;
  }
  return `${start}–${end}`;
}

export function sessionEventDisplayLabel(ev, finance = []) {
  const title = linkedEventLabel(ev, finance) || ev?.title || ev?.kind || "—";
  return `${sessionEventTimeSpan(ev)} · ${title}`;
}

/** Stable key for stack dedup: kind + record id. */
export function editorTargetKey(target) {
  if (!target?.record?.id) return null;
  return `${target.kind}:${target.record.id}`;
}

export function filterDrawerNavLinks(links, { currentKind, currentRecord, stack = [] }) {
  const cur = currentRecord?.id ? `${currentKind}:${currentRecord.id}` : null;
  const seen = new Set();
  for (const item of stack) {
    const k = editorTargetKey(item);
    if (k) seen.add(k);
  }
  return links.filter((l) => {
    const k = l.record?.id ? `${l.kind}:${l.record.id}` : null;
    if (!k) return false;
    if (k === cur) return false;
    if (seen.has(k)) return false;
    return true;
  });
}
