// POST /confirm { raw_log_id, decision: "confirm" | "reject", overrides? }
// Executes the proposed actions from raw_logs.parsed_json against typed tables.

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";
import { applyActions, type Action } from "../_shared/applyActions.ts";
import { executeDayPlan } from "../_shared/dayPlanExecute.ts";
import type { DayPlan } from "../_shared/dayLogParser.ts";

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

  const parsed = log.parsed_json as {
    actions?: Action[];
    pipeline?: string;
    plan?: DayPlan;
  } | null;

  if (parsed?.pipeline === "day_plan_v1" && parsed.plan) {
    const out = await executeDayPlan(db, parsed.plan, log.id);
    const logStatus = out.ok ? "saved" : "error";
    await db
      .from("raw_logs")
      .update({
        status: logStatus,
        status_reason: out.ok ? null : JSON.stringify(out.results),
      })
      .eq("id", log.id);
    return json({
      ok: out.ok,
      pipeline: "day_plan_v1",
      results: out.results.map((r) => ({ type: r.step, ok: r.ok, error: r.error })),
    });
  }

  const rawActions: Action[] = body.overrides || (parsed?.actions ?? []);

  const out = await applyActions(db, rawActions, {
    sourceLogId: log.id,
    swallowOk: body.swallow_ok === true,
  });

  if (out.error === "swallow_required") {
    return json({
      ok: false,
      error: "swallow_required",
      warnings: out.warnings,
      results: out.results,
    }, { status: 409 });
  }

  const allOk = out.ok;
  const hasWritable = out.results.some((r) => r.type !== "ask_clarification");
  const logStatus = !hasWritable ? "pending" : allOk ? "saved" : "error";
  await db
    .from("raw_logs")
    .update({
      status: logStatus,
      status_reason: allOk ? null : JSON.stringify(out.results),
    })
    .eq("id", log.id);

  return json({ ok: allOk, results: out.results });
});
