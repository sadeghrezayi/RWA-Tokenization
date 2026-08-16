# ENVIRONMENT AND INTEGRATIONS

Every integration the system has, whether it is real, and what remains. **No secret values appear
here — only variable names and where they are configured.**

---

## 1. Integration inventory

| # | System | Purpose | Real or mock | Port / adapter | Env vars | Outstanding |
|---|---|---|---|---|---|---|
| 1 | **PostgreSQL 16** | Everything persistent: identity, assets, offerings, ledger, CRM, outbox, notifications, encrypted KYC evidence, issuers | **Real** | Prisma; `infrastructure/persistence/*` | `DATABASE_URL` | Backups, DR, connection pooling |
| 2 | **IPFS (kubo)** | Immutable **asset legal documents** | **Real** (self-hosted) | `DocumentStore` → `infrastructure/documents/ipfs-document-store.ts` | `IPFS_API_URL` | Pinning strategy, gateway policy |
| 3 | **EVM devnet (anvil)** | Token deployment, minting, transfers, burns, ONCHAINID claims, attestation anchoring | **Real chain, dev network** | `infrastructure/chain/*` (ethers v6) | `DEVNET_RPC_URL`, `PLATFORM_OPERATOR_MNEMONIC`, `ONCHAINID_CLAIM_ISSUER_ADDRESS`, `ATTESTATION_REGISTRY_ADDRESS` | **Besu stand-up is a pre-pilot gate, not done.** All three of the first vars must be present or the API falls back to a logging placeholder |
| 4 | **ERC-3643 / T-REX** | Compliant asset token, one per asset | **Real library** (`@tokenysolutions/t-rex`) | `trex-asset-token-deployer/issuer/mover.ts` | as above | Compliance-module configuration is fixed, not yet policy-driven (roadmap 5) |
| 5 | **ONCHAINID** | On-chain identity + KYC claim | **Real library** (`@onchain-id/solidity`) | `onchainid-claim-issuer.ts`, fallback `dev-log-claim-issuer.ts` | as above | Claim issuance is synchronous and fails the request if the chain is down |
| 6 | **Attestation registry** | Anchors signed valuation attestations on chain | **Real, own contract** | `contracts/src/AttestationRegistry.sol`, `chain/attestation-chain.ts` | `ATTESTATION_REGISTRY_ADDRESS` | Best-effort in-request anchoring |
| 7 | **Email / SMTP** | Password reset, email verification, KYC decision, distribution paid | **MOCK — dev sink only** | `EmailSender` port; `application/identity/email-outbox.ts` | none yet | **OD-7 undecided.** nodemailer is pre-approved; no adapter exists. Nothing reaches a real inbox |
| 8 | **SMS** | — | **Not started** | — | — | Never scoped |
| 9 | **KYC/KYB screening (sanctions, PEP)** | Investor and entity screening | **MOCK by decision (OD-11)** | port only, labelled dev mock | — | Vendor selection is procurement; officers review manually today |
| 10 | **Sejam / national KYC registry** | — | **Not integrated** | — | — | Discussed only as a jurisdiction concept; **no code, no port, no decision** |
| 11 | **Banking / payment rail** | Money-in and money-out in Rial | **Manual by decision (OD-6a)** | `application/funding/*`, `infrastructure/settlement/prisma-settlement-rail.ts` | `FUNDING_BANK_NAME`, `FUNDING_ACCOUNT_HOLDER`, `FUNDING_ACCOUNT_NUMBER`, `FUNDING_NOTICE` | No bank statement import, no PSP. A human reconciles. Unset vars ⇒ "NOT CONFIGURED" placeholders + warning |
| 12 | **Digital Rial / CBDC** | — | **Not started** | — | — | Not scoped, not decided |
| 13 | **Oracle / valuation feed** | Asset valuations | **Internal signed attestations** (by design — no external oracle) | `application/attestations/*` | — | Valuation review/dispute lifecycle is roadmap 7.3 |
| 14 | **pg-boss** | Cluster-safe cron (CRM follow-up-due scan) | **Real** | `infrastructure/jobs/pg-boss-job-scheduler.ts` | `SCHEDULED_JOBS_ENABLED`, `FOLLOW_UP_DUE_CRON` | Default tenant only |
| 15 | **Transactional outbox** | At-least-once side effects | **Real** | `infrastructure/outbox/*`, `OutboxMessage` | `OUTBOX_DRAIN_INTERVAL_MS` | In-process drainer; multi-node untested |
| 16 | **Next.js ISR revalidation** | Purge the public catalogue when an offering is published/unpublished | **Real** | `infrastructure/http/web-public-page-revalidator.ts` → `apps/web/app/api/revalidate/route.ts` | `REVALIDATE_SECRET` (**both sides**), `WEB_ORIGIN` | If the secret is missing the purge silently never runs |
| 17 | **GitHub Actions** | CI | **Real** | `.github/workflows/ci.yml` | repo-level only | OD-19 allows switching to a self-hosted runner if required |
| 18 | **Analytics / monitoring / APM** | — | **Not started** | — | — | Roadmap 8.3 |

## 2. Complete environment-variable reference

Source of truth: `services/api/.env.example` (tracked) and `.github/workflows/ci.yml`.
Grepped from source, this is every variable the code reads:

**API**
`DATABASE_URL`, `PORT`, `AUTH_TOKEN_SECRET`, `OFFICER_EMAIL`, `OFFICER_PASSWORD_HASH`,
`OFFICER2_EMAIL`, `OFFICER2_PASSWORD_HASH`, `KYC_EVIDENCE_KEY`, `FUNDING_BANK_NAME`,
`FUNDING_ACCOUNT_HOLDER`, `FUNDING_ACCOUNT_NUMBER`, `FUNDING_NOTICE`,
`LEDGER_CREDIT_APPROVAL_THRESHOLD_RIAL`, `DEVNET_RPC_URL`, `PLATFORM_OPERATOR_MNEMONIC`,
`ONCHAINID_CLAIM_ISSUER_ADDRESS`, `ATTESTATION_REGISTRY_ADDRESS`, `IPFS_API_URL`,
`OUTBOX_DRAIN_INTERVAL_MS`, `SCHEDULED_JOBS_ENABLED`, `FOLLOW_UP_DUE_CRON`, `REVALIDATE_SECRET`,
`WEB_ORIGIN`, `SITE_URL`, `NODE_ENV`

**Web**
`NEXT_PUBLIC_API_URL`, `API_URL`, `REVALIDATE_SECRET`, `SITE_URL`, `NODE_ENV`

**Tests / CI only**
`WEB_BASE_URL`, `API_BASE_URL`, `API_LOG_PATH`, `PLAYWRIGHT_CHANNEL`

### Which are required

| Required to boot the API | Required for a working demo | Optional |
|---|---|---|
| `DATABASE_URL`, `AUTH_TOKEN_SECRET` | `OFFICER_EMAIL` + `OFFICER_PASSWORD_HASH`, `IPFS_API_URL`, the three devnet vars, `KYC_EVIDENCE_KEY`, `REVALIDATE_SECRET` (both sides) | `OFFICER2_*`, funding details, cron vars, `FUNDING_NOTICE`, `SITE_URL` |

### Local status (observed, values not shown)

`services/api/.env` **exists** on the development machine with dev values for `DATABASE_URL`,
`PORT`, `DEVNET_RPC_URL`, `PLATFORM_OPERATOR_MNEMONIC` (the **public well-known anvil test
mnemonic**), `ONCHAINID_CLAIM_ISSUER_ADDRESS`, `AUTH_TOKEN_SECRET`, `ATTESTATION_REGISTRY_ADDRESS`.
It is **git-ignored and untracked**. `KYC_EVIDENCE_KEY`, the funding details and the officer hash
were not observed in it — the officer credentials used for the manual demo are configured
per-machine.

## 3. Environments

| Environment | Exists? | Notes |
|---|---|---|
| Local development | ✅ | Docker Compose + host processes, as per RUNBOOK |
| CI | ✅ | GitHub Actions, ephemeral Postgres + IPFS services + anvil |
| Staging | ❌ | Not created |
| Production | ❌ | Not created. No hosting, reverse proxy, TLS, secrets manager or runbook exists |
