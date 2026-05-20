// Session timeline helpers: overlap resolution, cascade shifts, swallow detection.

export const MIN_SESSION_MIN = 5;

export type SessionLike = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  type?: string | null;
  category?: string | null;
  project?: string | null;
  notes?: string | null;
};

export type SwallowWarning = {
  victim_id: string;
  victim_label: string;
  mover_id: string;
  mover_label: string;
  message: string;
};

export function toMin(t: string): number {
  const parts = String(t).split(":").map(Number);
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export function fromMin(total: number): string {
  const m = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}

export function trimTime(t: string): string {
  return String(t).slice(0, 5);
}

export function labelSession(s: SessionLike): string {
  if (s.project) return String(s.project);
  if (s.category) return String(s.category);
  if (s.type) return String(s.type);
  return "сессия";
}

export function sortSessions(sessions: SessionLike[]): SessionLike[] {
  return [...sessions].sort((a, b) => {
    const d = toMin(a.start_time) - toMin(b.start_time);
    if (d !== 0) return d;
    return a.id.localeCompare(b.id);
  });
}

function sessionDurationMin(s: SessionLike): number {
  const d = toMin(s.end_time) - toMin(s.start_time);
  if (d > 0) return d;
  return s.duration_min > 0 ? s.duration_min : MIN_SESSION_MIN;
}

export function syncSessionTimes(s: SessionLike): SessionLike {
  const start = toMin(s.start_time);
  let dur = sessionDurationMin(s);
  if (dur < MIN_SESSION_MIN) dur = MIN_SESSION_MIN;
  const end = start + dur;
  return {
    ...s,
    start_time: fromMin(start),
    end_time: fromMin(end),
    duration_min: Math.round(dur),
  };
}

function isContained(inner: SessionLike, outer: SessionLike): boolean {
  if (inner.id === outer.id) return false;
  const is = toMin(inner.start_time);
  const ie = toMin(inner.end_time);
  const os = toMin(outer.start_time);
  const oe = toMin(outer.end_time);
  return is >= os && ie <= oe;
}

function buildSwallowMessage(mover: SessionLike, victim: SessionLike): string {
  const moverEnd = trimTime(mover.end_time);
  const victimLabel = labelSession(victim);
  const victimRange = `${trimTime(victim.start_time)}–${trimTime(victim.end_time)}`;
  return (
    `Если подвинуть окончание «${labelSession(mover)}» на ${moverEnd}, ` +
    `сессия «${victimLabel}» (${victimRange}) будет поглощена и удалена. Продолжить?`
  );
}

/**
 * Remove contained sessions, push overlapping neighbors forward (preserve duration),
 * flag sessions that would shrink below MIN_SESSION_MIN.
 */
export function resolveDaySessions(
  input: SessionLike[],
  opts: { allowSwallow?: boolean } = {},
): { sessions: SessionLike[]; deletedIds: string[]; warnings: SwallowWarning[] } {
  const allowSwallow = Boolean(opts.allowSwallow);
  let sessions = sortSessions(input.map(syncSessionTimes));
  const warnings: SwallowWarning[] = [];
  const deletedIds: string[] = [];

  // Fully contained → swallow candidate
  const contained = new Set<string>();
  for (const outer of sessions) {
    for (const inner of sessions) {
      if (isContained(inner, outer)) contained.add(inner.id);
    }
  }
  for (const id of contained) {
    const victim = sessions.find((s) => s.id === id);
    if (!victim) continue;
    const outer = sessions.find((s) => s.id !== id && isContained(victim, s));
    if (!outer) continue;
    warnings.push({
      victim_id: victim.id,
      victim_label: labelSession(victim),
      mover_id: outer.id,
      mover_label: labelSession(outer),
      message: buildSwallowMessage(outer, victim),
    });
    if (allowSwallow) {
      deletedIds.push(id);
      sessions = sessions.filter((s) => s.id !== id);
    }
  }

  if (!allowSwallow && warnings.length) {
    return { sessions, deletedIds: [], warnings };
  }

  // Cascade forward overlaps
  let changed = true;
  while (changed) {
    changed = false;
    sessions = sortSessions(sessions.map(syncSessionTimes));
    for (let i = 0; i < sessions.length - 1; i++) {
      const cur = sessions[i];
      const next = sessions[i + 1];
      const curEnd = toMin(cur.end_time);
      const nextStart = toMin(next.start_time);
      if (curEnd > nextStart) {
        const dur = sessionDurationMin(next);
        const pushed = syncSessionTimes({
          ...next,
          start_time: fromMin(curEnd),
          end_time: fromMin(curEnd + dur),
        });
        if (sessionDurationMin(pushed) < MIN_SESSION_MIN) {
          warnings.push({
            victim_id: next.id,
            victim_label: labelSession(next),
            mover_id: cur.id,
            mover_label: labelSession(cur),
            message: buildSwallowMessage(cur, next),
          });
          if (allowSwallow) {
            deletedIds.push(next.id);
            sessions = sessions.filter((s) => s.id !== next.id);
          } else {
            return { sessions, deletedIds: [], warnings };
          }
        } else {
          sessions[i + 1] = pushed;
        }
        changed = true;
      }
    }
  }

  sessions = sortSessions(sessions.map(syncSessionTimes));

  // Too-short sessions
  for (const s of sessions) {
    if (sessionDurationMin(s) < MIN_SESSION_MIN) {
      const idx = sessions.indexOf(s);
      const mover = idx > 0 ? sessions[idx - 1] : sessions[0];
      const w: SwallowWarning = {
        victim_id: s.id,
        victim_label: labelSession(s),
        mover_id: mover?.id ?? s.id,
        mover_label: mover ? labelSession(mover) : labelSession(s),
        message:
          `Сессия «${labelSession(s)}» (${trimTime(s.start_time)}–${trimTime(s.end_time)}) ` +
          `короче ${MIN_SESSION_MIN} мин и будет удалена.`,
      };
      if (!warnings.some((x) => x.victim_id === s.id)) warnings.push(w);
      if (allowSwallow) {
        deletedIds.push(s.id);
        sessions = sessions.filter((x) => x.id !== s.id);
      }
    }
  }

  if (!allowSwallow && warnings.length) {
    return { sessions: sortSessions(sessions.map(syncSessionTimes)), deletedIds: [], warnings };
  }

  if (allowSwallow && deletedIds.length) {
    return resolveDaySessions(sessions, { allowSwallow: true });
  }

  return { sessions: sortSessions(sessions.map(syncSessionTimes)), deletedIds, warnings };
}
