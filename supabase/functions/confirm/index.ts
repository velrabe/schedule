// POST /confirm { raw_log_id, decision: "confirm" | "reject", overrides? }
// Executes the proposed actions from raw_logs.parsed_json against typed tables.

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";
import {
  normalizeAction,
  normalizeActionType,
  normalizeDayPatch,
  normalizeMealPayload,
  normalizeSessionPayload,
  padTime,
  diffMinutes,
} from "../_shared/actions.ts";
import {
  executeSessionActions,
  isSessionScheduleAction,
  SwallowRequiredError,
} from "../_shared/sessionConfirm.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Action = { type: string; data: Record<string, unknown> };

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!JWT_SECRET) return json({ error: "server_misconfigured" }, { status: 500 });
  const auth = await requireAuth(req, JWT_SECRET);
  if (auth instanceof Response) return auth;

  let body: {
    raw_log_id?: string;
    decision?: "confirm" | "reject";
    overrides?: Action[];
    swallow_ok?: boolean;
  } = {};
  try {
    body = await req.json();
  } catch {}

  if (!body.raw_log_id || !body.decision) {
    return json({ error: "missing_fields" }, { status: 400 });
  }

  const db = admin();

  const { data: log, error: getErr } = await db
    .from("raw_logs")
    .select("id, parsed_json, status")
    .eq("id", body.raw_log_id)
    .single();
  if (getErr || !log) return json({ error: "raw_log_not_found" }, { status: 404 });

  if (body.decision === "reject") {
    await db.from("raw_logs").update({ status: "rejected" }).eq("id", log.id);
    return json({ ok: true, status: "rejected" });
  }

  const rawActions: Action[] = body.overrides ||
    ((log.parsed_json as { actions?: Action[] } | null)?.actions ?? []);
  const actions = rawActions.map((a) => normalizeAction(a));

  const results: Array<{ type: string; ok: boolean; error?: string; row?: unknown }> = [];
  const scheduleActions = actions.filter((a) => isSessionScheduleAction(a.type));
  const otherActions = actions.filter((a) => !isSessionScheduleAction(a.type));

  for (const action of otherActions) {
    if (action.type === "ask_clarification") {
      results.push({ type: action.type, ok: true, row: { skipped: true } });
      continue;
    }
    try {
      const row = await execute(db, action, log.id);
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
        log.id,
        body.swallow_ok === true,
      );
      results.push({
        type: "session_schedule",
        ok: true,
        row: out,
      });
    } catch (err) {
      if (err instanceof SwallowRequiredError) {
        return json({
          ok: false,
          error: "swallow_required",
          warnings: err.warnings,
          results,
        }, { status: 409 });
      }
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ type: "session_schedule", ok: false, error: msg });
    }
  }

  const allOk = results.every((r) => r.ok);
  await db
    .from("raw_logs")
    .update({ status: allOk ? "saved" : "error", status_reason: allOk ? null : JSON.stringify(results) })
    .eq("id", log.id);

  return json({ ok: allOk, results });
});

async function execute(db: SupabaseClient, action: Action, sourceLogId: string): Promise<unknown> {
  const type = normalizeActionType(action.type);
  const d = action.data;
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
          source_log_id: sourceLogId,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "close_work_session": {
      // Find the most recent open session of type work and close it.
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
        .insert({ ...row, source_log_id: sourceLogId })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_activity": {
      const { data, error } = await db
        .from("activities")
        .insert({ ...d, source_log_id: sourceLogId })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_substance": {
      const { data, error } = await db
        .from("substances")
        .insert({ ...d, source_log_id: sourceLogId })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_body_metric": {
      const { data, error } = await db
        .from("body_metrics")
        .insert({ ...d, source_log_id: sourceLogId })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_finance_transaction": {
      const { data, error } = await db
        .from("finance_transactions")
        .insert({ ...d, source_log_id: sourceLogId })
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    case "create_event": {
      const { data, error } = await db
        .from("events")
        .insert({ ...d, source_log_id: sourceLogId })
        .select()
        .single();
      if (error) throw error;
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
        .insert({ ...d, source_log_id: sourceLogId })
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

function toMin(t: string): number {
  const [h, m] = t.split(":").map((x) => Number(x));
  return (h ?? 0) * 60 + (m ?? 0);
}
