// Normalize LLM action types + payloads before DB writes.

export function normalizeActionType(type: string): string {
  return type.trim().toLowerCase().replace(/-/g, "_");
}

export function padTime(t: unknown): string | null {
  if (t == null || t === "") return null;
  const s = String(t).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{1,2}:\d{2}$/.test(s)) return `${s}:00`;
  return s;
}

function toMin(t: string): number {
  const parts = t.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  return h * 60 + m;
}

export function diffMinutes(start: string, end: string): number {
  const s = toMin(start);
  const e = toMin(end);
  const d = (e - s + 24 * 60) % (24 * 60);
  return d > 0 ? d : 1;
}

export function inferSessionType(category: string | null | undefined): string {
  if (!category) return "chill";
  const c = category.toLowerCase();
  if (["work_paid", "personal", "byt", "portfolio", "planning", "admin"].includes(c)) return "work";
  if (c.startsWith("sport_")) return "sport";
  if (c === "walk") return "walk";
  if (c === "food") return "food";
  if (c === "shower" || c === "chores") return "chores";
  if (c === "transport") return "transport";
  if (c === "sleep") return "sleep";
  if (c === "social") return "chill";
  return c;
}

/** Map Gemini action payload → sessions table columns. */
export function normalizeSessionPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const date = String(raw.date);
  const start_time = padTime(raw.start_time ?? raw.start) ?? "00:00:00";
  const end_time = padTime(raw.end_time ?? raw.end) ?? start_time;
  const category = raw.category != null ? String(raw.category) : null;
  let type = raw.type != null ? String(raw.type) : null;
  // LLM sometimes puts category slug in type field.
  if (type && ["work_paid", "personal", "byt", "portfolio", "planning"].includes(type)) {
    type = "work";
  }
  if (!type || type === "session") type = inferSessionType(category);

  let duration_min = Number(raw.duration_min ?? raw.min ?? raw.duration);
  if (!Number.isFinite(duration_min) || duration_min <= 0) {
    duration_min = diffMinutes(start_time, end_time);
  }

  return {
    date,
    start_time,
    end_time,
    duration_min: Math.round(duration_min),
    type,
    category,
    project: raw.project != null && raw.project !== "" ? String(raw.project) : null,
    intensity: raw.intensity != null ? Number(raw.intensity) : null,
    quality: raw.quality != null ? Number(raw.quality) : null,
    notes: raw.notes != null ? String(raw.notes) : raw.note != null ? String(raw.note) : null,
  };
}

export function normalizeMealPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    date: String(raw.date),
    time: padTime(raw.time),
    slot: raw.slot != null ? String(raw.slot) : null,
    name: String(raw.name ?? "meal"),
    portion_grams: raw.portion_grams != null ? Number(raw.portion_grams) : null,
    kcal: raw.kcal != null ? Number(raw.kcal) : null,
    protein_g: raw.protein_g != null ? Number(raw.protein_g) : null,
    fat_g: raw.fat_g != null ? Number(raw.fat_g) : null,
    carbs_g: raw.carbs_g != null ? Number(raw.carbs_g) : null,
    confidence: raw.confidence != null ? String(raw.confidence) : null,
    notes: raw.notes != null ? String(raw.notes) : null,
  };
  if (raw.session_id != null && String(raw.session_id).trim() !== "") {
    out.session_id = String(raw.session_id);
  }
  return out;
}

export function normalizeDayPatch(raw: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    wake_time: "wake_time",
    wake: "wake_time",
    sleep_time: "sleep_time",
    sleep_start: "sleep_time",
    sleep_hours: "sleep_hours",
    sleep_h: "sleep_hours",
    modafinil_mg: "modafinil_mg",
    mood: "mood",
    energy: "energy",
    focus: "focus",
    weight_kg: "weight_kg",
    day_type: "day_type",
    notes: "notes",
    kcal_target: "kcal_target",
    carbs_target_g: "carbs_target_g",
    protein_target_g: "protein_target_g",
    fat_target_g: "fat_target_g",
  };
  for (const [k, v] of Object.entries(raw)) {
    if (k === "date") continue;
    const col = map[k] ?? k;
    if (col.includes("time")) patch[col] = padTime(v);
    else patch[col] = v;
  }
  return patch;
}

export function normalizeAction(action: { type: string; data: Record<string, unknown> }) {
  const type = normalizeActionType(action.type);
  const data = { ...action.data };
  return { type, data };
}
