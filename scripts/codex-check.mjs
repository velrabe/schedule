#!/usr/bin/env node
/** Diagnostics for Codex runtime — no secrets printed. */
import { loadCodexEnv, envStatus } from "./loadCodexEnv.mjs";

loadCodexEnv();
console.log(JSON.stringify(envStatus(), null, 2));

const hasUrl = Boolean(process.env.SCHEDULE_FUNCTIONS_URL);
const hasAuth = Boolean(
  process.env.SCHEDULE_TOKEN ||
    process.env.SCHEDULE_API_KEY ||
    process.env.SCHEDULE_PASSWORD,
);

if (!hasUrl) {
  console.error("\nMissing SCHEDULE_FUNCTIONS_URL — add in Codex Environment variables (not only Secrets).");
  process.exit(1);
}
if (!hasAuth) {
  console.error(
    "\nMissing auth: set SCHEDULE_TOKEN, or SCHEDULE_API_KEY (+ AGENT_API_KEY on Supabase), or SCHEDULE_PASSWORD.",
  );
  process.exit(1);
}
console.log("\nOK — env looks sufficient. Run: node scripts/schedule-api.mjs login");
