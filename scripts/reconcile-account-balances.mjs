#!/usr/bin/env node
/**
 * Recompute account balances from opening snapshots + finance_transactions.
 * Only applies txns where currency matches account.currency (same as financeBalanceSync).
 *
 * Usage:
 *   node scripts/reconcile-account-balances.mjs              # dry-run report
 *   node scripts/reconcile-account-balances.mjs --apply      # write accounts.balance
 *
 * Opening balances: scripts/plans/opening-balances.json (edit before first run)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCodexEnv } from "./loadCodexEnv.mjs";
import { httpPost } from "./httpTransport.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = resolve(ROOT, ".schedule-token");
const OPENING_FILE = resolve(ROOT, "scripts/plans/opening-balances.json");

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

import { balanceDeltas } from "./finance-fx.mjs";

function loadOpening() {
  if (!existsSync(OPENING_FILE)) {
    throw new Error(
      "Missing scripts/plans/opening-balances.json — copy from opening-balances.example.json and fill locally (gitignored)",
    );
  }
  return JSON.parse(readFileSync(OPENING_FILE, "utf8"));
}

async function main() {
  const apply = process.argv.includes("--apply");
  const opening = loadOpening();

  const [{ rows: accounts }, { rows: txns }] = await Promise.all([
    api("data", { op: "get", resource: "accounts", limit: 50 }),
    api("data", { op: "get", resource: "finance_transactions", limit: 10000, order: "asc" }),
  ]);

  const currencies = {};
  const computed = {};
  for (const a of accounts || []) {
    currencies[a.id] = String(a.currency || "").toUpperCase();
    computed[a.id] = Number(opening[a.id]) || 0;
  }

  const sorted = [...(txns || [])].sort((a, b) => {
    const d = String(a.date).localeCompare(String(b.date));
    if (d !== 0) return d;
    return String(a.time || "").localeCompare(String(b.time || ""));
  });

  for (const t of sorted) {
    for (const { account, delta } of balanceDeltas(t, currencies)) {
      computed[account] = (computed[account] || 0) + delta;
    }
  }

  console.log("\n=== Account balance reconcile ===\n");
  console.log(`Mode: ${apply ? "APPLY" : "dry-run"}\n`);
  console.log("account          | DB balance   | computed   | drift");
  console.log("-----------------|--------------|------------|------");

  for (const a of accounts || []) {
    const db = Number(a.balance) || 0;
    const calc = Math.round((computed[a.id] || 0) * 100) / 100;
    const drift = Math.round((db - calc) * 100) / 100;
    const flag = Math.abs(drift) > 0.01 ? " ⚠" : "";
    console.log(
      `${String(a.id).padEnd(16)} | ${String(db).padEnd(12)} | ${String(calc).padEnd(10)} | ${drift}${flag}`,
    );

    if (apply && Math.abs(drift) > 0.01) {
      await api("manual", {
        op: "update",
        resource: "accounts",
        id: a.id,
        row: { balance: calc },
      });
      console.log(`  → updated ${a.id} balance to ${calc}`);
    }
  }

  if (!apply) {
    console.log("\nRun with --apply to write corrected balances.");
    console.log("Edit opening balances in scripts/plans/opening-balances.json if computed values look wrong.");
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
