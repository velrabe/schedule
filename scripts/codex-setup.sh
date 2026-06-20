#!/usr/bin/env bash
# Paste this into Codex → Environment → Setup script → Custom (not Automatic).
# Secrets / Environment variables in Codex UI often do NOT reach the agent shell.
#
# 1) Replace PASTE_AGENT_API_KEY with the same value as Supabase secret AGENT_API_KEY
# 2) Set SCHEDULE_FUNCTIONS_URL or create schedule.project.ref locally (gitignored)
# 3) Save and start a NEW Codex session (restart container)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REF="${SCHEDULE_PROJECT_REF:-}"
if [[ -z "$REF" && -f "$ROOT/schedule.project.ref" ]]; then
  REF="$(tr -d '[:space:]' < "$ROOT/schedule.project.ref")"
fi
if [[ -z "${SCHEDULE_FUNCTIONS_URL:-}" && -n "$REF" ]]; then
  export SCHEDULE_FUNCTIONS_URL="https://${REF}.functions.supabase.co"
fi
if [[ -z "${SCHEDULE_FUNCTIONS_URL:-}" ]]; then
  echo "schedule codex-setup: set SCHEDULE_FUNCTIONS_URL or schedule.project.ref" >&2
  exit 1
fi

export SCHEDULE_API_KEY="PASTE_AGENT_API_KEY"
export SCHEDULE_USE_CURL=1

# Optional fallbacks:
# export SCHEDULE_PASSWORD="..."
# export SCHEDULE_TOKEN="..."

echo "schedule codex-setup: URL=${SCHEDULE_FUNCTIONS_URL} API_KEY=${SCHEDULE_API_KEY:+set}"
