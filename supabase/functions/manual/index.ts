// POST /manual — single-user write endpoint for direct edits from the UI.
// Body: { resource, op, row?, id?, match? }
// op ∈ insert | update | delete | upsert

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { verifyToken } from "../_shared/jwt.ts";
import { db } from "../_shared/db.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = req.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/, "");
  try {
    await verifyToken(token);
  } catch {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { resource, op, row, id, match } = body || {};
  if (!ALLOWED.has(resource)) {
    return new Response(JSON.stringify({ error: "resource_not_allowed", resource }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!ALLOWED_OPS.has(op)) {
    return new Response(JSON.stringify({ error: "op_not_allowed", op }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const table = db.from(resource);

    if (op === "insert") {
      const { data, error } = await table.insert(row).select().single();
      if (error) throw error;
      return ok({ row: data });
    }

    if (op === "upsert") {
      const { data, error } = await table.upsert(row).select().single();
      if (error) throw error;
      return ok({ row: data });
    }

    if (op === "update") {
      if (!id && !match) {
        return new Response(JSON.stringify({ error: "id_or_match_required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let q = table.update(row);
      if (id) q = q.eq("id", id);
      if (match) {
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      }
      const { data, error } = await q.select();
      if (error) throw error;
      return ok({ rows: data });
    }

    if (op === "delete") {
      if (!id && !match) {
        return new Response(JSON.stringify({ error: "id_or_match_required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      let q = table.delete();
      if (id) q = q.eq("id", id);
      if (match) {
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      }
      const { data, error } = await q.select();
      if (error) throw error;
      return ok({ rows: data });
    }

    return ok({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: "db_error", detail: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function ok(payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
