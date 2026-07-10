#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash) — ENFORCING.
# Blocks catastrophic / irreversible shell commands. Exit 2 => Claude Code blocks the call and
# shows stderr to the model. Exit 0 => allowed. Designed to fail SAFE: if the command field
# cannot be parsed, it scans the raw payload text for the same danger patterns.
#
# Standalone tests:
#   echo '{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}'      | .claude/hooks/guard-bash.sh ; echo "exit=$?"
#   echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}'        | .claude/hooks/guard-bash.sh ; echo "exit=$?"
set -uo pipefail

PAYLOAD="$(cat)"

if command -v jq >/dev/null 2>&1; then
  CMD="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.command // ""' 2>/dev/null)"
  [ -z "$CMD" ] && CMD="$PAYLOAD"
else
  CMD="$PAYLOAD"
fi

block() {
  echo "BLOCKED by guard-bash: $1" >&2
  echo "Command: $CMD" >&2
  echo "If this is genuinely required, ask the user to run it manually or adjust the approach." >&2
  exit 2
}

# --- catastrophic filesystem destruction ---
printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+(-[a-zA-Z]*[rf][a-zA-Z]*[[:space:]]+)+(/|/\*|~|\$HOME|"\$HOME")([[:space:]]|$)' \
  && block "recursive force-delete of root/home"
printf '%s' "$CMD" | grep -Eq 'rm[[:space:]]+-[a-zA-Z]*[rf].*[[:space:]]/(\*|$)' \
  && block "recursive delete targeting the filesystem root"

# --- fork bomb ---
printf '%s' "$CMD" | grep -Eq ':\(\)[[:space:]]*\{[[:space:]]*:\|:' \
  && block "fork bomb"

# --- disk / device writes ---
printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])mkfs(\.|[[:space:]])' \
  && block "filesystem format (mkfs)"
printf '%s' "$CMD" | grep -Eq 'dd[[:space:]]+.*of=/dev/' \
  && block "raw write to a block device (dd of=/dev/...)"
printf '%s' "$CMD" | grep -Eq '>[[:space:]]*/dev/(sd|nvme|disk)' \
  && block "redirect into a raw disk device"

# --- world-writable on system paths ---
printf '%s' "$CMD" | grep -Eq 'chmod[[:space:]]+(-[a-zA-Z]+[[:space:]]+)*777[[:space:]]+/' \
  && block "chmod 777 on a root path"

# --- remote-pipe-to-shell (supply-chain risk) ---
printf '%s' "$CMD" | grep -Eq '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(sh|bash|zsh|fish)([[:space:]]|$)' \
  && block "piping a remote download straight into a shell (curl|sh)"

# --- destructive git force-push (allow --force-with-lease) ---
if printf '%s' "$CMD" | grep -Eq 'git[[:space:]]+push'; then
  if printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])(-f|--force)([[:space:]]|=|$)'; then
    # --force-with-lease is followed by '-', so the pattern above does NOT match it.
    block "git force-push detected. Use 'git push --force-with-lease <branch>' on a feature branch instead, and never force-push a protected branch."
  fi
fi

exit 0
