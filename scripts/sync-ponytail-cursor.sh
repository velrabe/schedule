#!/usr/bin/env bash
# Refresh Cursor ponytail rule + skills from vendor/ponytail submodule.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
src="$root/vendor/ponytail"
if [[ ! -d "$src/.cursor/rules" ]]; then
  echo "Run: git submodule update --init vendor/ponytail" >&2
  exit 1
fi
mkdir -p "$root/.cursor/rules" "$root/.cursor/skills"
cp "$src/.cursor/rules/ponytail.mdc" "$root/.cursor/rules/"
for skill in ponytail ponytail-review ponytail-audit ponytail-debt ponytail-help; do
  rm -rf "$root/.cursor/skills/$skill"
  cp -r "$src/skills/$skill" "$root/.cursor/skills/"
done
echo "Synced ponytail Cursor artifacts from vendor/ponytail"
