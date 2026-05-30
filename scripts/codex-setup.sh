#!/usr/bin/env bash
# Paste this into Codex → Environment → Setup script → Custom (not Automatic).
# Secrets / Environment variables in Codex UI often do NOT reach the agent shell.
#
# 1) Replace PASTE_AGENT_API_KEY with the same value as Supabase secret AGENT_API_KEY
# 2) Save and start a NEW Codex session (restart container)

set -euo pipefail

export SCHEDULE_FUNCTIONS_URL="${SCHEDULE_FUNCTIONS_URL:-https://YOUR-PROJECT-REF.functions.supabase.co}"
export SCHEDULE_API_KEY="PASTE_AGENT_API_KEY"

# Optional fallbacks:
# export SCHEDULE_PASSWORD="..."
# export SCHEDULE_TOKEN="..."

echo "schedule codex-setup: URL=${SCHEDULE_FUNCTIONS_URL} API_KEY=${SCHEDULE_API_KEY:+set}"
