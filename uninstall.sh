#!/bin/bash
# Uninstall claude-usage-report

set -e

HOOK_DST="${HOME}/.claude/hooks/usage-report.mjs"
DISABLED_FLAG="${HOME}/.claude/.usage-report-disabled"
RATE_CACHE="${HOME}/.claude/.rate-usage-cache.json"
BIN="${HOME}/.local/bin/claude-usage-report"

[ -f "$HOOK_DST" ] && rm "$HOOK_DST" && echo "Removed ${HOOK_DST}"
[ -f "$DISABLED_FLAG" ] && rm "$DISABLED_FLAG" && echo "Removed disable flag"
[ -f "$RATE_CACHE" ] && rm "$RATE_CACHE" && echo "Removed rate cache"
[ -f "$BIN" ] && rm "$BIN" && echo "Removed CLI ${BIN}"

echo ""
echo "NOTE: You may want to remove the Stop hook entry from ~/.claude/settings.json manually."
echo "Uninstall complete."
