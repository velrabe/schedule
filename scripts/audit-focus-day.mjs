#!/usr/bin/env node
/**
 * Audit work sessions for a day + emit merge plans for Codex.
 *
 *   node scripts/schedule-api.mjs login   # once, or set SCHEDULE_API_KEY
 *   node scripts/audit-focus-day.mjs 2026-06-01
 *   node scripts/audit-focus-day.mjs 2026-06-01 --write scripts/plans/generated
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCodexEnv } from "./loadCodexEnv.mjs";
import { httpPost } from "./httpTransport.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = resolve(ROOT, ".schedule-token");

const FOCUS_CATS = new Set(["work_paid", "personal", "byt", "planning", "portfolio"]);

function timeToMin(t) {
  const [h, m] = String(t || "00:00").split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function trimTime(t) {
  return String(t || "").slice(0, 5);
}

function durationMin(start, end, fallbackMin) {
  const m = Number(fallbackMin);
  if (m > 0) return m;
  const s = timeToMin(trimTime(start));
  let e = timeToMin(trimTime(end));
  if (e < s) e += 24 * 60;
  return Math.max(0, e - s);
}

function rowToUiSession(row) {
  return {
    id: String(row.id),
    date: String(row.date),
    start: trimTime(row.start_time),
    end: trimTime(row.end_time),
    min: Number(row.duration_min) || 0,
    category: row.category,
    project: row.project,
    type: row.type,
  };
}

/** Micro-merges: same project, gap ≤ maxGap minutes between work blocks. */
function microMergeGroups(sessions, maxGap = 20) {
  const work = sessions
    .filter((s) => FOCUS_CATS.has(s.category))
    .sort((a, b) => a.start.localeCompare(b.start));

  const groups = [];
  for (const s of work) {
    const proj = (s.project || "").trim() || "(no project)";
    const last = groups[groups.length - 1];
    const gap = last ? timeToMin(s.start) - timeToMin(last.end) : 999;
    if (last && last.project === proj && gap >= 0 && gap <= maxGap) {
      last.sessions.push(s);
      if (timeToMin(s.end) > timeToMin(last.end)) last.end = s.end;
      last.min += durationMin(s.start, s.end, s.min);
    } else {
      groups.push({
        project: proj,
        category: s.category,
        start: s.start,
        end: s.end,
        min: durationMin(s.start, s.end, s.min),
        sessions: [s],
      });
    }
  }
  return groups.filter((g) => g.sessions.length > 1);
}

function focusBlocks(sessions, maxGap = 20) {
  const work = sessions
    .filter((s) => FOCUS_CATS.has(s.category))
    .sort((a, b) => a.start.localeCompare(b.start));

  const blocks = [];
  for (const s of work) {
    const proj = (s.project || "").trim() || "(no project)";
    const last = blocks[blocks.length - 1];
    const gap = last ? timeToMin(s.start) - timeToMin(last.end) : 999;
    if (last && last.project === proj && gap >= 0 && gap <= maxGap) {
      last.sessions.push(s);
      if (timeToMin(s.end) > timeToMin(last.end)) last.end = s.end;
      last.min += durationMin(s.start, s.end, s.min);
    } else {
      blocks.push({
        project: proj,
        start: s.start,
        end: s.end,
        min: durationMin(s.start, s.end, s.min),
        sessions: [s],
      });
    }
  }
  return blocks;
}

function buildMergePlans(date, sessions, sessionEvents, groups) {
  const agentActions = [];
  const manualOps = [];

  for (const g of groups) {
    const keep = g.sessions[0];
    const drop = g.sessions.slice(1);
    const start = g.sessions.reduce((a, s) => (a < s.start ? a : s.start), keep.start);
    const end = g.sessions.reduce((a, s) => (timeToMin(s.end) > timeToMin(a) ? s.end : a), keep.end);

    agentActions.push({
      type: "update_session",
      data: {
        id: keep.id,
        date,
        start_time: start,
        end_time: end,
        project: keep.project || g.project,
        category: keep.category,
      },
    });

    for (const dup of drop) {
      const evs = sessionEvents.filter((e) => String(e.session_id) === dup.id);
      for (const ev of evs) {
        manualOps.push({
          op: "update",
          resource: "session_events",
          id: String(ev.id),
          row: { session_id: keep.id },
        });
      }
      agentActions.push({
        type: "delete_session",
        data: { id: dup.id, date },
      });
    }
  }

  return { agentActions, manualOps };
}

async function fetchDay(date) {
  loadCodexEnv();
  const base = (process.env.SCHEDULE_FUNCTIONS_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Set SCHEDULE_FUNCTIONS_URL");

  let token = process.env.SCHEDULE_TOKEN?.trim();
  if (!token && existsSync(TOKEN_FILE)) token = readToken();
  if (!token && process.env.SCHEDULE_API_KEY) {
    const { token: t } = await apiRaw(base, "auth/login", { api_key: process.env.SCHEDULE_API_KEY }, false);
    token = t;
  }
  if (!token && process.env.SCHEDULE_PASSWORD) {
    const { token: t } = await apiRaw(base, "auth/login", { password: process.env.SCHEDULE_PASSWORD }, false);
    token = t;
  }
  if (!token) throw new Error("No auth — run: node scripts/schedule-api.mjs login");

  const bundle = { date };
  for (const resource of ["sessions", "session_events", "substances", "meals"]) {
    bundle[resource] = await apiRaw(base, "data", { resource, from: date, to: date, limit: 2000 }, token);
  }
  return bundle;
}

function readToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  return readFileSync(TOKEN_FILE, "utf8").trim() || null;
}

async function apiRaw(base, endpoint, body, tokenOrFalse) {
  const headers = { "content-type": "application/json" };
  if (tokenOrFalse !== false) headers.authorization = `Bearer ${tokenOrFalse}`;
  const res = await httpPost(`${base}/${endpoint}`, body, { headers });
  if (!res.ok) throw new Error(JSON.stringify(res.body));
  return res.body;
}

function printReport(date, sessions, groups, blocks) {
  console.log(`\n=== ${date} — focus audit ===\n`);
  console.log("work sessions:");
  for (const s of sessions.filter((x) => FOCUS_CATS.has(x.category))) {
    console.log(`  ${s.start}–${s.end}  ${s.min}m  ${s.category}  ${s.project || "—"}  id=${s.id}`);
  }
  console.log("\nfocus blocks (gap ≤20m, same project) — target shape for analytics:");
  for (const b of blocks) {
    const n = b.sessions.length;
    console.log(`  ${b.start}–${b.end}  ${b.min}m  ${b.project}  (${n} session row${n > 1 ? "s — should be 1" : ""})`);
  }
  if (groups.length === 0) {
    console.log("\n✓ no micro-merge needed (no adjacent duplicate work rows)\n");
    return;
  }
  console.log("\n⚠ micro-merge groups (merge into first session, delete rest):");
  for (const g of groups) {
    console.log(`  ${g.start}–${g.end}  ${g.project}`);
    for (const s of g.sessions) console.log(`    - ${s.start}–${s.end}  id=${s.id}`);
  }
  console.log("");
}

async function main() {
  const argv = process.argv.slice(2);
  const date = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!date) {
    console.error("Usage: node scripts/audit-focus-day.mjs YYYY-MM-DD [--write dir]");
    process.exit(1);
  }
  const writeDir = argv.includes("--write") ? argv[argv.indexOf("--write") + 1] : null;

  const bundle = await fetchDay(date);
  const sessions = (bundle.sessions || []).map(rowToUiSession);
  const sessionEvents = bundle.session_events || [];

  const groups = microMergeGroups(sessions);
  const blocks = focusBlocks(sessions);
  printReport(date, sessions, groups, blocks);

  const { agentActions, manualOps } = buildMergePlans(date, sessions, sessionEvents, groups);

  const scooby = (bundle.substances || []).filter((s) => s.name === "scooby");
  console.log(`substances scooby: ${scooby.length} rows (OK as separate, not in sessions)`);

  if (writeDir && groups.length > 0) {
    mkdirSync(writeDir, { recursive: true });
    const agentPath = resolve(writeDir, `merge-focus-${date}.agent.json`);
    const manualPath = resolve(writeDir, `merge-focus-${date}.manual.json`);
    writeFileSync(agentPath, JSON.stringify({ actions: agentActions }, null, 2));
    writeFileSync(manualPath, JSON.stringify(manualOps, null, 2));
    console.log(`Wrote ${agentPath}`);
    console.log(`Wrote ${manualPath}`);
    console.log("\nApply order:");
    console.log(`  node scripts/schedule-api.mjs apply-manual ${manualPath}`);
    console.log(`  node scripts/schedule-api.mjs apply ${agentPath}`);
  } else if (groups.length > 0) {
    console.log("Plans (dry-run). Re-run with --write scripts/plans/generated\n");
    console.log(JSON.stringify({ agentActions, manualOps }, null, 2));
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
