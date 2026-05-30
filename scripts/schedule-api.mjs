#!/usr/bin/env node
/**
 * CLI for schedule Edge Functions (Codex / local scripts).
 *
 * Env: SCHEDULE_FUNCTIONS_URL, SCHEDULE_PASSWORD
 * Token cache: .schedule-token (repo root, gitignored)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOKEN_FILE = resolve(ROOT, ".schedule-token");

const BASE = (process.env.SCHEDULE_FUNCTIONS_URL || "").replace(/\/$/, "");

function usage() {
  console.log(`Usage:
  node scripts/schedule-api.mjs login
  node scripts/schedule-api.mjs get <resource> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--limit N]
  node scripts/schedule-api.mjs manual <op> <resource> '<json-row>'
  node scripts/schedule-api.mjs apply <file.json> [--swallow]

Env: SCHEDULE_FUNCTIONS_URL, SCHEDULE_PASSWORD`);
}

function loadToken() {
  if (!existsSync(TOKEN_FILE)) return null;
  return readFileSync(TOKEN_FILE, "utf8").trim() || null;
}

function saveToken(token) {
  writeFileSync(TOKEN_FILE, token, "utf8");
}

async function api(endpoint, body, { auth = true } = {}) {
  if (!BASE) throw new Error("Set SCHEDULE_FUNCTIONS_URL");
  const headers = { "content-type": "application/json" };
  if (auth) {
    const token = loadToken();
    if (!token) throw new Error("No token — run: node scripts/schedule-api.mjs login");
    headers.authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: "POST",
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function login() {
  const password = process.env.SCHEDULE_PASSWORD;
  if (!password) throw new Error("Set SCHEDULE_PASSWORD (= APP_PASSWORD in Supabase)");
  const { token } = await api("auth/login", { password }, { auth: false });
  saveToken(token);
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

async function main() {
  const [cmd, ...argv] = process.argv.slice(2);
  if (!cmd) {
    usage();
    process.exit(1);
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

  if (cmd === "manual") {
    const [op, resource, jsonStr] = rest;
    if (!op || !resource || !jsonStr) throw new Error("manual <op> <resource> '<json>'");
    const row = JSON.parse(jsonStr);
    const out = await api("manual", { op, resource, row });
    console.log(JSON.stringify(out, null, 2));
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
