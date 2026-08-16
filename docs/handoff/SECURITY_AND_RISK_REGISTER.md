# SECURITY AND RISK REGISTER

Assessed 2026-08-16 at `e26f60f`. The formal threat model is `docs/security-threat-model.md`;
this register is the practical "what is actually true right now" list.

**Context that scales every rating:** there is **no production deployment, no real users and no
real money**. Ratings describe the risk *if this system were deployed as-is*, which is the useful
question for a handoff.

Severity: **Critical · High · Medium · Low · Informational**

---

## Critical

| # | Risk | Detail | Mitigation status |
|---|---|---|---|
| C-1 | **A single hot key controls minting, burning and claim issuance** | One mnemonic (`PLATFORM_OPERATOR_MNEMONIC`) is loaded into the API process and used by every chain adapter, including deriving investors' **custodial wallets** (`infrastructure/chain/custodial-wallets.ts`). Compromising the API process compromises every token and every holder wallet | **Not mitigated.** The project's own invariants forbid this in production ("no single permanent EOA controller of mint/burn/freeze"); OD-16 names an interim isolated signer service and an HSM/MPC target. Nothing is implemented |
| C-2 | **KYC evidence encryption key is a plain env var with no rotation or escrow** | `KYC_EVIDENCE_KEY` decrypts stored passport/identity scans. If unset, the code falls back to an **insecure dev key with a loud warning** | Encryption at rest ✅ (AES-256-GCM, plaintext never hits the DB, real `erase()`); key management ❌ |
| C-3 | **No retention or erasure policy for personal data** | The *capability* to erase exists; the *policy* (how long identity evidence is kept, when it must be destroyed) does not, and is jurisdiction-specific | Documented in the decision log as outstanding, **requires local legal validation** |

## High

| # | Risk | Detail | Status |
|---|---|---|---|
| H-1 | **Chain writes are synchronous and unrecoverable** | A failed or dropped transaction surfaces as a 500; there is no `ChainTransaction` lifecycle, no retry with idempotency keys, no reconciliation between DB state and chain state | Known; roadmap 1.6 remainder. Nonce *collisions* are solved (see below) |
| H-2 | **Ledger is single-entry** | Balances are derived from `LedgerEntry` rows with no double-entry journal and no conservation invariant tests | Roadmap 6.1 defines a parallel-run migration with conservation tests |
| H-3 | **No secrets management** | Everything is env-var based; the officer password hash, JWT secret and mnemonic sit in one file | `.gitignore` correctly excludes `.env*` (only `.env.example` is tracked); nothing further |
| H-4 | **No backups, no disaster recovery, no restore drill** | Postgres holds the ledger, the cap-table source of truth for allocations, and the encrypted PII | Not started (roadmap 8.3) |
| H-5 | **No observability** | No metrics, no structured logs, no alerting. A silent failure is invisible | Not started (roadmap 8.3). Mitigating detail: unmapped 500s **are** logged server-side since 2026-08-11 |
| H-6 | **Rate limiting is in-memory** | `AuthRateLimitGuard` counts per process, so it is not a limit behind more than one instance, and it resets on restart | Account lockout (`LoginAttempt`) **is** persistent, which is the stronger control |

## Medium

| # | Risk | Detail | Status |
|---|---|---|---|
| M-1 | **MFA is opt-in and officers-only** | A privileged account can exist without a second factor | Deliberate (OD-23 open). Recommendation on record: mandatory for privileged roles |
| M-2 | **A legacy staff token without roles is treated as `platform_operator`** | Full staff privileges for a token minted before roles existed | Deliberate, documented and tested; would need removing before production |
| M-3 | **Email is never actually delivered** | Password reset, verification and decision notices go to a dev sink; combined with OD-22 (nothing is gated on email verification) an undeliverable decision is possible | Known and accepted for the pilot |
| M-4 | **Public catalogue is a financial promotion** | Anonymous visitors see offerings, terms and attested valuations | Content is flagged as **requiring local legal validation**; no projections are shown (OD-21) |
| M-5 | **IPFS-hosted legal documents are world-readable to anyone with the CID** | Intended for legal documents only — identity evidence deliberately never goes there | Deliberate split; holders only *learn* CIDs for documents an operator published |
| M-6 | **Approval threshold is a placeholder** | `LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL` decides when two-person control applies | Explicitly marked as requiring local policy validation |
| M-7 | **No dependency-vulnerability gate in CI** | `pnpm audit` is not run | OD-4 approved the dependency set; auditing is roadmap 8.2 |
| M-8 | **No CSP or security headers** | Next.js defaults only | Roadmap 8.2 |
| M-9 | **PII may reach logs** | No redaction layer; nothing asserts absence | Roadmap 8.2 |

## Low

| # | Risk | Detail |
|---|---|---|
| L-1 | Cookie-over-Bearer precedence surprised a test author once; a client sending both authenticates as the cookie's owner | Documented in `auth.guard.ts` and in KNOWN_ISSUES |
| L-2 | The holder registry is rebuilt from chain events on demand — slow for large event counts, and a corrupt stream surfaces as a 409 rather than silently wrong data (which is the desired behaviour) |
| L-3 | pg-boss scheduled scans run only for the default tenant |
| L-4 | Custodial wallet derivation from the platform mnemonic means "the investor's wallet" is not the investor's |

## Informational / controls that ARE in place

- **Deny-by-default RBAC** with the exact role→permission matrix pinned by a test.
- **Maker-checker** on ledger credits above a threshold, with four-eyes enforced
  (`SelfApprovalError`) and approve+execute made **transactionally atomic**.
- **Tenant isolation** enforced by a Prisma proxy that *forbids* by-id operations, with tests.
- **argon2** password hashing; **persistent** per-account lockout.
- **httpOnly cookie sessions + CSRF guard** that challenges cookie auth only.
- **Encrypted-at-rest KYC evidence** with a real erase path; listings return metadata only.
- **Opaque 500s to clients, full detail in the server log.**
- **Guard hooks**: `.claude/hooks/guard-bash.sh` blocks catastrophic shell commands;
  `guard-write.sh` blocks writing private keys or seed phrases into repository files.
- **Only `.env.example` is tracked**; no secret value is committed anywhere.
- **No hardcoded credentials found** in source during this audit. The only key material in the
  repository is the **well-known public anvil test mnemonic**, in `.env.example` and CI, clearly
  labelled devnet-only.

## Regulatory assumptions (must not be mistaken for compliance)

The codebase asserts **no** regulatory compliance. Everything jurisdiction-specific is
configuration marked *"REQUIRES LOCAL LEGAL VALIDATION"*: the onboarding field set, the rights
catalogue, the approval threshold, the public-catalogue content, holder document entitlement, and
what individual verification of a company officer must consist of.
