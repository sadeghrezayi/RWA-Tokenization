#!/usr/bin/env bash
# PreToolUse hook (matcher: Write|Edit) — ENFORCING.
# Blocks committing real secret material into repo files — a critical guard for a crypto/
# tokenization project where private keys and seed phrases are routinely handled.
# Exit 2 => blocked (stderr shown to model). Exit 0 => allowed.
#
# Policy:
#   - PEM private keys and AWS access keys: blocked everywhere (never belong in source).
#   - Hardcoded EVM private keys (labeled) and BIP39 mnemonics: blocked in non-test files;
#     allowed in test/fixture paths and for the well-known public Anvil/Hardhat test mnemonic,
#     because deterministic test keys are legitimate in test code.
#
# Standalone tests:
#   echo '{"tool_name":"Write","tool_input":{"file_path":"src/x.ts","content":"const k=\"-----BEGIN PRIVATE KEY-----\""}}' | .claude/hooks/guard-write.sh ; echo "exit=$?"
#   echo '{"tool_name":"Write","tool_input":{"file_path":"src/x.ts","content":"export const x = 1"}}' | .claude/hooks/guard-write.sh ; echo "exit=$?"
set -uo pipefail

PAYLOAD="$(cat)"

if command -v jq >/dev/null 2>&1; then
  CONTENT="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.content // .tool_input.new_string // ""' 2>/dev/null)"
  FILE="$(printf '%s' "$PAYLOAD" | jq -r '.tool_input.file_path // ""' 2>/dev/null)"
else
  CONTENT="$PAYLOAD"
  FILE=""
fi

block() {
  echo "BLOCKED by guard-write: $1" >&2
  echo "File: ${FILE:-<unknown>}" >&2
  echo "Secrets must come from env vars / a secret manager, never hardcoded in repo files." >&2
  exit 2
}

# Is this a test/fixture path where deterministic keys are acceptable?
IS_TEST=0
printf '%s' "$FILE" | grep -Eiq '(^|/)(tests?|__tests__|fixtures?|mocks?)(/|$)|\.(test|spec|t)\.[a-z]+$|\.t\.sol$' && IS_TEST=1

# Well-known PUBLIC Anvil/Hardhat test mnemonic — explicitly allowed.
WELL_KNOWN_MNEMONIC='test test test test test test test test test test test junk'
IS_WELL_KNOWN=0
printf '%s' "$CONTENT" | grep -qF "$WELL_KNOWN_MNEMONIC" && IS_WELL_KNOWN=1

# --- always-block patterns ---
printf '%s' "$CONTENT" | grep -Eq -- '-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----' \
  && block "PEM private key material"
printf '%s' "$CONTENT" | grep -Eq 'AKIA[0-9A-Z]{16}' \
  && block "AWS access key id"

# --- path-sensitive patterns (allowed in tests / for the public test mnemonic) ---
if [ "$IS_TEST" -eq 0 ] && [ "$IS_WELL_KNOWN" -eq 0 ]; then
  # Labeled EVM private key: a 'private key' label near a 64-hex value.
  if printf '%s' "$CONTENT" | grep -Eiq 'private[_ ]?key'; then
    printf '%s' "$CONTENT" | grep -Eq '0x[0-9a-fA-F]{64}' \
      && block "hardcoded EVM private key (labeled, 64-hex). Put it in env/secret manager, or move to a test fixture."
  fi
  # BIP39 mnemonic: a mnemonic/seed label assigned 12+ lowercase words.
  printf '%s' "$CONTENT" | grep -Eiq '(mnemonic|seed[ _]?phrase)["'"'"']?[[:space:]]*[:=][[:space:]]*["'"'"'][a-z]+( [a-z]+){11,}' \
    && block "hardcoded BIP39 mnemonic/seed phrase"
fi

exit 0
