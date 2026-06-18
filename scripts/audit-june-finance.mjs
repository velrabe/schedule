#!/usr/bin/env node
/**
 * Audit June finance rows + account balance drift.
 *
 * Usage:
 *   node scripts/audit-june-finance.mjs
 *   node scripts/audit-june-finance.mjs --from 2026-06-01 --to 2026-06-30
 *   node scripts/reconcile-account-balances.mjs --apply   # after fixing txns
 *
 * Auth: same as schedule-api.mjs (codex.env / SCHEDULE_TOKEN / …)
 */

import { loadCodexEnv } from "./loadCodexEnv.mjs";
import { httpPost } from "./httpTransport.mjs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

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

function parseArgs() {
  const args = process.argv.slice(2);
  let from = "2026-06-01";
  let to = "2026-06-30";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--from") from = args[++i];
    if (args[i] === "--to") to = args[++i];
  }
  return { from, to };
}

const ACCOUNT_CURRENCY = {
  savings_rub: "RUB",
  ip_rub: "RUB",
  vcb_vnd: "VND",
  cash_vnd: "VND",
  brex: "USD",
  bybit: "USDT",
};

function currencyMismatch(t) {
  const ac = ACCOUNT_CURRENCY[t.account];
  const cur = (t.currency || "").toUpperCase();
  if (!ac || !cur) return false;
  if (t.account === "brex" && cur === "VND" && ac === "USD") return false;
  return ac !== cur;
}

function looksLikeBrexUsdConversion(t) {
  if (t.account !== "brex" || (t.currency || "").toUpperCase() !== "USD") return false;
  const notes = (t.notes || "").toLowerCase();
  return /vnd|₫|донг|receipt|чек|26333|26[\s,]?333/.test(notes);
}

function dayExpenseTotals(txns) {
  const byCur = new Map();
  for (const t of txns.filter((x) => (x.txn_type || "expense") === "expense")) {
    const cur = (t.currency || "VND").toUpperCase();
    byCur.set(cur, (byCur.get(cur) || 0) + Math.abs(Number(t.amount) || 0));
  }
  return Object.fromEntries(byCur);
}

async function main() {
  const { from, to } = parseArgs();
  const [{ rows: finance }, { rows: accounts }] = await Promise.all([
    api("data", { op: "get", resource: "finance_transactions", from, to, limit: 5000 }),
    api("data", { op: "get", resource: "accounts", limit: 50 }),
  ]);

  const byDate = new Map();
  for (const t of finance || []) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }

  console.log(`\n=== June finance audit ${from} … ${to} ===\n`);

  console.log("--- Account balances (DB) ---");
  for (const a of accounts || []) {
    console.log(`  ${a.id}: ${a.balance} ${a.currency}`);
  }

  console.log("\n--- Currency mismatches (corrupt balance sync) ---");
  const mismatches = (finance || []).filter(currencyMismatch);
  if (!mismatches.length) console.log("  none");
  for (const t of mismatches) {
    console.log(
      `  ${t.date} ${t.time || ""} id=${t.id} account=${t.account} txn=${t.amount} ${t.currency} (account expects ${ACCOUNT_CURRENCY[t.account]})`,
    );
  }

  console.log("\n--- Suspected BREX VND→USD agent conversions ---");
  const brexBad = (finance || []).filter(looksLikeBrexUsdConversion);
  if (!brexBad.length) console.log("  none");
  for (const t of brexBad) {
    console.log(`  ${t.date} ${t.amount} USD id=${t.id} merchant=${t.merchant} notes=${(t.notes || "").slice(0, 80)}…`);
  }

  console.log("\n--- Daily expense totals (by currency) ---");
  for (const date of [...byDate.keys()].sort()) {
    const totals = dayExpenseTotals(byDate.get(date));
    const parts = Object.entries(totals).map(([c, n]) => `${n} ${c}`);
    console.log(`  ${date}: ${parts.join(" · ") || "—"}`);
  }

  console.log("\nFix path:");
  console.log("  1. Patch bad rows via apply-manual (currency/amount) or rebuild day with parse-day");
  console.log("  2. node scripts/reconcile-account-balances.mjs --apply");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
