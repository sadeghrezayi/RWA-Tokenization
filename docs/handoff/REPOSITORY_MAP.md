# REPOSITORY MAP

Root: `/Users/sadeghrezayi/Projects/RWA-Tokenization` · pnpm workspace (`pnpm-workspace.yaml`).
There is **no `packages/` directory** — the workspace is `apps/web`, `services/api`, `contracts`.

```
.
├── CLAUDE.md                    # HOW we build — read first, loaded into every Claude session
├── TEST_SCENARIOS.md            # Narrated manual demo script, root-level on purpose
├── docker-compose.yml           # Postgres (host :5433) + IPFS kubo (:5001)
├── package.json                 # workspace scripts: lint, format, format:fix, typecheck, test
├── pnpm-workspace.yaml, pnpm-lock.yaml, tsconfig.base.json, eslint.config.mjs, .prettierrc.json
├── .github/workflows/ci.yml     # the full verification battery
├── .claude/                     # agent governance (see below)
├── docs/                        # product + engineering documentation (see below)
├── apps/web/                    # Next.js 15 — public site, investor portal, admin console
├── services/api/                # NestJS — the whole backend
├── contracts/                   # Foundry — Solidity
└── platform-overview/           # generated deliverable (FEATURES.md + screenshots); git-ignored
```

---

## `.claude/` — agent governance (**read before changing behaviour**)

| File | Role |
|---|---|
| `core-invariants.md` | **Canonical non-negotiables**, re-injected at session start and after every compaction. Overrides conversation history |
| `settings.json` | Hook wiring |
| `launch.json` | Named preview servers: `api` → 3001, `web` → 3000 |
| `hooks/session-context.sh` | Injects the invariants (compaction-survival mechanism) |
| `hooks/prompt-context.sh` | One-line discipline reminder on action prompts |
| `hooks/verify-before-stop.sh` | Injects the Definition-of-Done checklist when finishing |
| `hooks/guard-bash.sh` | **Enforcing** — blocks catastrophic shell commands (exit 2) |
| `hooks/guard-write.sh` | **Enforcing** — blocks writing private keys/seed phrases into repo files (exit 2) |

## `docs/`

| File | Contents |
|---|---|
| `product-requirements.md` | **Source of truth for the product** (FR-*/NFR-* identifiers used in code comments) |
| `implementation-roadmap.md` | Phases 0–8 with per-slice content and exit criteria |
| `open-product-decisions.md` | **Append-only decision log** + open decisions OD-1…OD-23 |
| `current-state-audit.md`, `product-gap-analysis.md`, `target-product-architecture.md`, `domain-model.md`, `information-architecture.md`, `role-permission-matrix.md`, `security-threat-model.md`, `data-migration-plan.md`, `test-strategy.md` | The Phase-0 audit set |
| `engineering/architecture.md`, `principles.md`, `tdd.md`, `tech-stack.md`, `glossary.md` | How to build; use the glossary's exact terms |
| `handoff/**` | **This package** |

## `services/api/` — backend

```
prisma/schema.prisma            # 43 models/enums
prisma/migrations/              # 28 migrations, 20260710001437_init_investors → 20260815090742_issuer_organisations
src/main.ts                     # entry point
src/app.module.ts               # ⚠ COMPOSITION ROOT — the only place ports meet adapters (~1800 lines)
src/domain/<context>/           # framework-free aggregates (no imports from application/infrastructure)
src/application/<context>/      # use cases + ports.ts (interfaces) + errors.ts
src/infrastructure/
  http/                         # 18 controllers + auth.guard, csrf.guard, rate-limit.guard, domain-error.filter, session, cookies
  persistence/                  # 24 Prisma repositories + prisma.service
  chain/                        # ethers adapters + custodial-wallets (nonce lanes)
  auth/                         # argon2 hasher, jose JWT, totp, rate limiter
  crypto/aes-gcm-cipher.ts      # KYC evidence sealing
  documents/ipfs-document-store.ts
  jobs/                         # pg-boss scheduler + bootstrap
  outbox/                       # drainer
  settlement/prisma-settlement-rail.ts
  tenancy/                      # tenant-context (AsyncLocalStorage), tenant-scoped-prisma (Proxy), middleware
test/domain, test/application, test/fakes      # unit (89 files)
test/integration                # 54 files: real Postgres, IPFS, anvil; e2e via supertest
vitest.config.ts, vitest.integration.config.ts # integration runs fileParallelism: false
```

### Security-sensitive files (change with care)

`src/infrastructure/http/auth.guard.ts` · `csrf.guard.ts` · `rate-limit.guard.ts` ·
`src/application/identity/authorization.ts` (the permission matrix) ·
`src/infrastructure/tenancy/tenant-scoped-prisma.ts` ·
`src/infrastructure/crypto/aes-gcm-cipher.ts` ·
`src/infrastructure/chain/custodial-wallets.ts` (nonce lanes — read the comments) ·
`src/application/issuers/require-verified-person.ts` (the individual-verification gate) ·
`src/infrastructure/http/domain-error.filter.ts` (status mapping + 500 logging).

### Complete HTTP route inventory

| Controller | Routes |
|---|---|
| `auth` | `POST login`, `POST officer/login`, `POST officer/mfa`, `GET officer/mfa/status`, `POST officer/mfa/{enroll,confirm,disable}`, `GET session`, `POST logout`, `POST password-reset/request`, `POST password-reset`, `POST email-verification/request`, `POST verify-email` |
| `investors` | `POST /`, `GET me`, `GET pending-kyc`, `GET /`, `GET :id/detail`, `GET :id`, `POST :id/kyc/{start-review,approve,reject}` |
| `onboarding` | `GET form`, `POST start`, `GET me`, `POST me/steps/:step/complete`, `POST me/evidence`, `DELETE me/evidence/:ref`, `GET me/evidence/:ref`, `POST me/steps/:step/answers`, `GET me/answers`, `POST me/submit`, `GET evidence/:ref`, `GET :investorId/answers`, `GET :investorId`, `POST :investorId/request-changes` |
| `assets` | `POST /`, `GET /`, `GET :id`, `POST :id/start-structuring`, `POST :id/documents`, `POST :id/documents/:kind/visibility`, `POST :id/real-estate`, `POST :id/rights/:kind`, `DELETE :id/rights/:kind`, `POST :id/custody`, `POST :id/checklist/:item`, `POST :id/approve`, `POST :id/tokenize` |
| `offerings` | `POST /`, `POST :id/{publish,unpublish,open,subscribe,close}`, `GET /`, `GET :id` |
| `public` | `GET offerings`, `GET offerings/:id` |
| `funding` | `POST me`, `GET me`, `POST me/:id/cancel`, `GET pending`, `POST :id/confirm`, `POST :id/reject` |
| `ledger` | `POST :investorId/credit`, `GET me` |
| `approvals` | `GET /`, `POST :id/approve`, `POST :id/reject` |
| `distributions` | `POST /`, `POST :id/pay`, `GET /`, `GET :id` |
| `transfers` | `GET holdings`, `POST /`, `GET me` |
| `redemptions` | `POST /`, `GET me`, `GET /`, `POST :id/{fulfill,reject}` |
| `attestations` | `POST /`, `GET /`, `GET latest` |
| `portfolio` | `GET me`, `GET assets/:assetId/documents` |
| `registry`/`reporting` | `GET work-queue`, `GET assets`, `GET health`, `GET assets/:id/registry`, `GET assets/:id/registry.csv`, `GET assets/:id/transfers.csv`, `GET audit` |
| `crm` | `GET follow-ups`, `POST follow-ups/:id/complete`, `PUT :investorId/stage`, `POST :investorId/tags`, `DELETE :investorId/tags/:tag`, `POST :investorId/notes`, `POST :investorId/follow-ups` |
| `notifications` | `GET /`, `GET unread-count`, `POST read-all`, `POST :id/read` |
| `issuers` | `POST /`, `GET /`, `POST :id/{start-review,approve,reject,suspend,reinstate}`, `GET :id/members`, `POST :id/members`, `DELETE :id/members/:userId` |

## `apps/web/` — frontend

```
app/[locale]/(public)/          # homepage, browse, browse/[id]        — anonymous, ISR
app/[locale]/(portal)/          # portfolio(/[assetId]), offerings, funds, onboarding, profile
app/[locale]/admin/             # overview, ops, assets(/[id]), offerings(/[id]), distributions(/[id]),
                                #   investors(/[id]), kyc, approvals, redemptions, registry, audit,
                                #   deposits, security
app/[locale]/{reset-password,verify-email}/
app/api/revalidate/route.ts     # ISR purge webhook (REVALIDATE_SECRET)
components/                     # feature panels + admin/, investor/, public/, ui/ (hand-rolled design system)
lib/api.ts, public-api.ts, session.ts, nav-visibility.ts, i18n.ts, format.ts, onboarding.ts
test/                           # 41 Vitest + Testing Library files
e2e/journey.spec.ts             # Phase-2 exit journey (real browser)
e2e/layout.spec.ts, layout.ts   # assertion-based layout contracts (no pixel baselines)
e2e/seed.ts                     # operator-only setup through the API
playwright.config.ts            # desktop + mobile projects, baseURL from WEB_BASE_URL
```

## `contracts/`

```
src/AttestationRegistry.sol     # anchors signed attestations
src/TrexSuiteLib.sol            # T-REX suite deployment helper
script/Deploy.s.sol             # prints ONCHAINID_CLAIM_ISSUER_ADDRESS= and ATTESTATION_REGISTRY_ADDRESS=
test/AttestationRegistry.t.sol, test/TrexSuite.t.sol
foundry.toml, lib/              # forge deps
```

## Database models and enums (43)

`Tenant`, `Organization`, `PasswordResetToken`, `EmailVerificationToken`, `StaffUser`,
`StaffMembership`, `Approval`, `MfaEnrollment`, `LoginAttempt`, `KycState`(enum),
`AssetState`(enum), `TokenTransfer`, `RedemptionState`(enum), `Redemption`,
`AttestationKind`(enum), `Attestation`, `Asset`, `AssetRight`, `AssetDocument`, `AssetEvent`,
`DistributionState`(enum), `Distribution`, `DistributionPayout`, `OfferingState`(enum),
`Offering`, `OfferingSubscription`, `OfferingAllocation`, `LedgerAccount`, `LedgerEntry`,
`InvestorWallet`, `Investor`, `OnchainIdentity`, `CrmProfile`, `CrmNote`, `CrmFollowUp`,
`OutboxMessage`, `Notification`, `OnboardingApplication`, `KycEvidence`, `OnboardingAnswer`,
`FundingRequest`, `IssuerOrganisation`, `IssuerMembership`.

## Entry points at a glance

| I want to… | Start here |
|---|---|
| Understand a business rule | `services/api/src/domain/<context>/` |
| Change what an endpoint does | `services/api/src/infrastructure/http/<x>.controller.ts` → the use case in `application/` |
| Wire a new adapter | `services/api/src/app.module.ts` (**the only place**) |
| Change the database | `services/api/prisma/schema.prisma` + a hand-written migration |
| Change a screen | `apps/web/app/[locale]/…/page.tsx` + its component in `apps/web/components/` |
| Change chain behaviour | `services/api/src/infrastructure/chain/` |
| Understand why something is the way it is | `docs/open-product-decisions.md`, then `docs/handoff/DECISION_LOG.md` |
