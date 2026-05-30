import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  normalizeSessionPayload,
  normalizeActionType,
  padTime,
} from "./actions.ts";
import {
  type SessionLike,
  type SwallowWarning,
  resolveDaySessions,
  syncSessionTimes,
  labelSession,
  trimTime,
} from "./sessionSchedule.ts";
import { isFoodSession, syncMealsForSessions } from "./foodMealSync.ts";
import { afterSessionDelete, ensureSessionEventMirror } from "./sessionEvents.ts";

export class SwallowRequiredError extends Error {
  code = "swallow_required";
  warnings: SwallowWarning[];
  constructor(warnings: SwallowWarning[]) {
    super(warnings[0]?.message ?? "swallow_required");
    this.warnings = warnings;
  }
}

const SESSION_TYPES = new Set([
  "create_session",
  "update_session",
  "delete_session",
]);

export function isSessionScheduleAction(type: string): boolean {
  return SESSION_TYPES.has(normalizeActionType(type));
}

function rowToSession(row: Record<string, unknown>): SessionLike {
  return {
    id: String(row.id),
    date: String(row.date),
    start_time: String(row.start_time),
    end_time: String(row.end_time),
    duration_min: Number(row.duration_min) || 0,
    type: row.type != null ? String(row.type) : null,
    category: row.category != null ? String(row.category) : null,
    project: row.project != null ? String(row.project) : null,
    notes: row.notes != null ? String(row.notes) : null,
  };
}

/** Partial update payload for an existing session. */
export function normalizeUpdateSessionPayload(
  raw: Record<string, unknown>,
  existing: SessionLike,
): SessionLike {
  const start_time = raw.start_time != null || raw.start != null
    ? padTime(raw.start_time ?? raw.start) ?? existing.start_time
    : existing.start_time;
  const end_time = raw.end_time != null || raw.end != null
    ? padTime(raw.end_time ?? raw.end) ?? existing.end_time
    : existing.end_time;
  return syncSessionTimes({
    ...existing,
    start_time,
    end_time,
    type: raw.type != null ? String(raw.type) : existing.type,
    category: raw.category != null ? String(raw.category) : existing.category,
    project: raw.project != null
      ? (raw.project === "" ? null : String(raw.project))
      : existing.project,
    notes: raw.notes != null
      ? (raw.notes === "" ? null : String(raw.notes))
      : raw.note != null
      ? String(raw.note)
      : existing.notes,
  });
}

type PlannedMutation = {
  date: string;
  upserts: SessionLike[];
  deleteIds: string[];
};

function planMutations(
  actions: Array<{ type: string; data: Record<string, unknown> }>,
  byId: Map<string, SessionLike>,
): PlannedMutation[] {
  const byDate = new Map<string, PlannedMutation>();

  const ensure = (date: string): PlannedMutation => {
    if (!byDate.has(date)) byDate.set(date, { date, upserts: [], deleteIds: [] });
    return byDate.get(date)!;
  };

  for (const action of actions) {
    const type = normalizeActionType(action.type);
    const d = action.data;

    if (type === "delete_session") {
      const id = String(d.id ?? d.session_id);
      const existing = byId.get(id);
      const date = String(d.date ?? existing?.date ?? "");
      if (!date) continue;
      const m = ensure(date);
      if (!m.deleteIds.includes(id)) m.deleteIds.push(id);
      m.upserts = m.upserts.filter((s) => s.id !== id);
      continue;
    }

    if (type === "update_session") {
      const id = String(d.id ?? d.session_id);
      const existing = byId.get(id);
      if (!existing) throw new Error(`session_not_found:${id}`);
      const date = String(d.date ?? existing.date);
      const m = ensure(date);
      const updated = normalizeUpdateSessionPayload(d, existing);
      m.upserts = m.upserts.filter((s) => s.id !== id);
      m.upserts.push(updated);
      continue;
    }

    if (type === "create_session") {
      const row = normalizeSessionPayload(d) as Record<string, unknown>;
      const date = String(row.date);
      const m = ensure(date);
      const id = d.id != null ? String(d.id) : crypto.randomUUID();
      m.upserts.push(
        syncSessionTimes({
          id,
          date,
          start_time: String(row.start_time),
          end_time: String(row.end_time),
          duration_min: Number(row.duration_min),
          type: row.type != null ? String(row.type) : null,
          category: row.category != null ? String(row.category) : null,
          project: row.project != null ? String(row.project) : null,
          notes: row.notes != null ? String(row.notes) : null,
        }),
      );
    }
  }

  return [...byDate.values()];
}

function applyMutationsToDay(
  base: SessionLike[],
  mutation: PlannedMutation,
): SessionLike[] {
  let sessions = base.filter((s) => !mutation.deleteIds.includes(s.id));
  for (const u of mutation.upserts) {
    const idx = sessions.findIndex((s) => s.id === u.id);
    if (idx >= 0) sessions[idx] = { ...sessions[idx], ...u };
    else sessions.push(u);
  }
  return sessions;
}

export async function previewSessionActions(
  db: SupabaseClient,
  actions: Array<{ type: string; data: Record<string, unknown> }>,
): Promise<SwallowWarning[]> {
  const sessionActions = actions.filter((a) => isSessionScheduleAction(a.type));
  if (!sessionActions.length) return [];

  const ids = new Set<string>();
  for (const a of sessionActions) {
    const d = a.data;
    const type = normalizeActionType(a.type);
    if (type === "create_session") continue;
    const id = String(d.id ?? d.session_id ?? "");
    if (id) ids.add(id);
  }

  const byId = new Map<string, SessionLike>();
  if (ids.size) {
    const { data, error } = await db.from("sessions").select("*").in("id", [...ids]);
    if (error) throw error;
    for (const row of data || []) byId.set(String(row.id), rowToSession(row));
  }

  const plans = planMutations(sessionActions, byId);
  const warnings: SwallowWarning[] = [];

  for (const plan of plans) {
    const { data, error } = await db.from("sessions").select("*").eq("date", plan.date);
    if (error) throw error;
    const base = (data || []).map((r) => rowToSession(r));
    const merged = applyMutationsToDay(base, plan);
    const resolved = resolveDaySessions(merged, { allowSwallow: false });
    warnings.push(...resolved.warnings);
  }

  return warnings;
}

export async function executeSessionActions(
  db: SupabaseClient,
  actions: Array<{ type: string; data: Record<string, unknown> }>,
  sourceLogId: string,
  allowSwallow: boolean,
): Promise<{ updated: SessionLike[]; deletedIds: string[]; warnings: SwallowWarning[] }> {
  const sessionActions = actions.filter((a) => isSessionScheduleAction(a.type));
  if (!sessionActions.length) {
    return { updated: [], deletedIds: [], warnings: [] };
  }

  const ids = new Set<string>();
  for (const a of sessionActions) {
    const d = a.data;
    const type = normalizeActionType(a.type);
    if (type === "create_session") continue;
    const id = String(d.id ?? d.session_id ?? "");
    if (id) ids.add(id);
  }

  const byId = new Map<string, SessionLike>();
  if (ids.size) {
    const { data, error } = await db.from("sessions").select("*").in("id", [...ids]);
    if (error) throw error;
    for (const row of data || []) byId.set(String(row.id), rowToSession(row));
  }

  const plans = planMutations(sessionActions, byId);
  const allUpdated: SessionLike[] = [];
  const allDeleted: string[] = [];
  const allWarnings: SwallowWarning[] = [];

  for (const plan of plans) {
    const { data, error } = await db.from("sessions").select("*").eq("date", plan.date);
    if (error) throw error;
    const base = (data || []).map((r) => rowToSession(r));
    const merged = applyMutationsToDay(base, plan);
    const resolved = resolveDaySessions(merged, { allowSwallow });

    if (resolved.warnings.length && !allowSwallow) {
      throw new SwallowRequiredError(resolved.warnings);
    }

    allWarnings.push(...resolved.warnings);

    for (const id of resolved.deletedIds) {
      await afterSessionDelete(db, id);
      const { error: delErr } = await db.from("sessions").delete().eq("id", id);
      if (delErr) throw delErr;
      allDeleted.push(id);
    }

    const writtenSessions: SessionLike[] = [];
    for (const s of resolved.sessions) {
      const payload = {
        date: s.date,
        start_time: s.start_time,
        end_time: s.end_time,
        duration_min: s.duration_min,
        type: s.type ?? "chill",
        category: s.category,
        project: s.project,
        notes: s.notes,
        source_log_id: sourceLogId,
      };
      const existed = base.some((b) => b.id === s.id);
      if (existed) {
        const { error: upErr } = await db.from("sessions").update(payload).eq("id", s.id);
        if (upErr) throw upErr;
      } else {
        const { error: insErr } = await db.from("sessions").insert({ id: s.id, ...payload });
        if (insErr) throw insErr;
      }
      allUpdated.push(s);
      writtenSessions.push(s);
      await ensureSessionEventMirror(db, s.id, sourceLogId);
    }

    await syncMealsForSessions(db, writtenSessions.filter((s) => isFoodSession(s)), sourceLogId);
  }

  return { updated: allUpdated, deletedIds: allDeleted, warnings: allWarnings };
}

/** Human summary lines for cascade / swallow (Russian). */
export function formatScheduleSideEffects(
  updated: SessionLike[],
  deletedIds: string[],
  warnings: SwallowWarning[],
): string[] {
  const lines: string[] = [];
  for (const s of updated) {
    lines.push(
      `Сессия ${labelSession(s)}: ${trimTime(s.start_time)}–${trimTime(s.end_time)} (${s.duration_min}m)`,
    );
  }
  for (const w of warnings) {
    if (deletedIds.includes(w.victim_id)) {
      lines.push(`Удалена: ${w.victim_label}`);
    }
  }
  return lines;
}
