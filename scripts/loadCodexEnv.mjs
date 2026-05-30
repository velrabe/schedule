/**
 * Load env for Codex / CLI before schedule-api runs.
 * Codex "Secrets" often do NOT appear in printenv — use Environment variables,
 * codex.env (gitignored), or SCHEDULE_TOKEN / SCHEDULE_API_KEY.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseEnvLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;
  const eq = t.indexOf("=");
  if (eq <= 0) return null;
  const key = t.slice(0, eq).trim();
  let val = t.slice(eq + 1).trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  return { key, val };
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const p = parseEnvLine(line);
    if (!p) continue;
    if (process.env[p.key] == null || process.env[p.key] === "") {
      process.env[p.key] = p.val;
    }
  }
}

function readSecretFile(path) {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, "utf8").trim() || null;
  } catch {
    return null;
  }
}

function assignIfEmpty(key, value) {
  if (value && (process.env[key] == null || process.env[key] === "")) {
    process.env[key] = value;
  }
}

function defaultFunctionsUrl() {
  const ref = (
    process.env.SCHEDULE_PROJECT_REF ||
    readSecretFile(resolve(ROOT, "schedule.project.ref")) ||
    ""
  ).trim();
  if (!ref) return null;
  return `https://${ref}.functions.supabase.co`;
}

function scanSecretDirs() {
  const names = [
    ["SCHEDULE_API_KEY", "SCHEDULE_API_KEY"],
    ["SCHEDULE_API_KEY", "AGENT_API_KEY"],
    ["SCHEDULE_PASSWORD", "SCHEDULE_PASSWORD"],
    ["SCHEDULE_TOKEN", "SCHEDULE_TOKEN"],
    ["SCHEDULE_FUNCTIONS_URL", "SCHEDULE_FUNCTIONS_URL"],
  ];
  const dirs = [
    process.env.CODEX_SECRETS_PATH,
    "/run/secrets",
    "/var/run/secrets",
    resolve(ROOT, ".secrets"),
  ].filter(Boolean);
  for (const dir of dirs) {
    for (const [envKey, fileName] of names) {
      assignIfEmpty(envKey, readSecretFile(resolve(dir, fileName)));
    }
  }
}

/** Call once at CLI startup. */
export function loadCodexEnv() {
  const extra = process.env.SCHEDULE_ENV_FILE;
  if (extra) loadEnvFile(resolve(process.cwd(), extra));

  for (const name of ["codex.env", ".codex.env", ".env"]) {
    loadEnvFile(resolve(ROOT, name));
  }

  scanSecretDirs();

  assignIfEmpty(
    "SCHEDULE_FUNCTIONS_URL",
    process.env.VITE_FUNCTIONS_URL ||
      process.env.SCHEDULE_FUNCTIONS_URL ||
      defaultFunctionsUrl(),
  );

  assignIfEmpty(
    "SCHEDULE_PASSWORD",
    readSecretFile(resolve(ROOT, ".secrets/SCHEDULE_PASSWORD")),
  );

  assignIfEmpty(
    "SCHEDULE_API_KEY",
    readSecretFile(resolve(ROOT, "agent.api.key")),
  );

  assignIfEmpty(
    "SCHEDULE_TOKEN",
    readSecretFile(resolve(ROOT, ".schedule-token")),
  );
}

export function envStatus() {
  const keys = [
    "SCHEDULE_FUNCTIONS_URL",
    "SCHEDULE_PASSWORD",
    "SCHEDULE_API_KEY",
    "SCHEDULE_TOKEN",
    "VITE_FUNCTIONS_URL",
  ];
  const out = {};
  for (const k of keys) {
    const v = process.env[k];
    out[k] = v ? `set (${String(v).length} chars)` : "missing";
  }
  out.codex_env = existsSync(resolve(ROOT, "codex.env")) ? "found" : "missing";
  out.agent_api_key_file = existsSync(resolve(ROOT, "agent.api.key")) ? "found" : "missing";
  out.schedule_project_ref = existsSync(resolve(ROOT, "schedule.project.ref"))
    ? "found"
    : "missing";
  out.default_url_without_env = defaultFunctionsUrl() ? "yes" : "no";
  return out;
}
