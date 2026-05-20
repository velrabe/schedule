// One-off: push seed DAYS + SESSIONS + EVENTS into Supabase.
//
// Usage:
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=sb_secret_... \
//   node scripts/backfill-seed.mjs
//
// The script wipes the target tables first (days, sessions, events) and then
// re-inserts everything. raw_logs is left untouched.

import { DAYS, SESSIONS, EVENTS, MEALS, ACTIVITIES } from "../apps/web/src/dashboard/seed.js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function req(path, init = {}) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} on ${path}: ${body}`);
  }
  return res;
}

function pad(t) {
  if (!t) return null;
  return t.length === 5 ? `${t}:00` : t;
}

function inferType(category) {
  if (!category) return "chill";
  if (["work_paid", "personal", "byt", "portfolio", "planning", "admin"].includes(category)) return "work";
  if (category.startsWith("sport_")) return "sport";
  if (category === "walk") return "walk";
  if (category === "chill") return "chill";
  if (category === "food") return "food";
  if (category === "shower") return "chores";
  if (category === "chores") return "chores";
  if (category === "transport") return "transport";
  if (category === "sleep") return "sleep";
  if (category === "social") return "chill";
  return category;
}

const dayRows = DAYS.map((d) => ({
  date: d.date,
  wake_time: pad(d.wake),
  sleep_time: pad(d.sleep_start),
  sleep_hours: d.sleep_h,
  modafinil_mg: d.modafinil_mg ?? 0,
  mood: d.mood,
  energy: d.energy,
  focus: d.focus,
  weight_kg: null,
  day_type: d.day_type || null,
  tags: d.tags || [],
  notes: d.notes || null,
}));

const sessionRows = SESSIONS.map((s) => ({
  date: s.date,
  start_time: pad(s.start),
  end_time: pad(s.end),
  duration_min: s.min || 0,
  type: inferType(s.category),
  category: s.category || null,
  project: s.project || null,
  quality: s.quality,
  notes: s.note || null,
}));

const eventRows = EVENTS.map((e) => ({
  date: e.date,
  kind: e.type || e.kind || "event",
  detail: e.note || e.detail || null,
  severity: "info",
}));

const mealRows = (MEALS || []).map((m) => ({
  date: m.date,
  time: pad(m.time),
  slot: m.slot || null,
  name: m.name,
  kcal: m.kcal ?? null,
  protein_g: m.protein_g ?? null,
  fat_g: m.fat_g ?? null,
  carbs_g: m.carbs_g ?? null,
  confidence: m.confidence || null,
  notes: m.notes || null,
}));

const activityRows = (ACTIVITIES || []).map((a) => ({
  date: a.date,
  time: pad(a.time),
  type: a.type,
  duration_min: a.duration_min ?? null,
  calories_burned: a.calories_burned ?? null,
  intensity: a.intensity ?? null,
  source: a.source || null,
  notes: a.notes || null,
}));

async function deleteAll(table, filterCol) {
  const r = await req(`${table}?${filterCol}=not.is.null`, { method: "DELETE" });
  console.log(`cleared ${table}: ${r.status}`);
}

async function insertBatch(table, rows, batchSize = 200) {
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    await req(table, {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(slice),
    });
    process.stdout.write(`  ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${table}: ${rows.length}/${rows.length} ok`);
}

console.log("=== backfill ===");
console.log(`days:     ${dayRows.length}`);
console.log(`sessions: ${sessionRows.length}`);
console.log(`events:   ${eventRows.length}`);
console.log(`meals:    ${mealRows.length}`);
console.log(`activities:${activityRows.length}`);
console.log();

// Order matters: clear children first (sessions, events ref days), then parents.
await deleteAll("sessions", "id");
await deleteAll("events", "id");
await deleteAll("body_metrics", "id");
await deleteAll("meals", "id");
await deleteAll("activities", "id");
await deleteAll("substances", "id");
await deleteAll("finance_transactions", "id");
await deleteAll("days", "date");

console.log();
console.log("inserting:");
await insertBatch("days", dayRows);
await insertBatch("sessions", sessionRows);
if (eventRows.length > 0) await insertBatch("events", eventRows);
if (mealRows.length > 0) await insertBatch("meals", mealRows);
if (activityRows.length > 0) await insertBatch("activities", activityRows);

console.log();
console.log("done.");
