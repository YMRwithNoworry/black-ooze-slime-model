#!/usr/bin/env bash
# Install the `mc-model` agent preset into a DSH profile.
#
# This deployment composes @deepseek-ai/dsh-agent-preset-registry, which reads
# DECLARATIONS and does NOT scan $DSH_HOME/.agent-presets. Copying files into
# that directory is silently ignored; the preset must be inserted as a row in
# the profile patch. This script appends that row idempotently.
#
# Usage:
#   ./install.sh                 # install into the `web` profile
#   ./install.sh <profile>       # install into another profile
set -euo pipefail

PROFILE="${1:-web}"
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
PATCH="$DSH_HOME/profiles/$PROFILE/cordis.patch.yml"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/mc-model.insert.yml"

[ -f "$PATCH" ] || { echo "no such profile patch: $PATCH" >&2; exit 1; }
[ -f "$SRC" ]   || { echo "missing declaration fragment: $SRC" >&2; exit 1; }

if grep -q 'id: preset-mc-model' "$PATCH"; then
  echo "preset-mc-model is already declared in $PATCH — nothing to do"
  exit 0
fi

cp "$PATCH" "$PATCH.bak-before-mc-model-$(date +%Y%m%d-%H%M%S)"
printf '\n' >> "$PATCH"
cat "$SRC" >> "$PATCH"
echo "inserted preset-mc-model into $PATCH"
echo "restart dsh (or let the live reload settle), then verify with:"
echo "  dsh --profile $PROFILE --dump-config | grep -A 5 'id: preset-mc-model'"
