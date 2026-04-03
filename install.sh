#!/bin/bash
# Install claude-usage-report as a Claude Code stop hook

set -e

CLAUDE_DIR="${HOME}/.claude"
HOOKS_DIR="${CLAUDE_DIR}/hooks"
SETTINGS="${CLAUDE_DIR}/settings.json"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_SRC="${SCRIPT_DIR}/usage-report.mjs"
HOOK_DST="${HOOKS_DIR}/usage-report.mjs"

# Verify source exists
if [ ! -f "$HOOK_SRC" ]; then
  echo "Error: usage-report.mjs not found in ${SCRIPT_DIR}"
  exit 1
fi

# Ensure directories exist
mkdir -p "$HOOKS_DIR"

# Copy hook script
cp "$HOOK_SRC" "$HOOK_DST"
echo "Installed usage-report.mjs to ${HOOK_DST}"

# Add stop hook to settings.json if not already present
if [ ! -f "$SETTINGS" ]; then
  cat > "$SETTINGS" << 'SETTINGS_EOF'
{
  "hooks": {
    "Stop": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.claude/hooks/usage-report.mjs",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
SETTINGS_EOF
  echo "Created ${SETTINGS} with Stop hook."
else
  # Check if hook already exists
  if grep -q "usage-report.mjs" "$SETTINGS" 2>/dev/null; then
    echo "Hook already registered in ${SETTINGS}."
  else
    echo ""
    echo "NOTE: Please add the following to your ${SETTINGS} under hooks.Stop:"
    echo ""
    echo '  {'
    echo '    "matcher": "",'
    echo '    "hooks": ['
    echo '      {'
    echo '        "type": "command",'
    echo '        "command": "node ~/.claude/hooks/usage-report.mjs",'
    echo '        "timeout": 10'
    echo '      }'
    echo '    ]'
    echo '  }'
    echo ""
  fi
fi

# Create convenience alias
BIN_DIR="${HOME}/.local/bin"
mkdir -p "$BIN_DIR"
cat > "${BIN_DIR}/claude-usage-report" << 'BIN_EOF'
#!/bin/bash
node ~/.claude/hooks/usage-report.mjs "$@"
BIN_EOF
chmod +x "${BIN_DIR}/claude-usage-report"
echo "Installed CLI: claude-usage-report (enable|disable|status)"

# Ensure ~/.local/bin is in PATH
if ! echo "$PATH" | grep -q "${BIN_DIR}"; then
  echo ""
  echo "Add ~/.local/bin to your PATH if not already:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
fi

echo ""
echo "Done! Usage report will appear after each Claude Code prompt."
echo "Toggle with: claude-usage-report disable|enable|status"
