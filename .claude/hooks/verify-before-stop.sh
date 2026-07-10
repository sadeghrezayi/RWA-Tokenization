#!/usr/bin/env bash
# Stop hook.
# Injects a concise Definition-of-Done reminder at the moment Claude is about to finish.
# DELIBERATELY NON-BLOCKING: a Stop hook that hard-blocks (exit 2) with no real completion
# signal would trap the session in a loop. Claude Code passes `stop_hook_active: true` once a
# stop hook has already fired; we also honor that to guarantee we never loop. Enforcement of
# "verify before done" is therefore advisory here and is backed by the standing orders + the
# user's review gate, not by a hard block.
#
# Standalone test:
#   echo '{"hook_event_name":"Stop"}' | .claude/hooks/verify-before-stop.sh
set -euo pipefail

PAYLOAD="$(cat)"

if command -v jq >/dev/null 2>&1; then
  ACTIVE="$(printf '%s' "$PAYLOAD" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
  if [ "$ACTIVE" = "true" ]; then
    exit 0
  fi
fi

# Emit non-blocking feedback via additionalContext.
cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "[tokenization-platform DoD check before finishing] Confirm: (1) test written first + now passing; (2) lint/typecheck/format clean; (3) edge & error paths covered; (4) no dead code/unexplained TODO; (5) behavior actually run and output read; (6) decisions/assumptions reported. If any item is unmet, report the work as in-progress with the specific gap named — do not call it done."
  }
}
JSON
exit 0
