# Product Gap Analysis

*Current system vs the target multi-portal tokenization operating system. Effort key: S (<1 wk), M (1–3 wk), L (3–6 wk), XL (>6 wk of focused work). Work-type key: FE frontend · BE backend · DB schema/migration · SC smart contract · BG background jobs · 3P third-party integration · CP compliance/policy config · MIG data migration · T tests.*

## 1. Portals

| Target portal | Today | Gap | Effort | Work |
|---|---|---|---|---|
| Public website + marketplace | **Nothing** (app is fully auth-gated) | Entire portal: homepage, browse, offering pages, education, disclosures, legal | L | FE, BE (public read API), T |
| Investor portal | Portfolio/Offerings/Profile (3 sections) | 10 more sections; onboarding wizard; checkout flow; documents; notifications; charts | XL | FE, BE, DB, BG, T |
| Issuer / asset-owner portal | **Nothing** (operator does everything) | Entire portal incl. 13-step tokenization wizard | XL | FE, BE, DB, T |
| Operations & compliance console | Admin console (9 sections, 1 officer role) | Queues, cases, maker-checker, tasks, SLAs, granular roles, bulk ops | XL | FE, BE, DB, BG, T |
| Auditor/regulator/provider portal | **Nothing** | Scoped read-only portal | M | FE, BE, T |

## 2. Product model entities

Existing: Investor, Wallet, LedgerAccount, Asset, Offering, Subscription, Allocation, Distribution+Payout, Transfer, Redemption, Valuation(Attestation), Document(asset-scoped), AuditEvent, CRM(profile/note/follow-up).

Missing (all: DB + BE + T; FE where noted): **Tenant, Organization, Issuer, AssetOwner, SPV, TokenizationProject, Token, TokenClass, BeneficialOwner, BankAccount, Payment, JournalEntry/Posting, CorporateAction, ComplianceCase, RiskAlert, Approval, Task, Notification, ServiceProvider, StaffUser/Membership/Role**.

Conflations to unwind: Asset↔Token (token fields live on `assets`; must become Token/TokenClass under a TokenizationProject) · Officer↔Role (env identity) · Valuation↔Attestation (attestation is the anchoring mechanism; valuation needs its own reviewed lifecycle) · Ledger entry↔Journal (single-entry → double-entry).

## 3. Lifecycle state machines

| Machine | Today | Gap |
|---|---|---|
| Investor onboarding | KYC 6-state, enforced+tested | Add email/MFA verification, suitability, agreements, classification, resubmission (Extend) |
| Organization onboarding | — | New |
| Asset onboarding | 6-state, enforced+tested | Add review comments, versioned drafts, RE fields (Extend) |
| Tokenization project | Implicit in `tokenize` action | New explicit machine (config→simulate→approve→deploy→verify) |
| Offering | draft→open→closed_±, enforced+tested | Add announced, cooling-off, extended, cancelled, versioning (Extend) |
| Subscription/Payment | Implicit (hold→capture/refund) | Explicit Payment machine w/ 13 states (New) |
| Distribution | declared→paid, idempotent | Fold into corporate-action machine (Extend) |
| Transfer | Executed-or-rejected (on-chain) | Add requested/preflight/approved for operator-approved mode (Extend) |
| Redemption | requested→fulfilled/rejected | Add queue states (Extend) |
| Corporate action / Compliance case / Valuation / Document review | — | New machines |

All existing transitions are backend-enforced and tested (never UI-only) — that property must be preserved for every new machine.

## 4. Capability gaps by Part

| Area (Part) | Have | Missing (headline) | Effort |
|---|---|---|---|
| Real-estate asset model (4) | Generic asset + 6 doc kinds | ~40 property fields, rights matrix, geo/map, media | M–L |
| Token design studio (5) | Fixed suite deploy w/ symbol | Full config wizard, policy versioning, simulation, deploy receipts, chain abstraction | L |
| Offerings (6) | Fixed-price capped pro-rata | Types, caps, cooling-off, waitlist, versioned terms, sigs, closing report | L |
| Payments/ledger (7) | Conserving single-entry + dev credit | Double-entry, Payment entity, import/matching, reconciliation, treasury maker-checker, receipts | XL |
| Corporate actions (8) | Distributions only | General engine (22 action types), record-date snapshots, announce/execute/reconcile | L |
| Transfer agent / liquidity (9) | Chain-rebuilt registry + CSV; direct transfers | Record-date snapshots, historical cap table, PDF, freeze/forced/recovery flows, liquidity modes, preflight | L |
| Valuation & asset ops (10) | Signed anchored attestation + freshness | Valuer org, review/approve/supersede/dispute, performance reporting (NOI etc.) | M |
| Documents (11) | Immutable IPFS + kinds | Versioning, review states, access policy, acknowledgments, retention, data room UX | L |
| Compliance engine (12) | Manual KYC approve/reject | Cases, screening adapters (mock labeled), risk scoring, monitoring, EDD, restrictions | XL |
| Notifications (13) | — | Whole engine + channels + templates + preferences + delivery log | L |
| Reporting (14) | 2 CSVs + overview | ~24 reports, PDF, scheduling, history | L |
| UX/design system (15) | Solid token base, ~20 components | Charts, stepper, drawer, timeline, skeletons, command bar, data-grid, doc viewer; density/polish pass | L |
| Page redesigns (16) | Routed pages exist | Work-queue overview, portfolio analytics, marketing-grade offering page, tabbed 360s | L |
| Security (17) | See audit §5 | MFA, sessions, rate limits, key mgmt, maker-checker, encryption, CSP, threat mitigations | XL |
| Reliability (18) | Sync happy-path + crash-ordering | Outbox, jobs, tx lifecycle, retries, DLQ, reconciliation jobs, idempotency | L |
| Testing (19) | 616 tests, strong unit/integration | Browser E2E, a11y, migration, failure/idempotency/reconciliation suites, CI | L |

## 5. What is unsafe today (must not reach production as-is)
1. **Single operator EOA** holds every chain power; mnemonic in plaintext `.env`.
2. **Officer identity from env**, one role, no maker-checker — any officer action is unilateral and unrestricted.
3. **No MFA / verification / rate limiting / lockout**; bearer token in sessionStorage.
4. **Ledger credit endpoint** mints fiat balance on operator say-so with no payment evidence (acceptable only as labeled dev adapter).
5. **Synchronous chain writes** in HTTP handlers — an RPC hang blocks requests; no tx lifecycle if a tx stalls.
6. **No CI** — discipline is convention, not enforcement.

## 6. What is strong and must be preserved
Domain purity + TDD culture · bigint Rial with conservation tests · on-chain compliance as the real authority (proven rejection path) · burn-before-pay / persist-then-claim crash ordering · chain-rebuilt holder registry with reconciliation badge · honest freshness degradation · P2 human-first UI (emails/names, chain in chips) · hand-rolled design system + routed app shells · LSP contract tests between fakes and adapters.
