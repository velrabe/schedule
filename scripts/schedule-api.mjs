#!/usr/bin/env node
/**
 * CLI for schedule Edge Functions (Codex / local scripts).
 *
 * Auth (any one):
 *   SCHEDULE_TOKEN          — JWT from a previous login (best for Codex)
 *   SCHEDULE_API_KEY        — agent key → POST /auth/login { api_key }
 *   SCHEDULE_PASSWORD       — app password → POST /auth/login { password }
 *
 * URL: SCHEDULE_FUNCTIONS_URL (or VITE_FUNCTIONS_URL)
 * Optional file: codex.env / .codex.env (see codex.env.example)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCodexEnv } from "./loadCodexEnv.mjs";
import { httpPost } from "./httpTransport.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = resolve(ROOT, ".schedule-token");

const GET_DAY_RESOURCES = [
  "sessions",
  "session_events",
  "meals",
  "activities",
  "finance_transactions",
];

function baseUrl() {
  return (process.env.SCHEDULE_FUNCTIONS_URL || process.env.VITE_FUNCTIONS_URL || "")
    .replace(/\/$/, "");
}

function usage() {
  console.log(`Usage:
  node scripts/schedule-api.mjs check-env
  node scripts/schedule-api.mjs login
  node scripts/schedule-api.mjs get <resource> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N]
  node scripts/schedule-api.mjs get-day YYYY-MM-DD
  node scripts/schedule-api.mjs manual <op> <resource> '<json>'
  node scripts/schedule-api.mjs apply <file.agent.json> [--swallow]
  node scripts/schedule-api.mjs apply-manual <file.manual.json>

Auth env (one of): SCHEDULE_TOKEN | SCHEDULE_API_KEY | SCHEDULE_PASSWORD
URL env: SCHEDULE_FUNCTIONS_URL

Plans: scripts/plans/README.md`);
}

function loadTokenFile() {
  if (!existsSync(TOKEN_FILE)) return null;
  return readFileSync(TOKEN_FILE, "utf8").trim() || null;
}

function saveTokenFile(token) {
  writeFileSync(TOKEN_FILE, token, "utf8");
}

async function fetchToken() {
  const apiKey = process.env.SCHEDULE_API_KEY?.trim();
  if (apiKey) {
    const { token } = await api("auth/login", { api_key: apiKey }, { auth: false });
    return token;
  }

  const password = process.env.SCHEDULE_PASSWORD?.trim();
  if (password) {
    const { token } = await api("auth/login", { password }, { auth: false });
    return token;
  }

  return null;
}

async function api(endpoint, body, { auth = true } = {}) {
  const BASE = baseUrl();
  if (!BASE) throw new Error("Set SCHEDULE_FUNCTIONS_URL");
  const headers = { "content-type": "application/json" };
  let token = null;
  if (auth) {
    token = await fetchTokenForRequest();
    if (!token) {
      throw new Error(
        "No auth — set SCHEDULE_TOKEN, SCHEDULE_API_KEY, or SCHEDULE_PASSWORD (or run: login)",
      );
    }
    headers.authorization = `Bearer ${token}`;
  }
  return await httpPost(`${BASE}/${endpoint}`, { headers, body });
}

/** Token for api(); login calls use api() with auth:false. */
async function fetchTokenForRequest() {
  const fromEnv = process.env.SCHEDULE_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const cached = loadTokenFile();
  if (cached) return cached;
  return await fetchToken();
}

async function login() {
  const token = await fetchToken();
  if (!token) {
    throw new Error(
      "Set SCHEDULE_PASSWORD, SCHEDULE_API_KEY, or SCHEDULE_TOKEN before login",
    );
  }
  saveTokenFile(token);
  console.log("OK — token saved to .schedule-token");
}

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from") flags.from = argv[++i];
    else if (argv[i] === "--to") flags.to = argv[++i];
    else if (argv[i] === "--limit") flags.limit = Number(argv[++i]);
    else if (argv[i] === "--swallow") flags.swallow = true;
    else rest.push(argv[i]);
  }
  return { flags, rest };
}

/** Build POST /manual body; id/match may live in row or top-level item. */
function buildManualBody(op, resource, parsed) {
  const src = parsed && typeof parsed === "object" ? { ...parsed } : {};
  const {
    id,
    match,
    expense,
    expense_session_id,
    expense_event_id,
    row: nestedRow,
    ...rest
  } = src;

  let row = nestedRow && typeof nestedRow === "object" ? { ...nestedRow } : { ...rest };
  if (row.id != null && id == null) {
    const rowId = row.id;
    delete row.id;
    return {
      op,
      resource,
      id: String(rowId),
      row,
      ...(match != null ? { match } : {}),
      ...(expense !== undefined ? { expense } : {}),
      ...(expense_session_id != null ? { expense_session_id } : {}),
      ...(expense_event_id != null ? { expense_event_id } : {}),
    };
  }

  const body = { op, resource, row };
  if (id != null) body.id = String(id);
  if (match != null) body.match = match;
  if (expense !== undefined) body.expense = expense;
  if (expense_session_id != null) body.expense_session_id = expense_session_id;
  if (expense_event_id != null) body.expense_event_id = expense_event_id;
  return body;
}

async function main() {
  loadCodexEnv();

  const [cmd, ...argv] = process.argv.slice(2);
  if (!cmd) {
    usage();
    process.exit(1);
  }

  if (cmd === "check-env") {
    const { envStatus } = await import("./loadCodexEnv.mjs");
    console.log(JSON.stringify(envStatus(), null, 2));
    return;
  }

  if (cmd === "login") {
    await login();
    return;
  }

  const { flags, rest } = parseFlags(argv);

  if (cmd === "get") {
    const resource = rest[0];
    if (!resource) throw new Error("resource required");
    const out = await api("data", {
      resource,
      from: flags.from,
      to: flags.to,
      limit: flags.limit,
    });
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === "get-day") {
    const date = rest[0];
    if (!date) throw new Error("get-day YYYY-MM-DD required");
    const bundle = { date };
    for (const resource of GET_DAY_RESOURCES) {
      bundle[resource] = await api("data", {
        resource,
        from: date,
        to: date,
        limit: flags.limit ?? 2000,
      });
    }
    console.log(JSON.stringify(bundle, null, 2));
    return;
  }

  if (cmd === "manual") {
    const [op, resource, jsonStr] = rest;
    if (!op || !resource || !jsonStr) throw new Error("manual <op> <resource> '<json>'");
    const parsed = JSON.parse(jsonStr);
    const out = await api("manual", buildManualBody(op, resource, parsed));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (cmd === "apply-manual") {
    const file = rest[0];
    if (!file) throw new Error("apply-manual <file.manual.json>");
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) throw new Error("JSON must be an array of manual ops");
    const results = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const op = item.op;
      const resource = item.resource;
      if (!op || !resource) {
        throw new Error(`item[${i}]: op and resource required`);
      }
      const body = buildManualBody(op, resource, item);
      const out = await api("manual", body);
      results.push({ index: i, op, resource, ok: true, out });
    }
    console.log(JSON.stringify({ ok: true, count: results.length, results }, null, 2));
    return;
  }

  if (cmd === "apply") {
    const file = rest[0];
    if (!file) throw new Error("apply <file.json>");
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    const payload = JSON.parse(raw);
    const actions = payload.actions ?? payload;
    if (!Array.isArray(actions)) throw new Error("JSON must have actions[] array");
    const out = await api("agent", {
      actions,
      swallow_ok: flags.swallow === true,
    });
    console.log(JSON.stringify(out, null, 2));
    if (!out.ok) process.exit(1);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((e) => {
  console.error(e.body ? JSON.stringify(e.body, null, 2) : e.message);
  process.exit(1);
});
