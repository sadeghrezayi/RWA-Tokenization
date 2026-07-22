# Current-State Audit

*Phase 0 audit, 2026-07-22. Every number below was re-verified by running the system on this date — nothing is quoted from memory. Baseline: **616 automated tests passing** (358 API unit, 123 API integration against real Postgres/anvil/IPFS, 126 web component, 9 Foundry), lint and strict typecheck clean across the monorepo.*

## 1. Repository structure

```
apps/web            Next.js 15 App Router (both portals), 21 routes, 52 source files
services/api        NestJS + Prisma (CJS), Clean Architecture, 130 source files
contracts           Foundry: TrexSuiteLib.sol (ERC-3643 suite), AttestationRegistry.sol, Deploy.s.sol
docs                PRD (source of truth) + engineering docs
.claude             governance: core invariants, 2 enforcing + 3 advisory hooks
docker-compose.yml  postgres:16, ipfs/kubo (both healthy)
```

Layering is disciplined: `domain` (pure, bigint money, zero I/O) → `application` (use-cases + ports) → `infrastructure` (Prisma/ethers/Nest adapters); composition root in `app.module.ts` with string DI tokens. LSP contract-test suites pin in-memory fakes to Prisma adapters. 10 Prisma migrations, 19 tables.

## 2. Inventory by layer

### API (57 endpoints, 11 controllers)
| Module | Endpoints | Coverage |
|---|---|---|
| identity/auth | 12 | register, login, officer login, KYC state machine, review queue |
| assets | 9 | propose→structure→documents(IPFS)→custody→checklist→approve→tokenize |
| offerings + ledger | 8 | create/open/subscribe/close (escrow, pro-rata), ledger credit/me |
| distributions | 4 | declare (on-chain snapshot) / pay / list / detail |
| transfers + redemptions | 8 | transfer by email, holdings, redemption request/fulfill/reject |
| attestations | 3 | publish (signed+anchored), latest, history |
| reporting + registry | 6 | asset overview, health, holder registry (+2 CSVs), audit trail |
| crm | 7 | stage, tags, notes, follow-ups |

### Database (19 tables)
investors, onchain_identities, investor_wallets, assets, asset_documents, asset_events, offerings, offering_subscriptions, offering_allocations, ledger_accounts, ledger_entries, distributions, distribution_payouts, attestations, token_transfers, redemptions, crm_profiles, crm_notes, crm_follow_ups.

### Contracts
- `TrexSuiteLib` — deploys a full per-asset ERC-3643 (T-REX) suite: token, IdentityRegistry, TrustedIssuersRegistry, ClaimTopicsRegistry, ModularCompliance. Library (not contract) due to EIP-170.
- `AttestationRegistry` — append-only on-chain anchor of attestation payload hashes.
- Deployment: `Deploy.s.sol` prints env addresses; anvil devnet; deployer = operator EOA from mnemonic.

### Web (21 routes, 2 shells)
- Investor portal `(portal)` group: portfolio / offerings / profile behind AuthPanel.
- Admin console `/admin/*`: 9 sections + 4 entity detail pages behind officer login.
- Hand-rolled design system (zero UI deps): tokens in `globals.css`, ~20 component classes, `components/ui/*` primitives. English-default locale routing (`/en/...`), RTL-capable dictionary architecture.

### Tooling
pnpm workspaces, TS strict (`exactOptionalPropertyTypes`), ESLint + Prettier, Vitest (+SWC), Foundry. **No CI pipeline. No background-job runner. No queue. No log aggregation. No metrics.**

## 3. Feature classification

Legend: **Keep** (correct, retain as-is) · **Refactor** (correct logic, wrong shape for target) · **Extend** (correct core, missing scope) · **Replace** (wrong approach for production) · **Remove** · **Unverified**.

### Domain / business logic
| Feature | Class | Notes |
|---|---|---|
| KYC state machine (draft→…→approved/rejected) | **Extend** | Correct + tested; add KYB, expiry/rescreen, case linkage (Part 12) |
| ONCHAINID deploy + KYC claim on approval | **Keep** | Persist-then-claim ordering pinned by test |
| Custodial HD wallets (`m/44'/60'/1'/0/{i}`) | **Extend** | Works; key custody itself must be replaced (see Security) |
| Asset lifecycle + dossier + checklist gate | **Extend** | Solid FR-AO core; extend to real-estate model, SPV, versioned docs, review comments |
| IPFS document storage (CID + sha256) | **Extend** | Immutability right; needs versioning/status/access-policy layer (Part 11) |
| ERC-3643 per-asset suite deploy on tokenize | **Keep** | Real, devnet-proven, on-chain rejection tested |
| Offering: window/caps/escrow/pro-rata close | **Extend** | Conservation pinned by tests; both close paths e2e. Add soft/hard cap, cooling-off, versioned terms, more offering types |
| Rial ledger: hold/release/capture, guarded atomic updates, append-only entries | **Refactor** | Correct and conserving, but single-entry. Refactor to double-entry journal, preserving current flows + tests (Part 7) |
| Distribution: on-chain snapshot, pro-rata, remainder-to-largest, markPaid idempotent | **Extend** | Generalize into corporate-action engine (Part 8); logic itself retained |
| Transfers: sender-signed ERC-3643 transfer, on-chain compliance authoritative | **Keep** | Non-compliant recipient reverts on-chain (integration-proven) |
| Redemption: fresh-valuation pricing, burn-before-pay | **Keep** | Crash-ordering correct; extend with queue/liquidity modes later |
| Attestations: canonical payload, ECDSA sign, on-chain anchor, freshness blocks actions | **Extend** | FR-OR-3 honesty implemented; extend with reviewer/approval/supersede/expiry model (Part 10) |
| Holder registry rebuilt from chain events, reconciled to totalSupply, CSV export | **Extend** | Transfer-agent core exists; add snapshots at record dates, historical cap table, PDF |
| Audit log (asset_events: actor/details/timestamp) | **Extend** | Good substrate; needs identity-scoped + config-scoped events, hash-chaining optional |
| CRM (stage/tags/notes/follow-ups) + sales view | **Keep** | User-approved scope; slots into Investor 360 tabs |
| Money as integer Rial bigint end-to-end | **Keep** | Documented; no floats anywhere |

### Infrastructure / cross-cutting
| Feature | Class | Notes |
|---|---|---|
| JWT auth (jose) + argon2id + role guard | **Extend** | Sound base; add MFA, sessions, lockout, rate limits |
| sessionStorage token in web | **Replace** | Move to httpOnly cookies + CSRF (known deferral) |
| Officer as env var (`OFFICER_EMAIL/HASH`) | **Replace** | → staff/organization membership + RBAC (Part 3D) |
| Single-role model (investor/officer) | **Replace** | → 14-role RBAC + tenant scoping + maker-checker |
| Operator EOA controls mint/burn/agent/claims; mnemonic in `.env` | **Replace** | Production blocker; → key-management abstraction, role separation, threshold approval (Part 17) |
| Synchronous chain calls in request path | **Refactor** | Works on devnet; production needs tx lifecycle states + background confirmation (Part 18) |
| Ledger credit endpoint simulating bank deposit | **Replace** | → payment import/matching architecture (Part 7); keep as dev adapter |
| Health probe (pg/ipfs/chain/paused) | **Extend** | Grow into observability + reconciliation alerting |
| Locale routing, EN dictionary | **Extend** | Add locale packs, RTL styling pass, translation workflow |
| Design system (hand-rolled) | **Extend** | Right foundation per user mandate; needs Part 15 component growth (charts, stepper, drawer, timeline, skeletons, command bar) |
| Admin/investor app shells (sidebar, routed pages) | **Keep** | Recently rebuilt; matches target IA direction |
| Docker compose (pg + ipfs) | **Extend** | Add job runner, mail dev sink; production topology separate |
| Enforcing repo hooks (secret/catastrophe guards) | **Keep** | |
| CI | **Missing** | No pipeline; must be Phase 1 |

### Explicitly absent (nothing to classify — build new)
Multi-tenancy · organizations/issuers/SPVs · token classes/tokenization projects · public marketplace · issuer portal · auditor/regulator portal · task/approval framework · maker-checker · notifications (any channel) · payments/matching/reconciliation · corporate-action engine beyond distributions · compliance cases/screening · document versioning/review · reporting engine (beyond 2 CSVs) · background jobs/outbox · MFA/email verification/password reset · investor bank accounts/beneficial owners · watchlist/orders UX · charts.

### Unverified
| Item | Why |
|---|---|
| RTL rendering | Architecture supports `dir`; never visually tested with an RTL locale |
| Mobile layouts | Responsive CSS exists (sidebar collapse); only spot-checked, no systematic viewport tests |
| IPFS gateway retrieval path | Store + CID verified; investor download path not exercised end-to-end |
| Anvil-restart operational runbook | Practiced repeatedly in dev, never documented as a runbook |
| `platform-overview/` dir in repo root | Untracked screenshot export (user-unzipped deliverable); not product code |

## 4. Test coverage map (verified today)
| Suite | Count | Depth |
|---|---|---|
| API unit (domain+application) | 358 | Every module TDD'd; conservation, state machines, pro-rata math, freshness, privacy assertions |
| API integration | 123 | Prisma contract suites (LSP), devnet chain tests (mint/transfer/burn/reject), HTTP e2e per module |
| Web | 126 | Component tests incl. shells, modals, panels, format |
| Foundry | 9 | Suite deploy, compliance rejection, attestation anchor |
| **Gaps** | — | No browser E2E (Playwright), no a11y tests, no migration tests, no load tests, no failure-injection tests |

## 5. Security posture summary (details in security-threat-model.md)
Present: argon2id, JWT+role guard, domain-error filter (no stack leaks), parameterized queries (Prisma), secret-guard hooks, gitignored env. Absent/weak: MFA, email verification, password reset, rate limiting, lockout, httpOnly sessions, CSRF, CSP, tenant isolation (N/A yet), object-level authz beyond own-resource checks, PII encryption at rest, log redaction, idempotency keys, webhook signing, dependency audit in CI, key management (plaintext dev mnemonic), single-EOA chain control, no backup/DR docs.

## 6. Verdict
The **domain core is production-grade in design**: clean layering, honest money handling, real on-chain enforcement, strong test culture. What surrounds it is **pilot-grade**: single-operator trust model, no async spine, no payments reality, two portals instead of five, and security hardening deferred. The transformation is therefore an *extension and hardening* program, not a rewrite — nothing in the domain layer needs to be thrown away.
