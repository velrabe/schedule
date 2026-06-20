#!/usr/bin/env node
/**
 * One-off: align vcb_vnd DB balance with actual by adding June 1 expense.
 *
 *   node scripts/apply-vcb-may-adjustment.mjs --target <balance>
 *   node scripts/apply-vcb-may-adjustment.mjs --target <balance> --apply
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCodexEnv } from "./loadCodexEnv.mjs";
import { httpPost } from "./httpTransport.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = resolve(ROOT, ".schedule-token");
const DATE = "2026-06-01";

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

async function getDay(date) {
  const resources = ["sessions", "session_events", "finance_transactions"];
  const bundle = { date };
  for (const resource of resources) {
    bundle[resource] = await api("data", { resource, from: date, to: date, limit: 2000 });
  }
  return bundle;
}

function parseTarget() {
  const i = process.argv.indexOf("--target");
  if (i === -1 || !process.argv[i + 1]) {
    throw new Error("Usage: --target <vnd_balance>");
  }
  return Number(process.argv[i + 1]);
}

function findWakeEvent(day) {
  const events = day.session_events?.rows || day.session_events || [];
  const wake = events.find((e) =>
    /подъ[её]м|wake|пробужден/i.test(e.title || "") || (e.kind || "") === "wake"
  );
  if (wake) return wake;
  return [...events].sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))[0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  const target = parseTarget();

  const [{ rows: accounts }, day] = await Promise.all([
    api("data", { op: "get", resource: "accounts", limit: 50 }),
    getDay(DATE),
  ]);

  const vcb = (accounts || []).find((a) => a.id === "vcb_vnd");
  if (!vcb) throw new Error("vcb_vnd account not found");

  const dbBal = Number(vcb.balance) || 0;
  const adjustment = Math.round(dbBal - target);
  if (adjustment <= 0) {
    console.log(`DB balance ${dbBal} ≤ target ${target} — adjustment not needed (drift ${adjustment}).`);
    return;
  }

  const wake = findWakeEvent(day);
  if (!wake?.id) throw new Error(`No wake/morning event on ${DATE}`);

  const payload = {
    date: DATE,
    time: String(wake.start_time || "10:00:00").slice(0, 8),
    amount: adjustment,
    currency: "VND",
    account: "vcb_vnd",
    category: "other",
    merchant: "коррекция",
    txn_type: "expense",
    session_id: wake.session_id,
    session_event_id: wake.id,
    notes: "Компенсация расходов за май — выравнивание баланса VCB с фактом",
  };

  console.log("\n=== VCB May compensation ===\n");
  console.log(`  DB balance now:     ${dbBal.toLocaleString("ru-RU")} ₫`);
  console.log(`  Target (actual):    ${target.toLocaleString("ru-RU")} ₫`);
  console.log(`  June 1 expense:     ${adjustment.toLocaleString("ru-RU")} ₫`);
  console.log(`  Wake event:         ${wake.title} @ ${payload.time}`);
  console.log(`  Mode:               ${apply ? "APPLY" : "dry-run"}\n`);

  if (!apply) {
    console.log("Run with --apply to create finance_transaction");
    return;
  }

  const out = await api("agent", {
    actions: [{ type: "create_finance_transaction", data: payload }],
  });
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
