// Converts Supabase rows into the shape ScheduleTracker.jsx already expects.
// Also exposes a hook that loads + auto-refreshes after chat confirmations.

import { useEffect, useState, useCallback } from "preact/hooks";
import {
  fetchDashboardSnapshot,
  type DayRow,
  type SessionRow,
  type MealRow,
  type ActivityRow,
  type SubstanceRow,
  type BodyMetricRow,
  type FinanceRow,
  type EventRow,
} from "../api/data";

// Day shape the legacy dashboard works with.
export type DayShape = {
  id: string;
  date: string;
  dow: string;
  wake: string;
  sleep_start: string;
  sleep_h: number | null;
  modafinil_mg: number;
  mood: number | null;
  energy: number | null;
  focus: number | null;
  day_type: string;
  tags: string[];
  notes: string;
  weight_kg?: number | null;
};

export type SessionShape = {
  id: string;
  date: string;
  start: string;
  end: string;
  min: number;
  category: string;
  project: string;
  quality: number | null;
  note: string;
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function trimTime(t: string | null | undefined): string {
  if (!t) return "";
  // Postgres returns "HH:MM:SS" — strip to "HH:MM".
  return t.slice(0, 5);
}

function dowOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const idx = d.getUTCDay();
  return DOW[idx] ?? "?";
}

export function mapDay(r: DayRow): DayShape {
  return {
    id: r.date,
    date: r.date,
    dow: dowOf(r.date),
    wake: trimTime(r.wake_time),
    sleep_start: trimTime(r.sleep_time),
    sleep_h: r.sleep_hours,
    modafinil_mg: r.modafinil_mg ?? 0,
    mood: r.mood,
    energy: r.energy,
    focus: r.focus,
    day_type: r.day_type ?? "",
    tags: r.tags ?? [],
    notes: r.notes ?? "",
    weight_kg: r.weight_kg,
  };
}

export function mapSession(r: SessionRow): SessionShape {
  const cat = r.category ?? r.type ?? "";
  return {
    id: r.id,
    date: r.date,
    start: trimTime(r.start_time),
    end: trimTime(r.end_time),
    min: r.duration_min ?? 0,
    category: cat,
    project: r.project ?? "",
    quality: r.quality,
    note: r.notes ?? "",
  };
}

export type MealShape = MealRow;
export type ActivityShape = ActivityRow;
export type SubstanceShape = SubstanceRow;
export type BodyMetricShape = BodyMetricRow;
export type FinanceShape = FinanceRow;
export type EventShape = EventRow;

export type Snapshot = {
  days: DayShape[];
  sessions: SessionShape[];
  meals: MealShape[];
  activities: ActivityShape[];
  substances: SubstanceShape[];
  body_metrics: BodyMetricShape[];
  finance: FinanceShape[];
  events: EventShape[];
  raw: Awaited<ReturnType<typeof fetchDashboardSnapshot>>;
};

export type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; data: Snapshot }
  | { status: "empty" }
  | { status: "error"; error: string };

export function useSupabaseSnapshot() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const raw = await fetchDashboardSnapshot();
      if (raw.days.length === 0 && raw.sessions.length === 0) {
        setState({ status: "empty" });
        return;
      }
      const days = raw.days.map(mapDay);
      const sessions = raw.sessions.map(mapSession);
      setState({
        status: "ready",
        data: {
          days,
          sessions,
          meals: raw.meals,
          activities: raw.activities,
          substances: raw.substances,
          body_metrics: raw.body_metrics,
          finance: raw.finance,
          events: raw.events,
          raw,
        },
      });
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void load();
    const handler = () => void load();
    window.addEventListener("schedule:data-changed", handler);
    return () => window.removeEventListener("schedule:data-changed", handler);
  }, [load]);

  return { state, reload: load };
}
