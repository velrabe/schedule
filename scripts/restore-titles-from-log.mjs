#!/usr/bin/env node
/**
 * Restore session_events.title from day-log text (user timed lines).
 *
 *   node scripts/restore-titles-from-log.mjs 2026-06-18 day.txt --apply
 */

import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { loadCodexEnv } from "./loadCodexEnv.mjs";
import { httpPost } from "./httpTransport.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = resolve(ROOT, ".schedule-token");

loadCodexEnv();

function baseUrl() {
  return (process.env.SCHEDULE_FUNCTIONS_URL || process.env.VITE_FUNCTIONS_URL || "").replace(/\/$/, "");
}

function loadToken() {
  if (process.env.SCHEDULE_TOKEN?.trim()) return process.env.SCHEDULE_TOKEN.trim();
  if (existsSync(TOKEN_FILE)) return readFileSync(TOKEN_FILE, "utf8").trim() || null;
  return null;
}

async function api(endpoint, body) {
  const token = loadToken();
  if (!token) throw new Error("No auth — run: node scripts/schedule-api.mjs login");
  return httpPost(`${baseUrl()}/${endpoint}`, body, {
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  });
}

function padTime(t) {
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function parsePlanViaDeno(text) {
  const tmpIn = resolve(ROOT, ".tmp-restore-log.txt");
  const tmpOut = resolve(ROOT, ".tmp-restore-plan.json");
  writeFileSync(tmpIn, text, "utf8");
  const code = `
import { parseDayLogText } from "${ROOT}/supabase/functions/_shared/dayLogParser.ts";
const text = await Deno.readTextFile("${tmpIn}");
const plan = parseDayLogText(text);
await Deno.writeTextFile("${tmpOut}", JSON.stringify(plan));
`;
  const r = spawnSync("deno", ["eval", code], { encoding: "utf8" });
  try {
    unlinkSync(tmpIn);
  } catch { /* ignore */ }
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || "deno eval failed — install deno?");
  }
  const plan = JSON.parse(readFileSync(tmpOut, "utf8"));
  try {
    unlinkSync(tmpOut);
  } catch { /* ignore */ }
  return plan;
}

async function main() {
  const args = process.argv.slice(2);
  const date = args[0];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Usage: restore-titles-from-log.mjs YYYY-MM-DD [file] [--apply]");
  }
  const apply = args.includes("--apply");
  const fileArg = args.find((a) => a !== date && a !== "--apply" && !a.startsWith("-"));

  const text = fileArg ? readFileSync(resolve(process.cwd(), fileArg), "utf8") : readFileSync(0, "utf8");
  const plan = parsePlanViaDeno(text);
  if (!plan?.sessions) throw new Error("Could not parse day log text");

  const expected = [];
  for (const sess of plan.sessions) {
    for (const ev of sess.events) {
      expected.push({ start: padTime(ev.start), title: ev.title });
    }
  }

  const { rows: events } = await api("data", {
    resource: "session_events",
    from: date,
    to: date,
    limit: 500,
  });

  console.log(`\n=== Restore titles ${date} (${apply ? "APPLY" : "dry-run"}) ===\n`);

  for (const exp of expected) {
    const startPrefix = `${exp.start}:`;
    const match = (events || []).find((e) => String(e.start_time || "").startsWith(startPrefix));
    if (!match) {
      console.log(`  ? ${exp.start} — no event in DB`);
      continue;
    }
    const cur = (match.title || "").trim();
    if (cur === exp.title) {
      console.log(`  = ${exp.start} already «${exp.title}»`);
      continue;
    }
    console.log(`  → ${exp.start} «${cur}» → «${exp.title}»`);
    if (apply) {
      await api("manual", {
        op: "update",
        resource: "session_events",
        id: match.id,
        row: { title: exp.title },
      });
    }
  }

  if (!apply) console.log("\nRun with --apply to write.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
