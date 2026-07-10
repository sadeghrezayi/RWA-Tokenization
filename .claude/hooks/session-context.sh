#!/usr/bin/env bash
# SessionStart hook (matchers: startup, resume, compact).
# Re-injects the canonical core invariants into context. This is the mechanism that lets the
# project's non-negotiable rules SURVIVE CONTEXT COMPACTION: after every compaction Claude
# Code re-runs this hook and its stdout is added back into the model's context.
#
# Standalone test:
#   echo '{"hook_event_name":"SessionStart","source":"compact"}' | .claude/hooks/session-context.sh
#
# Output: plain text to stdout (added to context), exit 0.
set -euo pipefail

# Resolve project root: prefer the env var Claude Code provides, else derive from script path.
ROOT="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
fi

INVARIANTS="$ROOT/.claude/core-invariants.md"

if [ ! -f "$INVARIANTS" ]; then
  # Fail safe: never crash the session; just note the absence.
  echo "[tokenization-platform] core-invariants.md not found at $INVARIANTS — restore it before proceeding."
  exit 0
fi

echo "===== TOKENIZATION PLATFORM STANDING ORDERS (re-injected; canonical, overrides conversation history) ====="
cat "$INVARIANTS"
echo "===== END TOKENIZATION PLATFORM STANDING ORDERS ====="
exit 0
