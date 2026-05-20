// POST /manual — single-user write endpoint for direct edits from the UI.
// Body: { resource, op, row?, id?, match? }
// op ∈ insert | update | delete | upsert

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";
import {
  normalizeDayPatch,
  normalizeMealPayload,
  normalizeSessionPayload,
  padTime,
  diffMinutes,
  inferSessionType,
} from "../_shared/actions.ts";

const ALLOWED = new Set([
  "days",
  "sessions",
  "meals",
  "activities",
  "substances",
  "body_metrics",
  "finance_transactions",
  "events",
  "planner_events",
  "mood_logs",
  "nutrition_goals",
  "accounts",
]);

const ALLOWED_OPS = new Set(["insert", "update", "delete", "upsert"]);

function normalizeManualRow(
  resource: string,
  op: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  if (resource === "sessions") {
    if (op === "update") return normalizeSessionUpdatePatch(row);
    if (op === "insert" || op === "upsert") return normalizeSessionPayload(row);
  }
  if (resource === "meals" && (op === "insert" || op === "upsert" || op === "update")) {
    return normalizeMealPayload(row);
  }
  if (resource === "days" && (op === "upsert" || op === "update")) {
    return normalizeDayPatch(row);
  }
  if (resource === "activities" && row.time != null) {
    return { ...row, time: padTime(row.time) };
  }
  return row;
}

function normalizeSessionUpdatePatch(raw: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = { ...raw };
  if ("start" in patch) {
    patch.start_time = padTime(patch.start);
    delete patch.start;
  }
  if ("end" in patch) {
    patch.end_time = padTime(patch.end);
    delete patch.end;
  }
  if ("start_time" in patch) patch.start_time = padTime(patch.start_time);
  if ("end_time" in patch) patch.end_time = padTime(patch.end_time);
  if ("note" in patch) {
    patch.notes = patch.note;
    delete patch.note;
  }
  if (patch.start_time && patch.end_time) {
    patch.duration_min = diffMinutes(String(patch.start_time), String(patch.end_time));
  }
  if (patch.category != null && patch.type == null) {
    patch.type = inferSessionType(String(patch.category));
  }
  return patch;
}

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!JWT_SECRET) return json({ error: "server_misconfigured" }, { status: 500 });

  const auth = await requireAuth(req, JWT_SECRET);
  if (auth instanceof Response) return auth;

  let body: {
    resource?: string;
    op?: string;
    row?: Record<string, unknown>;
    id?: string;
    match?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, { status: 400 });
  }

  const { resource, op, id, match } = body;
  const row = body.row ?? {};

  if (!resource || !ALLOWED.has(resource)) {
    return json({ error: "resource_not_allowed", resource }, { status: 400 });
  }
  if (!op || !ALLOWED_OPS.has(op)) {
    return json({ error: "op_not_allowed", op }, { status: 400 });
  }

  const db = admin();
  const normalizedRow = normalizeManualRow(resource, op, row);

  try {
    const table = db.from(resource);

    if (op === "insert") {
      const { data, error } = await table.insert(normalizedRow).select().single();
      if (error) throw error;
      return json({ row: data });
    }

    if (op === "upsert") {
      const { data, error } = await table.upsert(normalizedRow).select().single();
      if (error) throw error;
      return json({ row: data });
    }

    if (op === "update") {
      if (!id && !match) return json({ error: "id_or_match_required" }, { status: 400 });
      let q = table.update(normalizedRow);
      if (id) q = q.eq("id", id);
      if (match) {
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      }
      const { data, error } = await q.select();
      if (error) throw error;
      return json({ rows: data });
    }

    if (op === "delete") {
      if (!id && !match) return json({ error: "id_or_match_required" }, { status: 400 });
      let q = table.delete();
      if (id) q = q.eq("id", id);
      if (match) {
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      }
      const { data, error } = await q.select();
      if (error) throw error;
      return json({ rows: data });
    }

    return json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: "db_error", detail: msg }, { status: 500 });
  }
});
