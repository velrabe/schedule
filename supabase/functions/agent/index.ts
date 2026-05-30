// POST /agent { actions: Action[], swallow_ok?: boolean }
// Direct writes for Codex / scripts — same action types as /chat → /confirm, no Gemini.

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";
import { applyActions, type Action } from "../_shared/applyActions.ts";

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!JWT_SECRET) return json({ error: "server_misconfigured" }, { status: 500 });
  const auth = await requireAuth(req, JWT_SECRET);
  if (auth instanceof Response) return auth;

  let body: { actions?: Action[]; swallow_ok?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, { status: 400 });
  }

  if (!Array.isArray(body.actions) || body.actions.length === 0) {
    return json({ error: "actions_required" }, { status: 400 });
  }

  const db = admin();
  const out = await applyActions(db, body.actions, {
    sourceLogId: null,
    swallowOk: body.swallow_ok === true,
  });

  if (out.error === "swallow_required") {
    return json({
      ok: false,
      error: out.error,
      warnings: out.warnings,
      results: out.results,
    }, { status: 409 });
  }

  return json({ ok: out.ok, results: out.results });
});
