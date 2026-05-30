import { call } from "./client";

export type Resource =
  | "days"
  | "sessions"
  | "session_events"
  | "meals"
  | "activities"
  | "substances"
  | "body_metrics"
  | "finance_transactions"
  | "accounts"
  | "balance_snapshots"
  | "finance_planned_items"
  | "events"
  | "planner_events"
  | "mood_logs"
  | "nutrition_goals"
  | "raw_logs";

type DataResponse<T> = { rows: T[]; resource: Resource; count: number };

export type DayRow = {
  date: string;
  wake_time: string | null;
  sleep_time: string | null;
  sleep_hours: number | null;
  modafinil_mg: number;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  weight_kg: number | null;
  day_type: string | null;
  tags: string[];
  notes: string | null;
  updated_at: string;
};

export type SessionRow = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  type: string;
  category: string | null;
  project: string | null;
  intensity: number | null;
  quality: number | null;
  notes: string | null;
  source_log_id: string | null;
  created_at: string;
};

export type SessionEventRow = {
  id: string;
  date: string;
  session_id: string | null;
  start_time: string;
  end_time: string;
  duration_min: number;
  kind: string;
  category: string | null;
  title: string | null;
  sport_type: string | null;
  distance_km: number | null;
  calories_burned: number | null;
  pace: string | null;
  meal_id: string | null;
  activity_id: string | null;
  is_instant?: boolean;
  planned_amount: number | null;
  planned_currency: string | null;
  planned_account: string | null;
  notes: string | null;
};

export type MealRow = {
  id: string;
  date: string;
  time: string | null;
  slot: string | null;
  session_id: string | null;
  name: string;
  portion_grams: number | null;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  confidence: string | null;
  notes: string | null;
  photo_url: string | null;
  created_at: string;
};

export type SubstanceRow = {
  id: string;
  date: string;
  time: string | null;
  name: string;
  amount: number | null;
  unit: string | null;
  notes: string | null;
};

export type BodyMetricRow = {
  id: string;
  date: string;
  time: string | null;
  metric: string;
  value: number;
  unit: string | null;
};

export type FinanceRow = {
  id: string;
  date: string;
  time: string | null;
  amount: number;
  currency: string;
  account: string | null;
  counter_account: string | null;
  amount_counter: number | null;
  transfer_group_id: string | null;
  category: string | null;
  merchant: string | null;
  txn_type: string;
  session_id: string | null;
  session_event_id: string | null;
  notes: string | null;
};

export type AccountRow = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  notes: string | null;
  archived: boolean;
};

export type BalanceSnapshotRow = {
  date: string;
  total_rub: number;
  notes: string | null;
};

export type PlannedItemRow = {
  id: string;
  title: string;
  amount: number;
  currency: string;
  txn_type: string;
  recurrence: string;
  day_of_month: number | null;
  start_date: string;
  end_date: string | null;
  category: string | null;
  notes: string | null;
  active: boolean;
};

export type ActivityRow = {
  id: string;
  date: string;
  time: string | null;
  type: string;
  duration_min: number | null;
  calories_burned: number | null;
  distance_km: number | null;
  pace: string | null;
  intensity: number | null;
  source: string | null;
  notes: string | null;
};

export type EventRow = {
  id: string;
  date: string;
  end_date?: string | null;
  kind: string;
  detail: string | null;
  severity: string;
  budget_amount?: number | null;
  budget_currency?: string | null;
  budget_account?: string | null;
  finance_planned_item_id?: string | null;
};

export type RawLogRow = {
  id: string;
  occurred_at: string;
  source: string;
  raw_text: string | null;
  parsed_json: unknown;
  reply_text: string | null;
  status: string;
  status_reason: string | null;
};

export async function fetchRows<T = unknown>(
  resource: Resource,
  opts: { from?: string; to?: string; limit?: number; order?: "asc" | "desc" } = {},
): Promise<T[]> {
  const res = await call<DataResponse<T>>("data", { resource, ...opts });
  return res.rows ?? [];
}

// Bulk fetcher for the dashboard's initial load.
export async function fetchDashboardSnapshot(opts: { from?: string; to?: string } = {}) {
  const [days, sessions, session_events, meals, substances, body_metrics, finance, accounts, balance_snapshots, finance_planned_items, activities, events] =
    await Promise.all([
      fetchRows<DayRow>("days", { ...opts, limit: 1000, order: "asc" }),
      fetchRows<SessionRow>("sessions", { ...opts, limit: 5000, order: "asc" }),
      fetchRows<SessionEventRow>("session_events", { ...opts, limit: 5000, order: "asc" }),
      fetchRows<MealRow>("meals", { ...opts, limit: 2000, order: "asc" }),
      fetchRows<SubstanceRow>("substances", { ...opts, limit: 2000, order: "asc" }),
      fetchRows<BodyMetricRow>("body_metrics", { ...opts, limit: 2000, order: "asc" }),
      fetchRows<FinanceRow>("finance_transactions", { ...opts, limit: 2000, order: "asc" }),
      fetchRows<AccountRow>("accounts", { limit: 50, order: "asc" }),
      fetchRows<BalanceSnapshotRow>("balance_snapshots", { ...opts, limit: 2000, order: "asc" }),
      fetchRows<PlannedItemRow>("finance_planned_items", { limit: 500, order: "asc" }),
      fetchRows<ActivityRow>("activities", { ...opts, limit: 2000, order: "asc" }),
      fetchRows<EventRow>("events", { ...opts, limit: 1000, order: "asc" }),
    ]);
  return {
    days,
    sessions,
    session_events,
    meals,
    substances,
    body_metrics,
    finance,
    accounts,
    balance_snapshots,
    finance_planned_items,
    activities,
    events,
  };
}
