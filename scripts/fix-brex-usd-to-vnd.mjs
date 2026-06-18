#!/usr/bin/env node
/**
 * Fix agent-written brex rows: currency USD + VND in notes → restore VND amount on txn.
 * Then run reconcile-account-balances.mjs --apply
 *
 *   node scripts/fix-brex-usd-to-vnd.mjs
 *   node scripts/fix-brex-usd-to-vnd.mjs --apply
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

/** Parse original VND from agent notes like "Original receipt: 183,040 VND" */
function parseVndFromNotes(notes) {
  const s = notes || "";
  const m =
    s.match(/original receipt:\s*([\d\s.,]+)\s*vnd/i) ||
    s.match(/([\d\s.,]+)\s*vnd/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { rows } = await api("data", {
    op: "get",
    resource: "finance_transactions",
    from: "2026-06-13",
    limit: 500,
  });

  const candidates = (rows || []).filter((t) => {
    if (t.account !== "brex") return false;
    if ((t.currency || "").toUpperCase() !== "USD") return false;
    return parseVndFromNotes(t.notes) != null;
  });

  console.log(`\n=== BREX USD→VND txn fix (${candidates.length} rows) ===\n`);
  if (!candidates.length) {
    console.log("Nothing to fix.");
    return;
  }

  for (const t of candidates) {
    const vnd = parseVndFromNotes(t.notes);
    console.log(
      `  ${t.date} id=${t.id} ${t.amount} USD → ${vnd} VND  merchant=${t.merchant}`,
    );
    if (apply) {
      await api("manual", {
        op: "update",
        resource: "finance_transactions",
        id: t.id,
        row: { amount: vnd, currency: "VND" },
      });
      console.log("    → updated (balance re-sync via manual handler if wired)");
    }
  }

  if (!apply) {
    console.log("\nRun with --apply, then: node scripts/reconcile-account-balances.mjs --apply");
  } else {
    console.log("\nNow run: node scripts/reconcile-account-balances.mjs --apply");
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
