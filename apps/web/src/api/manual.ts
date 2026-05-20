import { call } from "./client";

export type ManualResource =
  | "days"
  | "sessions"
  | "meals"
  | "activities"
  | "substances"
  | "body_metrics"
  | "finance_transactions"
  | "events"
  | "planner_events"
  | "mood_logs"
  | "nutrition_goals"
  | "accounts";

export type ManualOp = "insert" | "update" | "delete" | "upsert";

export type ManualPayload = {
  resource: ManualResource;
  op: ManualOp;
  row?: Record<string, unknown>;
  id?: string;
  match?: Record<string, unknown>;
};

export async function manual<T = unknown>(payload: ManualPayload): Promise<T> {
  return call<T>("manual", payload);
}

// Convenience helpers
export const upsertRow = (resource: ManualResource, row: Record<string, unknown>) =>
  manual<{ row: unknown }>({ resource, op: "upsert", row });

export const insertRow = (resource: ManualResource, row: Record<string, unknown>) =>
  manual<{ row: unknown }>({ resource, op: "insert", row });

export const updateRow = (
  resource: ManualResource,
  id: string,
  row: Record<string, unknown>,
) => manual<{ rows: unknown[] }>({ resource, op: "update", id, row });

export const deleteRow = (resource: ManualResource, id: string) =>
  manual<{ rows: unknown[] }>({ resource, op: "delete", id });

export function notifyDataChanged() {
  window.dispatchEvent(new CustomEvent("schedule:data-changed"));
}
