// POST /data { resource, from?, to?, limit?, order? }
// Read-only proxy with whitelisted resources. Service-role under the hood,
// gated by our custom HS256 JWT.

import { preflight, json } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/jwt.ts";
import { admin } from "../_shared/db.ts";

type ResourceConfig = {
  table: string;
  dateCol: string;
  defaultOrder: Array<{ col: string; asc: boolean }>;
  // If true, dateCol is timestamptz and we filter via `>= from` / `< to+1day`.
  isTimestamp?: boolean;
};

const RESOURCES: Record<string, ResourceConfig> = {
  days: {
    table: "days",
    dateCol: "date",
    defaultOrder: [{ col: "date", asc: false }],
  },
  sessions: {
    table: "sessions",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "start_time", asc: true },
    ],
  },
  session_events: {
    table: "session_events",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "start_time", asc: true },
    ],
  },
  meals: {
    table: "meals",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "time", asc: true },
    ],
  },
  activities: {
    table: "activities",
    dateCol: "date",
    defaultOrder: [{ col: "date", asc: false }],
  },
  substances: {
    table: "substances",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "time", asc: true },
    ],
  },
  body_metrics: {
    table: "body_metrics",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "time", asc: true },
    ],
  },
  finance_transactions: {
    table: "finance_transactions",
    dateCol: "date",
    defaultOrder: [{ col: "date", asc: false }],
  },
  accounts: {
    table: "accounts",
    dateCol: "updated_at",
    isTimestamp: true,
    defaultOrder: [{ col: "id", asc: true }],
  },
  balance_snapshots: {
    table: "balance_snapshots",
    dateCol: "date",
    defaultOrder: [{ col: "date", asc: true }],
  },
  finance_planned_items: {
    table: "finance_planned_items",
    dateCol: "start_date",
    defaultOrder: [{ col: "start_date", asc: true }],
  },
  events: {
    table: "events",
    dateCol: "date",
    defaultOrder: [{ col: "date", asc: false }],
  },
  planner_events: {
    table: "planner_events",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "time", asc: true },
    ],
  },
  mood_logs: {
    table: "mood_logs",
    dateCol: "date",
    defaultOrder: [
      { col: "date", asc: false },
      { col: "time", asc: true },
    ],
  },
  nutrition_goals: {
    table: "nutrition_goals",
    dateCol: "effective_from",
    defaultOrder: [{ col: "effective_from", asc: false }],
  },
  raw_logs: {
    table: "raw_logs",
    dateCol: "occurred_at",
    isTimestamp: true,
    defaultOrder: [{ col: "occurred_at", asc: false }],
  },
};

const MAX_LIMIT = 5000;
const DEFAULT_LIMIT = 1000;

Deno.serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  const JWT_SECRET = Deno.env.get("JWT_SECRET");
  if (!JWT_SECRET) return json({ error: "server_misconfigured" }, { status: 500 });

  const auth = await requireAuth(req, JWT_SECRET);
  if (auth instanceof Response) return auth;

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405 });

  let body: {
    resource?: string;
    from?: string;
    to?: string;
    limit?: number;
    order?: "asc" | "desc";
  } = {};
  try {
    body = await req.json();
  } catch {}

  const resource = body.resource;
  if (!resource || !RESOURCES[resource]) {
    return json({ error: "unknown_resource", available: Object.keys(RESOURCES) }, { status: 400 });
  }
  const cfg = RESOURCES[resource];

  const limit = Math.min(Math.max(1, body.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

  const db = admin();
  let q = db.from(cfg.table).select("*").limit(limit);

  if (body.from) {
    q = cfg.isTimestamp ? q.gte(cfg.dateCol, body.from) : q.gte(cfg.dateCol, body.from);
  }
  if (body.to) {
    if (cfg.isTimestamp) {
      // Inclusive of the "to" day → upper bound at next day midnight UTC.
      const toExclusive = new Date(body.to);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
      q = q.lt(cfg.dateCol, toExclusive.toISOString().slice(0, 10));
    } else {
      q = q.lte(cfg.dateCol, body.to);
    }
  }
  for (const o of cfg.defaultOrder) {
    const asc = body.order === "asc" ? true : body.order === "desc" ? false : o.asc;
    q = q.order(o.col, { ascending: asc, nullsFirst: false });
  }

  const { data, error } = await q;
  if (error) {
    return json({ error: "query_failed", detail: error.message }, { status: 500 });
  }
  return json({ rows: data ?? [], resource, count: (data ?? []).length });
});
