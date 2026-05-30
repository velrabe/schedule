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
import {
  afterFoodSessionWrite,
  afterMealWrite,
  isFoodSession,
} from "../_shared/foodMealSync.ts";
import {
  afterSessionDelete,
  afterSessionEventWrite,
  normalizeSessionEventPayload,
} from "../_shared/sessionEvents.ts";
import {
  syncSessionExpense,
  deleteSessionExpenses,
  type SessionExpenseInput,
} from "../_shared/sessionExpenseSync.ts";
import {
  afterFinanceWrite,
  reverseFinanceWrite,
  replaceFinanceWrite,
  type FinanceRow,
} from "../_shared/financeBalanceSync.ts";
import { afterEventWrite, beforeEventDelete } from "../_shared/eventFinanceSync.ts";

const ALLOWED = new Set([
  "days",
  "sessions",
  "session_events",
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
  "balance_snapshots",
  "finance_planned_items",
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
  if (resource === "session_events" && (op === "insert" || op === "upsert" || op === "update")) {
    return normalizeSessionEventPayload(row);
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

  const { resource, op, id, match, expense, expense_session_id, expense_event_id } = body;
  const row = body.row ?? {};

  async function applyExpenseForSession(
    sessionId: string,
    sessionRow: Record<string, unknown>,
  ): Promise<void> {
    if (expense === undefined) return;
    await syncSessionExpense(
      db,
      sessionId,
      {
        date: String(sessionRow.date),
        start_time: sessionRow.start_time != null ? String(sessionRow.start_time) : null,
        category: sessionRow.category != null ? String(sessionRow.category) : null,
        type: sessionRow.type != null ? String(sessionRow.type) : null,
        project: sessionRow.project != null ? String(sessionRow.project) : null,
        notes: sessionRow.notes != null ? String(sessionRow.notes) : null,
      },
      expense,
    );
  }

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
      if (resource === "sessions" && data) {
        await afterFoodSessionWrite(db, String((data as Record<string, unknown>).id));
      }
      if (resource === "session_events" && data) {
        await afterSessionEventWrite(db, String((data as Record<string, unknown>).id), {
          expense: expense as SessionExpenseInput | undefined,
        });
      }
      if (resource === "meals" && data) {
        await afterMealWrite(db, String((data as Record<string, unknown>).id));
      }
      if (resource === "finance_transactions" && data) {
        await afterFinanceWrite(db, String((data as Record<string, unknown>).id));
      }
      if (resource === "events" && data) {
        await afterEventWrite(db, String((data as Record<string, unknown>).id));
      }
      return json({ row: data });
    }

    if (op === "upsert") {
      const { data, error } = await table.upsert(normalizedRow).select().single();
      if (error) throw error;
      if (resource === "sessions" && data) {
        await afterFoodSessionWrite(db, String((data as Record<string, unknown>).id));
      }
      if (resource === "session_events" && data) {
        await afterSessionEventWrite(db, String((data as Record<string, unknown>).id), {
          expense: expense as SessionExpenseInput | undefined,
        });
      }
      if (resource === "meals" && data) {
        await afterMealWrite(db, String((data as Record<string, unknown>).id));
      }
      if (resource === "finance_transactions" && data) {
        await afterFinanceWrite(db, String((data as Record<string, unknown>).id));
      }
      if (resource === "events" && data) {
        await afterEventWrite(db, String((data as Record<string, unknown>).id));
      }
      return json({ row: data });
    }

    if (op === "update") {
      if (!id && !match) return json({ error: "id_or_match_required" }, { status: 400 });
      let oldFinance: FinanceRow | null = null;
      if (resource === "finance_transactions" && id) {
        const { data: prev } = await db.from("finance_transactions").select("*").eq("id", id).single();
        if (prev) oldFinance = prev as FinanceRow;
      }
      let q = table.update(normalizedRow);
      if (id) q = q.eq("id", id);
      if (match) {
        for (const [k, v] of Object.entries(match)) q = q.eq(k, v as never);
      }
      const { data, error } = await q.select();
      if (error) throw error;
      const row0 = (data as Record<string, unknown>[] | null)?.[0];
      if (resource === "sessions" && id) {
        await afterFoodSessionWrite(db, id);
      } else if (resource === "sessions" && row0) {
        await afterFoodSessionWrite(db, String(row0.id));
      }
      if (resource === "session_events" && id) {
        await afterSessionEventWrite(db, id, { expense: expense as SessionExpenseInput | undefined });
      } else if (resource === "session_events" && row0) {
        await afterSessionEventWrite(db, String(row0.id), {
          expense: expense as SessionExpenseInput | undefined,
        });
      }
      if (resource === "meals" && id) {
        await afterMealWrite(db, id);
      } else if (resource === "meals" && row0) {
        await afterMealWrite(db, String(row0.id));
      }

      if (expense !== undefined) {
        let sid = expense_session_id || (resource === "sessions" ? id : null);
        if (resource === "meals") {
          const mealId = id || (row0 ? String(row0.id) : null);
          if (mealId) {
            const { data: meal } = await db.from("meals").select("session_id, date, time").eq("id", mealId)
              .single();
            if (meal?.session_id) {
              sid = String(meal.session_id);
              const { data: sess } = await db.from("sessions").select("*").eq("id", sid).single();
              if (sess) await applyExpenseForSession(sid, sess as Record<string, unknown>);
            }
          }
        } else if (sid) {
          const { data: sess } = await db.from("sessions").select("*").eq("id", sid).single();
          if (sess) await applyExpenseForSession(sid, sess as Record<string, unknown>);
        }
      }

      if (resource === "finance_transactions" && row0) {
        const newId = String(row0.id);
        if (oldFinance) await replaceFinanceWrite(db, oldFinance, newId);
        else await afterFinanceWrite(db, newId);
      }
      if (resource === "events" && id) {
        await afterEventWrite(db, id);
      } else if (resource === "events" && row0) {
        await afterEventWrite(db, String(row0.id));
      }

      return json({ rows: data });
    }

    if (op === "delete") {
      if (!id && !match) return json({ error: "id_or_match_required" }, { status: 400 });
      if (resource === "finance_transactions" && id) {
        const { data: prev } = await db.from("finance_transactions").select("*").eq("id", id).single();
        if (prev) await reverseFinanceWrite(db, prev as FinanceRow);
      }
      if (resource === "meals" && id) {
        const { data: meal } = await db.from("meals").select("session_id").eq("id", id).maybeSingle();
        if (meal?.session_id) {
          await db.from("sessions").delete().eq("id", meal.session_id);
        }
      }
      if (resource === "session_events" && id) {
        const { deleteSessionEventTree } = await import("../_shared/sessionEvents.ts");
        await deleteSessionEventTree(db, id);
        return json({ rows: [] });
      }
      if (resource === "sessions" && id) {
        await afterSessionDelete(db, id);
      }
      if (resource === "events" && id) {
        await beforeEventDelete(db, id);
      }
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
