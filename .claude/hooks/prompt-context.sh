#!/usr/bin/env bash
# UserPromptSubmit hook.
# On prompts that request engineering work, inject a single-line discipline reminder so the
# core rules stay salient at the moment work begins. Conversational prompts get nothing
# (keep it cheap — YAGNI). Plain stdout is added to context. Always exit 0 (non-blocking).
#
# Standalone test:
#   echo '{"hook_event_name":"UserPromptSubmit","prompt":"implement the issuance use case"}' | .claude/hooks/prompt-context.sh
set -euo pipefail

PAYLOAD="$(cat)"

# Extract the prompt (jq if available, else fall back to the raw payload text).
if command -v jq >/dev/null 2>&1; then
  PROMPT="$(printf '%s' "$PAYLOAD" | jq -r '.prompt // ""' 2>/dev/null || printf '%s' "$PAYLOAD")"
else
  PROMPT="$PAYLOAD"
fi

# Lowercase for matching (bash 3.2-compatible; no ${var,,}).
PROMPT_LC="$(printf '%s' "$PROMPT" | tr '[:upper:]' '[:lower:]')"

if printf '%s' "$PROMPT_LC" | grep -Eq '(implement|build|create|add|write|develop|scaffold|refactor|fix|code|feature|endpoint|contract|migration|test)'; then
  echo "[tokenization-platform reminder] TDD first (red→green→refactor). Verify by running before calling it done. No solo business/scope/stack decisions — surface options + recommendation. See .claude/core-invariants.md."
fi
exit 0
