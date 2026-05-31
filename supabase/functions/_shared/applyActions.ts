import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import {
  normalizeAction,
  normalizeActionType,
  normalizeDayPatch,
  normalizeMealPayload,
  normalizeSubstancePayload,
  padTime,
} from "./actions.ts";
import {
  executeSessionActions,
  isSessionScheduleAction,
  SwallowRequiredError,
} from "./sessionConfirm.ts";
import { afterMealWrite } from "./foodMealSync.ts";
import { afterFinanceLinkedWrite } from "./financeEventSync.ts";
import { afterEventWrite } from "./eventFinanceSync.ts";
import {
  executeCreateSessionEvent,
  executeSessionBundle,
} from "./sessionEvents.ts";

export type Action = { type: string; data: Record<string, unknown> };

export type ActionResult = { type: string; ok: boolean; error?: string; row?: unknown };

function toMin(t: string): number {
  const [h, m] = t.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}

async function executeOne(
  db: SupabaseClient,
  action: Action,
  sourceLogId: string | null,
): Promise<unknown> {
  const type = normalizeActionType(action.type);
  const d = action.data;
  const logRef = sourceLogId ? { source_log_id: sourceLogId } : {};

  switch (type) {
    case "update_day": {
      const date = String(d.date);
      const patch = normalizeDayPatch(d);
      const { data, error } = await db
        .from("days")
        .upsert({ date, ...patch })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_work_session_open": {
      const start = padTime(d.start_time) ?? "00:00:00";
      const { data, error } = await db
        .from("sessions")
        .insert({
          date: d.date,
          start_time: start,
          end_time: start,
          duration_min: 0,
          type: "work",
          category: d.category ?? "work_paid",
          project: d.project ?? null,
          ...logRef,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "close_work_session": {
      const { data: open, error: e1 } = await db
        .from("open_sessions")
        .select("*")
        .eq("type", "work")
        .order("start_time", { ascending: false })
        .limit(1);
      if (e1) throw e1;
      const target = (open || [])[0];
      if (!target) throw new Error("no_open_work_session");
      const endTime = padTime(d.end_time) ?? String(d.end_time);
      const startMin = toMin(String(target.start_time));
      const endMin = toMin(endTime);
      const duration = (endMin - startMin + 24 * 60) % (24 * 60);
      const { data, error } = await db
        .from("sessions")
        .update({
          end_time: d.end_time,
          duration_min: duration,
          notes: d.notes ?? null,
        })
        .eq("id", target.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_meal": {
      const row = normalizeMealPayload(d);
      const { data, error } = await db
        .from("meals")
        .insert({ ...row, ...logRef })
        .select()
        .single();
      if (error) throw error;
      await afterMealWrite(db, String(data.id), sourceLogId ?? undefined);
      return data;
    }
    case "create_activity": {
      const { data, error } = await db
        .from("activities")
        .insert({ ...d, ...logRef })
        .select()
        .single();
      if (error) throw error;
      const { afterActivityWrite } = await import("./activityEventSync.ts");
      await afterActivityWrite(db, String(data.id));
      return data;
    }
    case "create_substance": {
      const row = normalizeSubstancePayload(d);
      const { data, error } = await db
        .from("substances")
        .insert({ ...row, ...logRef })
        .select()
        .single();
      if (error) throw error;
      const { afterSubstanceWrite } = await import("./substanceEventSync.ts");
      await afterSubstanceWrite(db, String(data.id));
      return data;
    }
    case "create_body_metric": {
      const { data, error } = await db
        .from("body_metrics")
        .insert({ ...d, ...logRef })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_finance_transaction": {
      const { data, error } = await db
        .from("finance_transactions")
        .insert({ ...d, ...logRef })
        .select()
        .single();
      if (error) throw error;
      await afterFinanceLinkedWrite(db, String(data.id));
      return data;
    }
    case "create_session_event": {
      return await executeCreateSessionEvent(db, d, sourceLogId);
    }
    case "create_session_bundle": {
      return await executeSessionBundle(db, d, sourceLogId);
    }
    case "create_event": {
      const { data, error } = await db
        .from("events")
        .insert({ ...d, ...logRef })
        .select()
        .single();
      if (error) throw error;
      await afterEventWrite(db, String(data.id));
      return data;
    }
    case "create_planner_event": {
      const { data, error } = await db
        .from("planner_events")
        .insert({ ...d })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_mood_log": {
      const { data, error } = await db
        .from("mood_logs")
        .insert({ ...d, ...logRef })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "ask_clarification":
      return { skipped: true };
    default:
      throw new Error(`unknown_action_type: ${type}`);
  }
}

/** Run structured actions (same schema as /chat → /confirm, no LLM). */
export async function applyActions(
  db: SupabaseClient,
  rawActions: Action[],
  opts: { sourceLogId?: string | null; swallowOk?: boolean } = {},
): Promise<{ ok: boolean; results: ActionResult[]; error?: string; warnings?: unknown }> {
  const sourceLogId = opts.sourceLogId ?? null;
  const actions = rawActions.map((a) => normalizeAction(a));
  const results: ActionResult[] = [];
  const scheduleActions = actions.filter((a) => isSessionScheduleAction(a.type));
  const otherActions = actions.filter((a) => !isSessionScheduleAction(a.type));

  for (const action of otherActions) {
    if (action.type === "ask_clarification") {
      results.push({ type: action.type, ok: true, row: { skipped: true } });
      continue;
    }
    try {
      const row = await executeOne(db, action, sourceLogId);
      results.push({ type: action.type, ok: true, row });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ type: action.type, ok: false, error: msg });
    }
  }

  if (scheduleActions.length) {
    try {
      const out = await executeSessionActions(
        db,
        scheduleActions,
        sourceLogId ?? "",
        opts.swallowOk === true,
      );
      results.push({ type: "session_schedule", ok: true, row: out });
    } catch (err) {
      if (err instanceof SwallowRequiredError) {
        return {
          ok: false,
          error: "swallow_required",
          warnings: err.warnings,
          results,
        };
      }
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ type: "session_schedule", ok: false, error: msg });
    }
  }

  const ok = results.every((r) => r.ok);
  return { ok, results };
}
